# TH · Pham Hoang Tuan — OT portfolio

English personal website built from the owner-provided CV. Focus: production networks, MES, software tools, test systems and data analysis. Includes career timeline, education, two in-development projects, printable/downloadable resume, responsive navigation, project search/filter/details, private bookmarks, user profile, verified-email inquiries, request tracking and a verified-owner inbox. No payment processing or invented completed client projects.

## Development

Use existing `/workspace/Thien-Ha`, not a worktree. Node.js 24 and npm:

```sh
npm ci --cache /tmp/th-npm-cache
npm test
npm run build
npm run dev
# Or, after build:
npm run preview -- --port 4173
```

Vite root: `site`; static public assets: `site/public`; output: `dist/web`. Firebase public configuration is in `site/firebase-config.js`; optional overrides require all four VITE_FIREBASE fields from `.env.example`. Do not put server credentials in public files or VITE variables. Fonts and images are self-hosted. Public viewer is the default on first load, including portfolio, project search/details and resume. Workspace and admin sections stay hidden until an appropriate account signs in. Saving projects or submitting an inquiry prompts sign-in. Continue as viewer returns to browsing; sign-out leaves the public site accessible. Contact drafts are retained while signing in and are cleared on sign-out. Firebase Rules continue to protect user data independently.

## Firebase — required production action

The owner has reported working authentication. Enable Email/Password and Google in Firebase Authentication; authorize th.io.vn, www.th.io.vn and q-th.netlify.app. Keep the existing authDomain until the Google custom-domain callback is configured.

**Publish the complete `firestore.rules` in Firebase Console → Firestore Database → Rules.** Older profile-only rules will deny bookmarks, inquiries and the owner inbox. Saving rules in Git does not publish them. `firebase.json` supports a CLI rules-only deployment for an authorized Firebase administrator:

```sh
firebase deploy --only firestore:rules --project th-web-d816f
```

Rules identify admins by Firebase-issued, verified token email: `eric.scorp93@gmail.com` and `tuanpham.x93@gmail.com`. A client checkbox or Firestore role field cannot grant admin access. Both accounts must sign in and have verified email. Other users may read/write only their own profile and bookmarks. They may create inquiries using their own token email and UID, and read only their own inquiries. Only verified owners may read all inquiries, delete them or change status. Status updates cannot alter the sender, original message or timestamps of creation. All unmatched paths deny access.

Owners manage requests through the hidden-unless-owner administration section. Its latest-100 query is ordered by createdAt using Firestore's automatic single-field index. User workspace reads up to 50 requests for the signed-in UID; it does not show all records globally. Data values are rendered as text, never HTML. Inbox email links open the user's mail app; sending an inquiry stores it in Firestore and does not send an email notification automatically.

Profile remains private; contact submissions explicitly require consent. Resume was recreated from the CV, omitting date of birth, gender and detailed residential address. The original CV is not published. Phone and primary email use the current CV. External project references are taken from that CV and are not independently verified as live products.

## Tests

`npm test` runs six unit checks covering configuration, safe auth errors, name bounds, exact verified owner UI identity, inquiry bounds and project references. Browser checks with mocked Firebase responses exercised five viewport sizes (1440×900, 1366×640, 390×844, 360×640, 320×568), login/register/reset, public viewer access, interaction-triggered sign-in, visitor-versus-owner UI, project filtering, details dialogs, privacy, mobile navigation and sign-out. These do not prove live database authorization.

Security assertions are saved in `tests/firestore.security.cjs`. To run them with Node.js 24 and Java 21, install Firebase CLI 15.33.0 and run:

```sh
FIREBASE_EMULATORS_PATH=/tmp/th-firebase-emulators XDG_CONFIG_HOME=/tmp/th-firebase-config firebase emulators:exec --project demo-th-security --only firestore 'node tests/firestore.security.cjs'
```

This targets a **demo project**, not production. Emulator validation was attempted but could not run because downloading the emulator JAR from storage.googleapis.com was blocked. Security tests are unrun; publishing and live validation remain required. They cover outsider/anonymous reads, unverified admin identities, forged UID/email, role injection, bookmark boundaries and status-only updates by each verified owner.

## Deployment

GitHub `main` triggers the existing Netlify project. `netlify.toml`: Node 24, `npm run build`, publish `dist/web`. Check Netlify Published and live HTTPS separately; Git push is not proof a deploy succeeded. Do not change existing DNS.

Google display-name configuration: set TH under Google Auth Platform → Branding. To remove the Firebase hostname from the Google flow, authorize `https://th.io.vn/__/auth/handler` in the OAuth Web client used by Firebase. The Netlify `/__/auth/*` proxy is already prepared; verify it on production before changing authDomain to th.io.vn. Google controls branding display and may require verification. No Google admin configuration was changed by this task.

## Assets and updates

`site/content.js` holds CV-based career/project data. Generated OT hero: `site/public/images/ot-hero.webp`. Portrait is an editorial version of the supplied neon-lit portrait, generated for the navy/cyan palette. Print-friendly resume: `site/public/resume.html`; `resume.pdf` is a generated export. Review career facts before updating. Motion respects prefers-reduced-motion and navigation/forms remain keyboard accessible.
