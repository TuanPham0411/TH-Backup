# TH MES — Supabase / Netlify Free

The independent MES feedback workspace for **mes.th.io.vn** uses Supabase project
**aaosgmphvhjcygldocyi** for Google owner authentication, PostgreSQL, a private
attachment bucket and the mes-api Edge Function. There is no Firebase dependency,
Cloud Functions or Blaze requirement in MES. The portfolio in ../site keeps its
existing Firebase project and Netlify settings.

Only **eric.scorp93@gmail.com**, confirmed through Supabase Google OAuth, is the MES
owner. `hpham` is an owner label, not a password login. Managed operators use the
signed Windows verification flow and receive opaque, server-revocable 12-hour
sessions. Their tokens are hashed in the database and held in sessionStorage in
the browser; signing keys stay out of the frontend and source control.

## Features and boundaries

- Full-width dashboard, status and department charts, activity, issue filters,
  pagination and safe CSV export. Catalogs, users and issues refresh every 15
  seconds, with refresh requests after writes. Reads are batched into one Edge request per
  refresh, and polling pauses in hidden tabs. No production sample data.
- Feedback: display name, owner-managed Team Leader/Department, process, subject,
  detailed description and up to five nonempty files, each at most 10 MB.
- Owner: edit/delete, assess, change priority/status, add comments, inspect complete
  timeline with before/after audit; manage catalogs, users and Windows devices.
- Issues/files require an active verified operator or the sole owner. They are not
  public. Active display names/usernames are exposed before sign-in by design.
- All database operations go through one transactional, service-only dispatcher.
  Tables live in mes_private with RLS, no browser grants and no browser policies.
  Anonymous/authenticated roles cannot invoke the dispatcher. The Edge Function
  validates Google access tokens with Supabase Auth, or passes opaque sessions for
  database verification. It never trusts client-supplied roles or actor identities.
- Storage bucket is private, with no browser object policies. Scoped signed upload
  URLs are issued only for five reserved slots in the first 15 minutes. Supabase
  upload URLs remain valid for two hours once issued, cannot overwrite, and enforce
  bucket size/MIME limits. Attachments are finalized using actual object metadata.
  Downloads are signed for 60 seconds; an issued link can be used until it expires.
- Upload failures leave the already-created issue saved. Do not resubmit it.
  Owner deletion tombstones the issue, removes objects then removes issue/timeline;
  retry deletion if storage cleanup failed. Unfinalized uploads need owner follow-up.
- Supported files: JPG, PNG, WEBP, PDF, TXT, CSV, XLSX. This is not malware scanning.
- Windows proof checks the presence of a matching profile folder under C:\Users,
  not the currently logged-on identity. A protected local agent signs a one-time
  five-minute nonce. User rename/deactivation, device revocation, expiry and logout
  invalidate access. Keep Windows verification enabled; turning it off deliberately
  allows account selection without machine proof. Device keys are software secrets,
  not hardware attestation. See windows-agent/README.txt for installation.

## 1. Apply database migration

Free plan is sufficient for this implementation within its quotas. Do not enable
paid plans if you want no service charges. Free resources can pause or hit limits;
there is no promise of unlimited storage, requests or availability. Review current
Supabase and Netlify plan limits in your accounts. Domain renewal is separate.

Open your project's **SQL Editor**, create a new query and run the complete file:

**supabase/migrations/202610150001_mes.sql**

This creates private tables, the transactional dispatcher, service-role-only grants
and the private mes-attachments bucket. Run it once on a fresh project. Do not open
mes_private as an exposed API schema and do not add permissive public policies.
If the project already has MES Firebase data, it has NOT been imported by this
change. Preserve Firebase until a separate reviewed export/import is complete.
Existing Firebase sessions and old issued challenges do not migrate.

## 2. Enable Google owner login

In Supabase **Authentication → Sign In / Providers → Google**, enable Google and
configure your Google OAuth Client ID/secret directly in the dashboard. Never paste
OAuth secrets into chat, source code or VITE variables.

In Google Cloud Console create/use a Web OAuth client and add this exact authorized
redirect URI (you can add it to an existing client without removing Firebase URIs):

```
https://aaosgmphvhjcygldocyi.supabase.co/auth/v1/callback
```

If Google consent is in Testing mode, add eric.scorp93@gmail.com as a test user.
Google OAuth setup does not require Firebase Blaze.

In Supabase **Authentication → URL Configuration** set Site URL to
`https://mes.th.io.vn` and allow that exact URL plus the exact new Netlify hostname
(https://mes-th.netlify.app). Do not use broad wildcard redirect URLs. Keep Google signup enabled
for the owner's first login; the Edge API rejects every other Google email. Managed
operators do not need Supabase Auth accounts, emails or passwords.

## 3. Deploy the Edge Function

The browser publishable key is already in site/config.js. It does NOT authorize
schema changes or API deployment. Use Supabase CLI in your own trusted terminal
with Node 22+ (or Google Cloud Shell):

```sh
npx --yes supabase@2.121.0 login
cd mes
npx --yes supabase@2.121.0 functions deploy mes-api --project-ref aaosgmphvhjcygldocyi
```

Log in through the CLI's secure flow, never by sharing a token in chat. The included
supabase/config.toml sets verify_jwt=false because operators use opaque Windows
sessions, not Supabase JWTs. **The function performs authorization itself**; turning
off gateway verification does not make data public. Supabase supplies SUPABASE_URL
and SUPABASE_SERVICE_ROLE_KEY to Edge Functions. Never copy the latter to Netlify,
VITE variables, the Windows agent or chat.

For a new Netlify hostname add it to the exact CORS allowlist in the Function's
secrets/settings, for example set MES_ALLOWED_ORIGINS to:

```
https://mes.th.io.vn,https://mes-th.netlify.app
```

Defaults allow https://mes.th.io.vn and https://mes-th.netlify.app. For local development explicitly add the exact
local origin in a local functions environment file. Do not use `*` with sessions.
No Firebase Storage CORS command or Google service-account IAM setup is needed.

Alternatively, to deploy migration plus function via CLI instead of SQL Editor:

```sh
npx --yes supabase@2.121.0 login
bash mes/scripts/deploy.sh
```

This links the project and asks for the database password in your terminal; do not
send it in chat. Do not separately run db push after manually running the same SQL
unless you first reconcile migration history with Supabase CLI migration repair.

## 4. Create a separate Netlify site

Import TuanPham0411/Thien-Ha, branch main, as a **new** Netlify project:

| Setting | Value |
|---|---|
| Base directory | mes |
| Build command | npm run build |
| Publish directory | dist, relative to base |
| Config file | mes/netlify.toml |
| Node | 24 |

Optional public overrides: VITE_MES_SUPABASE_URL and
VITE_MES_SUPABASE_PUBLISHABLE_KEY. Do not set VITE_MES_PREVIEW in production.
Add mes.th.io.vn to this new project and follow its DNS instructions for the mes
record. Keep portfolio project settings, th.io.vn/www records and nameservers.
Complete HTTPS, Supabase redirect URLs and the exact Edge CORS allowlist above.

## 5. Initialize and test live

1. Owner → Continue with Google → eric.scorp93@gmail.com.
2. Create Team Leaders and Departments; create users with the real normalized
   Windows profile folder username and display name. Names must be unique.
3. Register a Windows computer and download its unique device.json immediately.
   The secret is returned once; it cannot be read back from listDevices.
4. Download /downloads/th-mes-agent.zip. Review/install on Windows with trusted
   Python 3.11+; follow its README. Installer uses an interactive scheduled task
   for the installing account, not a SYSTEM service. Shared workstations require
   IT to deploy per account or package a managed service. Allow browser local-network
   access when prompted. Never distribute device keys publicly.
5. Verify a matching user; submit feedback plus an attachment, download it, check
   dashboard and timeline. Owner changes status/assessment/comments; verify the
   operator cannot perform those actions. Revoke the device and confirm denial.
6. Test absent/mismatched Windows folders and another Google account (denied),
   inactive users, expired/replayed proofs, and sign-out clearing private views.

## Local development and verification

```sh
# From repository root, Node 24
npm ci --cache /tmp/th-npm-cache
npm ci --prefix mes --cache /tmp/th-npm-cache
npm test
python3 -m unittest discover -s mes/tests -v
npm run build
npm run build:mes
npm run dev:mes
```

In-memory preview, disconnected from all production services:

```sh
VITE_MES_PREVIEW=true npm run build:mes -- --outDir /tmp/th-mes-preview
```

It has a permanent sample banner and discards changes on refresh. It cannot prove
live authorization. SQL integration checks are in tests/supabase.sql and the
isolated PostgreSQL runner scripts/test-database.sh. The runner stubs only the
Supabase storage.buckets schema/roles needed for migration; it does not emulate
Supabase Auth, Storage HTTP or Google's OAuth service. No production data is used.
Deno type check: `deno task check`; Edge HTTP tests: `deno task test:edge` (from mes).

Current validation: Node tests, Python agent core/protocol tests, SQL migration and
transactional authorization/workflow tests run locally. Browser preview is tested
at desktop/tablet/mobile sizes; production browser checks use mocked API responses.
Live Supabase deployment, Google login, actual Storage requests and real Windows
installation remain unverified until the account setup above is complete.

## Tester and linked Google account update (2026-10-16)

For an existing installation, run only **supabase/migrations/202610160001_tester.sql**
in SQL Editor, then redeploy mes-api from this revision. New installations run
both migrations in timestamp order. This update preserves issues/files/users and
adds one reserved account: display name **Tester**, username **mes.tester**.

The owner signs in with Google, opens the account panel and chooses **Test as user
(Tester)**. The banner stays visible; **Return to owner** exits. Test submissions
and files are real production records marked with reporter Tester, not in-memory
fixtures. Use existing catalogs and delete test issues as owner when finished.
There is no shared Tester password. Tester cannot log in from the public user
selector, Windows challenges or passwordless selection even when Windows policy
is disabled. Every simulated request still requires the verified owner's Google
OAuth token. The server downgrades it to the Tester identity and rejects owner
operations; anonymous users/regular operators cannot forge this mode. This tests
user permissions and submission handling, not Windows agent installation.

Supabase keeps primary provider=email for accounts created with email then linked
to Google. Owner checks now use the Auth-validated JWT's OAuth authentication method
and linked Google identity, not that historical primary-provider value. A password
session remains rejected even when the account has a Google identity. Accounts
with another linked OAuth provider fail closed until their provider handling is
reviewed; the configured MES provider is Google only.

## Bilingual feedback, incident times and image gallery update

Existing installations: run only **supabase/migrations/202610160002_feedback_experience.sql**
after the Tester upgrade above. This upgrade changes the database dispatcher and
preserves existing reports. New installations apply all migration files in order.
The generic mes-api endpoint already forwards the new fields; frontend updates
are delivered through the independent MES Netlify build.

The form automatically uses the signed-in requester, then asks for Department,
Process/Station and feedback content. It no longer asks for a Team Leader or a
separate title; the server derives the internal summary from the first 100
characters of the first content line. Existing Team Leader data is retained for
historical reports. Feedback content is 1–5,000 characters.

Incident times are optional: up to 20 mixed point/range entries, with explicit
start/end datetimes. Local form values convert to ISO UTC for storage; report
views format them in the browser's local timezone. Invalid/reversed ranges and
dates outside 2000–2100 are rejected by both client and database. CSV export
includes the incident times as ISO values.

The VI/EN selector persists in localStorage, defaults to Vietnamese and updates
labels, states and dates. It does not translate or rewrite user names, feedback,
filenames or comments. Switching language preserves the feedback draft and time
rows. Vietnamese font glyphs are self-hosted alongside the Latin font subset.

JPG/PNG/WEBP attachments appear in a report gallery. Clicking opens an accessible
native dialog with Fit/100% controls, double-click zoom toggle, Escape to close
and scroll/pan at natural size. Non-image files retain download controls. Images
are fetched through authenticated, 60-second signed downloads, then rendered as
session-local blob URLs; no public bucket or permanent links are introduced.
A bounded cache avoids repeated image downloads during dashboard refreshes and
is cleared/revoked on auth changes/sign-out. Preview images stay in memory only.

Validation includes the PostgreSQL upgrade and invalid-time/identity assertions,
Node model tests, and mocked browser workflows at 1440, 1024 and 390 pixels for
language persistence, draft preservation, simplified submission, multiple times,
user content preservation, image viewing and layout. Actual live signed image
transfer and upgraded production schema still need deployment/account validation.
