# TH MES — mes.th.io.vn

A separate full-width MES feedback application in the existing repository. It does not replace the TH portfolio. Production Firebase project: **th-mes-web**. The sole owner is **eric.scorp93@gmail.com**, signed in through **Google**. `hpham` is the owner label, not a password account; no `1111` password is embedded anywhere.

## Implemented workflow

- Registered users select their display name, verify the Windows computer, then select an owner-managed Team Leader and Department, enter Process/Station, title and feedback, and attach evidence.
- Shared Dashboard: totals, open/in-progress/resolved/critical counts, 7-day activity, status donut, department bars and recent updates.
- Issue list: search, combined filters, pagination and CSV export. Details include original feedback, authenticated attachment downloads, owner assessment and a timestamped timeline.
- Only the owner may edit/delete issues, set priority/status, assess feedback and post comments. Edits retain before/after fields in timeline audit records. Resubmitting the same attachment metadata does not duplicate the audit event.
- Administration: create/edit/deactivate users and catalog entries, change submission policy, register/revoke Windows agents. Deactivation replaces destructive directory removal so historical issues keep their original labels. Issue deletion is permanent and removes its files and timeline after confirmation.
- All writes go through authenticated Cloud Functions with server-side authorization and validation. Firestore clients, including the owner browser, cannot directly mutate issues or timeline records. The owner can manage through Functions, not a client-side role flag.

## Important access boundaries

Issue data and attachments are **not public**: all active workspace users can read all issues, but they must authenticate. The pre-login selector obtains active display names and usernames from getDirectory; that directory is available before sign-in by design. Do not put confidential information in directory labels.

Windows verification checks **presence of the selected username as a folder under C:\Users**, as requested. It does not prove that this is the currently logged-on Windows account. The browser cannot enumerate the directory. A trusted local agent performs that check and signs a nonce using its protected device key. The backend checks the active device, matching username, challenge expiry and one-time consumption, then issues a Firebase custom token. Verification lasts 12 hours. User/device revocation is also checked by data rules and Functions, not only at sign-in. A person who can extract/copy a device key can impersonate that device; this is software verification, not hardware-backed attestation or corporate SSO.

The policy defaults to requiring Windows verification. The owner may disable it after an explicit warning; doing so intentionally allows account selection without machine proof. Leave it enabled for the requested workflow.

## Build and run

From the repository root (Node 24):

```sh
npm ci --cache /tmp/th-npm-cache
npm test
npm run dev:mes
npm run build:mes
npm run preview:mes
```

Or `cd mes`, `npm ci`, `npm run build` for the independent package used by Netlify. The build output is **mes/dist**. Portfolio output remains dist/web. Functions use **Node 22**, independently of the frontend runtime.

Preview is explicit and isolated from production:

```sh
VITE_MES_PREVIEW=true npm run build:mes -- --outDir /tmp/th-mes-preview
```

It displays a permanent sample-data banner, never connects to the live database, and uses only in-memory state. Refresh discards preview changes. Production builds must not set VITE_MES_PREVIEW. No live production data was used to populate charts.

## Required Firebase setup — owner action

This code is built and tested locally; it is **not deployed to Firebase by committing it**. The execution environment has no authenticated Firebase management session. Do not send tokens, service-account keys or device keys in chat.

1. In Firebase Console select **th-mes-web**, not the portfolio project th-web-d816f.
2. Enable **Blaze billing** for Cloud Functions and Firebase Storage. This is a prerequisite for deployment, not an action performed by this task. Review quotas/budgets in your own account.
3. Authentication → Sign-in method: enable **Google**, using the owner support email. No managed-user passwords or Google sign-in for operators are needed; they receive custom tokens after Windows verification.
4. Authentication → Settings → Authorized domains: add **mes.th.io.vn** and the exact Netlify hostname for the new MES site.
5. Create **Firestore Database** in Production mode if it does not exist (prefer a suitable nearby location such as Singapore). Enable **Storage** and confirm the bucket `th-mes-web.firebasestorage.app`.
6. In an authenticated owner terminal or Google Cloud Shell, obtain this repository and use Node 22. Run `firebase login` if needed, then the reviewed script:

```sh
bash mes/scripts/deploy.sh
```

Equivalent manual deployment from `mes/`:

```sh
npm ci
npm run build
cd functions
npm ci
cd ..
npx --yes firebase-tools@15.33.0 deploy --project th-mes-web --only functions:mes,firestore:rules,storage
```

The Functions region is **asia-southeast1**. Firebase CLI may ask to enable required Google APIs and the Storage service agent's Firestore access for cross-service security rules. That access is necessary for attachment authorization.

7. Authenticated attachment downloads use Storage SDK getBlob rather than public download links. Configure bucket CORS from a Google Cloud terminal:

```sh
gcloud storage buckets update gs://th-mes-web.firebasestorage.app --cors-file=mes/storage-cors.json --project=th-mes-web
```

Run that command at repository root (or use `--cors-file=storage-cors.json` from mes).

8. If custom-token issuance reports `iam.serviceAccounts.signBlob` permission denied: enable the IAM Service Account Credentials API, identify the actual runtime service account in the deployed Function details, and give it **Service Account Token Creator on itself only**. Do not grant that role broadly to users. Runtime identity also needs Firestore read/write, Firebase Authentication user management and bucket object access. Do not solve IAM errors by weakening data rules.

No Firebase management deployment has been executed by the agent. A read-only management access check returned authentication required. Billing/API/resource activation, real Rules enforcement and actual custom-token issuance remain unverified until this setup is complete.

## Second Netlify project and DNS

Create a **new** Netlify project from `TuanPham0411/Thien-Ha`, branch main:

| Setting | Value |
|---|---|
| Base directory | `mes` |
| Build command | `npm run build` |
| Publish directory | `dist` (relative to base) |
| Config file | `mes/netlify.toml`, discovered from base |

Do not change the existing portfolio Netlify project's base/build/publish settings. The public Firebase web config supplied by the owner is in mes/site/config.js; no additional public variables are required. Overrides use VITE_MES_FIREBASE_*.

After a successful new Netlify deployment, add **mes.th.io.vn to the new MES project**, not as an alias of the portfolio project. In the existing Netlify DNS zone for th.io.vn, add the mes CNAME/record exactly as instructed by the new project. Keep existing apex/www records and nameservers unchanged. Verify HTTPS and Firebase authorized domains.

## Owner initialization

1. Visit the MES site → account button → Owner → Continue with Google.
2. Use **eric.scorp93@gmail.com**. The server verifies this exact email, email verification and Google's sign-in provider; no other portfolio admin automatically gets MES permissions.
3. Add Team Leaders and Departments in Administration.
4. Create users with the real Windows **profile folder name**, normalized to lowercase, and their display names. Duplicate usernames are rejected. Renaming a username invalidates its previous Windows proof and requires reverification; display-name changes preserve historical reporter labels.
5. Register a device. Download its unique **device.json** immediately; the key is shown once. The server never returns signing keys from listDevices or Firestore client reads.
6. Download the Windows agent bundle from the User sign-in panel or `/downloads/th-mes-agent.zip`. Follow its README and reviewed install.ps1 on the Windows computer. A trusted Python 3.11+ installation is required.
7. The installer creates an interactive scheduled task for the account running installation, not a SYSTEM service. For shared workstations with different login accounts, IT must deploy the task per account or package a managed service. Allow Chrome/Edge local-network access when prompted. Locked-down company browsers may require an IT policy change; this cannot be bypassed by website JavaScript.

## Attachments and failure behavior

Maximum 5 attachments, each nonempty and no larger than 10 MB. Types: JPG/PNG/WEBP, PDF, TXT, CSV, XLSX. CSV/empty MIME values from Windows file pickers are normalized for known extensions. These format limits are not malware scanning.

The server allocates exactly five random upload slots. Storage allows create-only writes by the submitter/owner for 15 minutes after issue creation. Arbitrary paths, overwrites and client deletions are denied. Completed files are attached by a server call that checks actual Storage metadata. Access uses authenticated blob downloads; no public permanent URLs are stored in issue data.

If uploading fails, the already-created feedback remains saved and the UI reports its ID; **do not submit a duplicate issue**. Successfully uploaded files are finalized when possible. Unfinished attachments require owner follow-up; no automatic email notifications or offline delivery guarantees are provided. CSV export protects spreadsheet formula prefixes and escapes cell delimiters.

## API reference (Firebase callable protocol)

All endpoints are deployed in asia-southeast1 for th-mes-web. The web SDK supplies Firebase ID tokens on calls requiring authentication.

| Endpoint | Access / purpose |
|---|---|
| getDirectory | Pre-login active display names/usernames and policy |
| getSession | Validate current managed Windows session or the Google owner |
| startWindowsChallenge | Issue a 5-minute challenge for an active username |
| completeWindowsChallenge | Consume one valid signed proof and issue a custom token |
| loginManagedUser | Allowed only when owner explicitly disables Windows policy |
| manageDirectory / manageUser | Owner-managed catalogs and accounts |
| setPolicy | Owner-only submission verification policy |
| registerDevice / listDevices / revokeDevice | Owner-only device lifecycle; secret returned once on registration |
| createIssue / attachFiles | Validated member submission and attachment finalization |
| updateIssue / addComment / deleteIssue | Owner-only edits, handling, audit and removal |

createIssue is rate-limited to ten submissions per ten minutes per account. Challenges have a short cooldown; expired challenge records are cleaned daily by the scheduled cleanExpiredChallenges Function. Dashboard and issue list load all available feedback, with client-side filtering and display pagination. Timeline is complete for the selected issue. Larger deployments can later move aggregations and search to the server without changing these access rules.

## Validation and remaining limits

- Root `npm test`: 15 passing unit tests, including owner identity, proof tampering, expiry/replay conditions, feedback validation, attachment bounds, chart statistics and CSV injection protection.
- `python3 -m unittest discover -s mes/tests -v`: 4 passing local-agent core/protocol tests. This is not a Windows installation test.
- Functions module loads and passes syntax checks under Node 22.
- Browser preview checks passed at 1920, 1440, 1024 and 390 pixels: charts, filters, owner updates, comments, edit audit, sample attachments, creation/deletion, directories, users and CSV. These use sample in-memory data, not live Firebase.
- Security emulator assertions are saved in mes/tests/security.cjs. Firestore emulator download is blocked by the environment proxy (HTTP 403 from storage.googleapis.com), so these tests have **not run**. Do not claim production authorization has been verified.

With Firebase CLI, Java 21 and emulator download access, from mes run:

```sh
FIREBASE_EMULATORS_PATH=/tmp/th-firebase-emulators XDG_CONFIG_HOME=/tmp/th-firebase-config firebase emulators:exec --project demo-th-mes --only firestore,storage 'node tests/security.cjs'
```

The root dev dependency @firebase/rules-unit-testing is used by that test. Never run tests against th-mes-web production data. After deployment validate real owner Google sign-in; an actual Windows proof; missing/mismatched profiles; inactive/revoked users/devices; expired/replayed proofs; file upload/download; viewer read-only restrictions; owner-only status changes and timeline audit. The current machine is Linux and cannot verify Windows installation, scheduled tasks or company browser networking.
