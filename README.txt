DEPLOY ON NETLIFY
1. Replace the files in your GitHub repo (or CLI project) with these files, keeping the same folder structure:
     index.html, netlify.toml, package.json, netlify/functions/api.mjs
   Drag-and-drop deploys do NOT build functions, so use Git or the Netlify CLI.
2. Create a Gmail App Password for eleazar.reco@gmail.com:
     Google Account > Security > turn on 2-Step Verification, then Security > App passwords > create one (name it "Ticket Desk").
     Copy the 16-character code (no spaces needed).
3. Netlify > Site configuration > Environment variables, add:
     GMAIL_APP_PASSWORD   the 16-character app password
   Optional: GMAIL_USER (default eleazar.reco@gmail.com), OFFICE_EMAIL (default office@primeaccesswireless.com),
             MASTER_USER / MASTER_PASS (default Backoffice/Backoffice), TOKEN_SECRET (any long random text),
             TZ_NAME (time zone for the email date, default America/Chicago)
   Remove RESEND_API_KEY and FROM_EMAIL; they are no longer used.
4. Redeploy (new variables only apply after a fresh deploy). Raise a test ticket.

NEW: Deleting a ticket (Master login > ticket > Delete) emails a 6-digit code from eleazar.reco@gmail.com to eleazar.reco@gmail.com. The code expires in 10 minutes and allows 5 attempts.
NEW: Master login shows an Activity log (logins, tickets raised, emails sent/failed, config changes, ETA updates, deletions).
