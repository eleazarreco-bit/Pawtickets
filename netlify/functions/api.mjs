import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

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
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    return "GMAIL_USER or GMAIL_APP_PASSWORD is not set in Netlify environment variables.";
  }

  const body = `Ticket ${t.id}\\nRaised by: ${t.name} (${t.email})\\nStore: ${t.store}\\nCategory: ${t.category}\\nPriority: ${t.priority}\\n\\nSubject: ${t.subject}\\n\\n${t.details}`;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  try {
    await transporter.sendMail({
      from: `Ticket Desk <${gmailUser}>`,
      to: OFFICE,
      subject: `[${t.priority}] ${t.id} - ${t.subject}`,
      text: body,
      ...(t.email ? { replyTo: t.email } : {}),
    });
    return true;
  } catch (e) {
    console.error("Gmail SMTP error", e);
    return "Gmail SMTP: " + String(e.message || e);
  } finally {
    transporter.close();
  }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const cfgStore = getStore("config"), tkStore = getStore("tickets"), etaStore = getStore("etas");

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
      let emailed = false, emailError = "";
      try { const r = await sendEmail(t); emailed = r === true; if (!emailed) emailError = r; } catch (e) { emailError = String(e.message || e); }
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
      return b.user === USER && b.pass === PASS ? json({ token: makeToken() }) : json({ error: "Invalid credentials" }, 401);
  }

  if (!okToken(b.token)) return json({ error: "Session expired. Log in again." }, 401);

  switch (b.action) {
    case "adminConfig": return json(await getCfg(cfgStore));
    case "saveConfig": {
      const cats = (Array.isArray(b.categories) ? b.categories : []).map((x) => clip(x, 100)).filter(Boolean);
      const people = (Array.isArray(b.people) ? b.people : []).map((p) => ({ name: clip(p.name, 100), email: clip(p.email, 150) })).filter((p) => p.name && /^\S+@\S+\.\S+$/.test(p.email));
      await cfgStore.setJSON("main", { categories: cats, people });
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
    case "setEta":
      await etaStore.setJSON(clip(b.id, 30), { eta: clip(b.eta, 10), status: ["Open", "In progress", "Resolved", "Closed"].includes(b.status) ? b.status : "Open", updated: Date.now() });
      return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api" };
