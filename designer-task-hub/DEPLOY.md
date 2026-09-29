# Deploying Design Task Hub

The platform is a static site on **Firebase Hosting**, with **Firebase
Authentication** (email and password) for accounts and **Cloud Firestore** for
data. Role based access is enforced by `firebase/firestore.rules` on Google's
servers, so nobody can read or change another role's data by editing the page.

It fits in Firebase's free Spark plan for a team of this size (50,000 reads
and 20,000 writes a day). You need Node.js 20 or later and a Google account.

## 1. Create the Firebase project

1. Open <https://console.firebase.google.com>, choose **Add project**, name it
   (for example `knolskape-design-hub`). Google Analytics is not needed.
2. In the project, open **Build > Firestore Database > Create database**.
   Pick **Production mode** and a region close to the team (for example
   `asia-south1`, Mumbai). The region cannot be changed later.
3. Open **Project settings > General > Your apps**, add a **Web app** (the
   `</>` icon). Skip "Firebase Hosting setup" there. Copy the `apiKey`,
   `authDomain`, `projectId` and `appId` values it shows.

## 2. Set up sign-in

In **Build > Authentication > Get started**:

1. **Sign-in method**: enable **Email/Password**. Leave "Email link
   (passwordless sign-in)" off.
2. **Settings > Password policy**: turn on enforcement and require upper case,
   lower case, a number and a special character, minimum length 10. The page
   checks the same rule, and this makes the server enforce it too.
3. **Settings > User actions**: keep **Email enumeration protection** on, so the
   sign-in and reset forms never reveal whether an email has an account.
4. **Settings > Authorized domains**: `<project>.web.app` and
   `<project>.firebaseapp.com` are there already. Add your own domain here if
   you connect one (step 5).
5. **Templates** (optional): set the sender name to "Design Task Hub" and adjust
   the wording of the verification and password reset emails.

## 3. Fill in the settings file

Edit `web/firebase-config.js`:

```js
window.DTH_CONFIG = {
  firebase: { apiKey: "...", authDomain: "....firebaseapp.com", projectId: "...", appId: "..." },
  ownerEmail: "manu.nair@knolskape.com",
  allowedDomain: "knolskape.com",
};
```

- `ownerEmail` is the one account that becomes the Owner. It is written into the
  security rules at build time, so nobody can make themselves Owner later.
- `allowedDomain` limits accounts to official emails. Other addresses cannot be
  invited, cannot request access, and the rules refuse them.

These Firebase values are public identifiers, not passwords. They are safe to
commit; the security rules are what protect the data.

## 4. Build and deploy

```
cd designer-task-hub
npm install
npx firebase login
cd firebase && npx firebase use --add      # pick your project, alias "default"
cd ..
npm run deploy                             # builds, then deploys hosting and rules
```

`npm run deploy` runs `npm run build` (the site into `dist-web/` and
`firebase/firestore.rules` from the template with your owner email and domain)
and then `firebase deploy --only hosting,firestore:rules`. Run it again whenever
you change the app or the settings file.

The site is now live at `https://<project>.web.app`.

## 5. First sign-in and inviting the team

1. Open `https://<project>.web.app/#owner`, choose **Create your account** and
   sign up with the owner email. Confirm the email from the message you get,
   then press **I've confirmed my email**. You land on the Owner Dashboard.
   The lists (4E lines and products, subtask types, designers, PMs, projects)
   start with the workbook's values; change them under **Lists & 4E**.
2. Under **People & access**, invite each person with their official email,
   pick their **Role** (product manager or product designer) and their name on
   the tracker, then use **Copy invitation message** and send it to them.
   Nothing is emailed automatically for invitations.
3. They open their link (`#pm` or `#designer`), create an account with the
   invited email and confirm it. The invitation is used up and they land in
   their own interface. You can change a role or remove access any time from
   **Members**; the change takes effect immediately, and it's recorded under
   **Access history**.

Someone who signs up without an invitation sees a **Request access** form. You
approve or decline it under **Access requests**.

## Custom domain (optional)

**Hosting > Add custom domain**, follow the DNS steps, then add the domain in
**Authentication > Settings > Authorized domains** so sign-in and email links
work on it.

## Sign-in behaviour

- Passwords: at least 10 characters with upper and lower case, a number and a
  symbol. Show or hide while typing. Failed sign-ins clear the password field
  and give the same message for a wrong email or a wrong password.
- New accounts must confirm their email before they see anything.
- **Forgot password?** sends a reset link and always answers the same way,
  whether or not the account exists. Firebase limits repeated attempts.
- **Keep me signed in** keeps the session on that device. Without it the
  session ends when the browser closes, and after 30 minutes of inactivity
  (with a 2 minute warning).
- Signing out warns if something typed is not saved, then clears it from the
  device. Each person can change their name and password under
  **Account settings** in the account menu (it asks for the current password).
- Last sign-in per person shows under **Members**.

## Testing locally

```
npm test               # workbook export and Excel formula parity
npm run test:rules     # security rules against the Firestore emulator (needs Java 11+)
npm run test:ui        # browser walk-through of every flow with an in-memory backend
```

To click through against local emulators instead of the live project, set
`firebase: { apiKey: "demo", authDomain: "localhost", projectId: "demo-dth", appId: "demo" }`
and uncomment the `emulators` line in `web/firebase-config.js`, then
`npm run build && npm run serve` and open <http://127.0.0.1:5000/#owner>.
The Auth emulator prints verification and reset links in its log instead of
emailing them. Put the real values back before deploying.

## Backups

Download the Excel workbook from **Export to Excel** regularly; it holds every
task, update, leave entry and funnel decision. For automatic backups, upgrade
to the Blaze plan and turn on Firestore scheduled backups.

## Troubleshooting

| You see | Do this |
|---|---|
| "The platform isn't connected to its backend yet" | `web/firebase-config.js` is empty. Fill it in, then `npm run deploy`. |
| "You don't have permission" after deploying | The rules were not deployed or were built with another owner email. Run `npm run deploy` again. |
| Verification or reset email never arrives | Check spam; check the domain is listed under Authorized domains. |
| The owner lands on "Request access" | The account email does not match `ownerEmail` exactly. Fix the file and redeploy. |
