TICKET DESK - GMAIL EMAIL SETUP

DEPLOY
1. Upload this folder to your GitHub repository connected to Netlify, or deploy with Netlify CLI.
2. Do not use drag-and-drop deploys; Netlify Functions need a build/deploy workflow.
3. In Netlify > Site configuration > Environment variables, add:
   GMAIL_USER = eleazar.reco@gmail.com
   GMAIL_APP_PASSWORD = your 16-character Google App Password (no spaces)
   OFFICE_EMAIL = office@primeaccesswireless.com
   Optional existing settings:
   MASTER_USER, MASTER_PASS, TOKEN_SECRET
4. Trigger a fresh deploy after adding/changing variables.

CREATE A GOOGLE APP PASSWORD
1. Sign in to the Google account eleazar.reco@gmail.com.
2. Turn on 2-Step Verification in Google Account > Security.
3. Open Google Account > Security > App passwords.
4. Create an app password named "Netlify Ticket Desk".
5. Copy the 16-character password and put it in Netlify as GMAIL_APP_PASSWORD.
   Do not use your normal Gmail password.
6. If Google does not show App passwords, the account may not be eligible (for example, Advanced Protection, a managed work/school account, or 2-Step Verification not enabled).

EMAIL BEHAVIOUR
- Every successfully created ticket triggers an email from eleazar.reco@gmail.com to office@primeaccesswireless.com.
- The ticket raiser's email is not CC'd. Replies can be sent to the ticket raiser's email using Reply.
- Tickets are still saved even if email delivery fails; the page displays the email error.
- Never put the App Password or other secrets in index.html or browser JavaScript.

SECURITY
- Keep GMAIL_APP_PASSWORD secret. Do not share it or commit it to GitHub.
