import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import { createHmac, timingSafeEqual, randomInt } from "node:crypto";

const OFFICE = process.env.OFFICE_EMAIL || "office@primeaccesswireless.com";
const USER = process.env.MASTER_USER || "Backoffice";
const PASS = process.env.MASTER_PASS || "Backoffice";
const SECRET = process.env.TOKEN_SECRET || ("ts-" + PASS);

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const sign = (p) => createHmac("sha256", SECRET).update(p).digest("hex");
const makeToken = () => { const exp = Date.now() + 8 * 3600e3; return exp + "." + sign(String(exp)); };
const okToken = (t) => {
  if (!t || !t.includes(".")) return false;
  const [exp, sig] = t.split(".");
  if (Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
};
const clip = (v, n) => String(v ?? "").slice(0, n);

async function getCfg(store) {
  return (await store.get("main", { type: "json" })) || { categories: [], people: [] };
}

async function sendEmail(t) {
  const user = process.env.GMAIL_USER || "eleazar.reco@gmail.com";
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return "GMAIL_APP_PASSWORD is not set in Netlify environment variables.";
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  const when = new Date(t.created).toLocaleString("en-US", { timeZone: process.env.TZ_NAME || "America/Chicago" });
  const text = [
    `Ticket ID: ${t.id}`, `Date raised: ${when}`, `Priority: ${t.priority}`, `Category: ${t.category}`,
    `Raised by: ${t.name}`, `Email: ${t.email}`, `Store / location: ${t.store || "-"}`,
    ``, `Subject: ${t.subject}`, ``, `Details:`, t.details,
  ].join("\n");
  const h = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const row = (k, v) => `<tr><td style="padding:6px 12px;font-weight:bold;background:#f5f3ff">${k}</td><td style="padding:6px 12px">${h(v)}</td></tr>`;
  const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${row("Ticket ID", t.id)}${row("Date raised", when)}${row("Priority", t.priority)}${row("Category", t.category)}${row("Raised by", t.name)}${row("Email", t.email)}${row("Store / location", t.store || "-")}${row("Subject", t.subject)}</table><p style="font-family:Arial,sans-serif;font-size:14px"><b>Details:</b><br>${h(t.details).replace(/\n/g, "<br>")}</p>`;
  try {
    await transporter.sendMail({
      from: `"Ticket Desk" <${user}>`, to: OFFICE, replyTo: t.email || undefined,
      subject: `[${t.priority}] ${t.id} - ${t.subject}`, text, html,
    });
    return true;
  } catch (e) {
    console.error("Email error", e);
    return "Email: " + (e.message || "send failed");
  }
}

async function sendDeleteCode(code, t) {
  const user = process.env.GMAIL_USER || "eleazar.reco@gmail.com";
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return "GMAIL_APP_PASSWORD is not set in Netlify environment variables.";
  try {
    await nodemailer.createTransport({ service: "gmail", auth: { user, pass } }).sendMail({
      from: `"Ticket Desk" <${user}>`, to: user,
      subject: `Ticket deletion code: ${code}`,
      text: `Your 6-digit authorization code to delete ticket ${t.id} is ${code}.\n\nTicket: ${t.subject}\nRaised by: ${t.name}\n\nThe code expires in 10 minutes. If you did not request this, ignore this email.`,
    });
    return true;
  } catch (e) { console.error("Code email error", e); return "Email: " + (e.message || "send failed"); }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const cfgStore = getStore("config"), tkStore = getStore("tickets"), etaStore = getStore("etas");
  const logStore = getStore("logs"), codeStore = getStore("codes");
  const ip = req.headers.get("x-nf-client-connection-ip") || "";
  const log = async (type, actor, detail) => {
    try { await logStore.setJSON(String(Date.now()).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 6), { t: Date.now(), type, actor, detail: clip(detail, 400), ip }); } catch {}
  };

  switch (b.action) {
    case "config": {
      const c = await getCfg(cfgStore);
      return json({ categories: c.categories, people: c.people.map((p, i) => ({ id: i, name: p.name, masked: p.email })) });
    }
    case "create": {
      const c = await getCfg(cfgStore);
      const p = c.people[Number(b.personId)];
      const t = {
        id: "T-" + Date.now().toString(36).toUpperCase(),
        name: p ? p.name : "", email: p ? p.email : "", store: clip(b.store, 100),
        priority: ["Low", "Medium", "High", "Urgent"].includes(b.priority) ? b.priority : "Medium",
        category: clip(b.category, 100), subject: clip(b.subject, 200), details: clip(b.details, 5000),
        created: Date.now(),
      };
      if (!p || !t.subject || !t.details || !c.categories.includes(t.category))
        return json({ error: "Missing or invalid fields" }, 400);
      await tkStore.setJSON(t.id, t);
      await log("Ticket raised", t.name, `${t.id} · ${t.category} · ${t.priority} · ${t.subject}`);
      let emailed = false, emailError = "";
      try { const r = await sendEmail(t); emailed = r === true; if (!emailed) emailError = r; } catch (e) { emailError = String(e.message || e); }
      await log(emailed ? "Email sent" : "Email failed", "System", emailed ? `${t.id} sent to ${OFFICE}` : `${t.id}: ${emailError}`);
      return json({ id: t.id, emailed, emailError });
    }
    case "track": {
      const c = await getCfg(cfgStore);
      const p = c.people[Number(b.personId)];
      const t = await tkStore.get(clip(b.id, 30).toUpperCase(), { type: "json" });
      if (!t || !p || t.email.toLowerCase() !== p.email.toLowerCase()) return json({ error: "No matching ticket for this person" }, 404);
      const e = (await etaStore.get(t.id, { type: "json" })) || {};
      return json({ id: t.id, subject: t.subject, category: t.category, priority: t.priority, created: t.created, eta: e.eta || "", status: e.status || "Open" });
    }
    case "login":
    {
      const good = b.user === USER && b.pass === PASS;
      await log(good ? "Master login" : "Failed login", good ? "Master" : clip(b.user, 40) || "unknown", good ? "Logged in" : "Wrong username or password");
      return good ? json({ token: makeToken() }) : json({ error: "Invalid credentials" }, 401);
    }
  }

  if (!okToken(b.token)) return json({ error: "Session expired. Log in again." }, 401);

  switch (b.action) {
    case "adminConfig": return json(await getCfg(cfgStore));
    case "saveConfig": {
      const old = await getCfg(cfgStore);
      const cats = (Array.isArray(b.categories) ? b.categories : []).map((x) => clip(x, 100)).filter(Boolean);
      const people = (Array.isArray(b.people) ? b.people : []).map((p) => ({ name: clip(p.name, 100), email: clip(p.email, 150) })).filter((p) => p.name && /^\S+@\S+\.\S+$/.test(p.email));
      await cfgStore.setJSON("main", { categories: cats, people });
      for (const c of cats) if (!old.categories.includes(c)) await log("Category added", "Master", c);
      for (const c of old.categories) if (!cats.includes(c)) await log("Category removed", "Master", c);
      const key = (p) => p.name + " <" + p.email + ">";
      for (const p of people) if (!old.people.some((o) => key(o) === key(p))) await log("Person added", "Master", key(p));
      for (const p of old.people) if (!people.some((o) => key(o) === key(p))) await log("Person removed", "Master", key(p));
      return json({ ok: true });
    }
    case "adminTickets": {
      const { blobs } = await tkStore.list();
      const out = [];
      for (const x of blobs) {
        const t = await tkStore.get(x.key, { type: "json" });
        const e = (await etaStore.get(x.key, { type: "json" })) || {};
        if (t) out.push({ ...t, eta: e.eta || "", status: e.status || "Open" });
      }
      return json(out.sort((a, b) => b.created - a.created));
    }
    case "setEta": {
      const id = clip(b.id, 30);
      const status = ["Open", "In progress", "Resolved", "Closed"].includes(b.status) ? b.status : "Open";
      const eta = clip(b.eta, 10);
      await etaStore.setJSON(id, { eta, status, updated: Date.now() });
      await log("ETA / status updated", "Master", `${id} · status ${status} · ETA ${eta || "not set"}`);
      return json({ ok: true });
    }
    case "requestDelete": {
      const id = clip(b.id, 30);
      const t = await tkStore.get(id, { type: "json" });
      if (!t) return json({ error: "Ticket not found" }, 404);
      const code = String(randomInt(100000, 1000000));
      await codeStore.setJSON("del-" + id, { hash: sign(code + id), exp: Date.now() + 10 * 60e3, tries: 0 });
      const r = await sendDeleteCode(code, t);
      await log(r === true ? "Delete code sent" : "Delete code failed", "Master", r === true ? `${id}: code emailed to ${process.env.GMAIL_USER || "eleazar.reco@gmail.com"}` : `${id}: ${r}`);
      return r === true ? json({ ok: true }) : json({ error: "Could not send the code. " + r }, 500);
    }
    case "confirmDelete": {
      const id = clip(b.id, 30);
      const rec = await codeStore.get("del-" + id, { type: "json" });
      if (!rec || rec.exp < Date.now()) return json({ error: "Code expired. Request a new one." }, 400);
      if (rec.tries >= 5) { await codeStore.delete("del-" + id); return json({ error: "Too many wrong attempts. Request a new code." }, 400); }
      const code = clip(b.code, 6);
      const a1 = Buffer.from(sign(code + id)), a2 = Buffer.from(rec.hash);
      if (a1.length !== a2.length || !timingSafeEqual(a1, a2)) {
        await codeStore.setJSON("del-" + id, { ...rec, tries: rec.tries + 1 });
        await log("Delete failed", "Master", `${id}: wrong authorization code`);
        return json({ error: "Incorrect code." }, 400);
      }
      const t = await tkStore.get(id, { type: "json" });
      await tkStore.delete(id); await etaStore.delete(id); await codeStore.delete("del-" + id);
      await log("Ticket deleted", "Master", t ? `${id} · ${t.subject} · raised by ${t.name}` : id);
      return json({ ok: true });
    }
    case "adminLog": {
      const { blobs } = await logStore.list();
      const keys = blobs.map((x) => x.key).sort().reverse().slice(0, 300);
      const out = [];
      for (const k of keys) { const e = await logStore.get(k, { type: "json" }); if (e) out.push(e); }
      return json(out);
    }
  }
  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api" };
