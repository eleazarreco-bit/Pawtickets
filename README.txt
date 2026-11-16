DEPLOY ON NETLIFY
1. Put this folder in a GitHub repo (or use `netlify deploy` from the CLI). Drag-and-drop deploys do NOT build functions, so use Git or CLI.
2. Site settings > Environment variables:
   RESEND_API_KEY  (from resend.com, needed for email)
   FROM_EMAIL      e.g. "Ticket Desk <tickets@yourdomain.com>" (domain verified in Resend)
   Optional: MASTER_USER, MASTER_PASS (default Backoffice/Backoffice), TOKEN_SECRET (any long random text), OFFICE_EMAIL
3. Deploy. Storage uses Netlify Blobs automatically; nothing to set up.
