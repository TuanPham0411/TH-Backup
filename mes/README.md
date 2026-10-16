# MES deployment

Production now runs on Raspberry Pi with local PostgreSQL, local private file storage, local password sessions and backend Google OAuth. See [repository README](../README.md) and [Pi deployment guide](../deploy/README.md).

The notes below describe the historical Supabase implementation and are retained only as reference. Do not use those deployment commands for the Pi release.

# TH MES — Supabase / Netlify Free

Independent feedback workspace for **mes.th.io.vn** / **mes-th.netlify.app**.
Supabase project: **aaosgmphvhjcygldocyi**. The portfolio in ../site retains its
existing Firebase configuration; MES has no Firebase dependency or paid-service
requirement. Free-plan quotas still apply to storage, traffic and Edge requests.

## Account model

- The owner provisions usernames in Administration. There is no public signup.
- Creating an account returns a private **one-time activation link**, valid for
  **72 hours**. Share it directly with that user. They choose their own password
  on first use; no email delivery service or Windows agent is required.
- Passwords require at least 10 characters and at most 72 UTF-8 bytes. PostgreSQL
  pgcrypto bcrypt (cost 10) stores only hashes. Activation codes and 12-hour session
  tokens are 256-bit random values, also stored only as hashes. The activation
  secret is in a URL fragment and removed from the address bar when opened.
- Owner account **hpham** is reserved in the database. Bootstrap is performed only
  by the project owner through SQL Editor, never through an anonymous endpoint.
  The optional Google owner login remains limited to the confirmed
  **eric.scorp93@gmail.com** OAuth identity. A linked email/password Supabase Auth
  session is not accepted as Google proof.
- Owners can create/rename, disable/restore accounts and issue replacement links.
  Replacement activation revokes the previous password, codes and sessions.
  Renaming/disabling, password changes and sign-out revoke sessions on the server.
  Restoring an account never resurrects revoked sessions. Password resets require
  an administrator; there is no SMTP dependency. Reserved owner/Tester accounts
  cannot be reset, renamed or disabled through user-management APIs.
- Users edit their own display name, contact email, phone and job title. Updating
  contact email does not change login or grant privileges. User-provided roles or
  target user IDs cannot change the acting identity. Historical ticket labels
  remain unchanged.
- **My dashboard** and **My tickets** are filtered by the authenticated user ID
  inside PostgreSQL. The shared dashboard and issue list remain available to all
  active members. Ticket details, progress, timeline and attachments remain shared
  within the workspace; this is not private per-ticket access control.
- The legacy name-selection/Windows sign-in endpoints and legacy sessions are
  disabled after this update. Existing user IDs and tickets are retained. Issue a
  new activation link for each existing user to enable password access.
- Login/activation and current-password checks allow 10 attempts per account in a
  15-minute window. Counters persist even after failed attempts. This is not a
  replacement for infrastructure-level abuse protection.

## Deploy this update (database + API + frontend are all required)

### 1. Supabase SQL Editor

Open the correct project → **SQL Editor → New query**. Run the **entire** file:

**[supabase/install-accounts.sql](supabase/install-accounts.sql)**

This generated installer applies every MES migration in one transaction, supports
both fresh and existing databases, preserves data and can be rerun. Do not run
only part of the file or edit dollar-quote delimiters. It restores service-only
API grants and creates the private attachment bucket. Do not expose mes_private
or add anonymous table/storage policies.

At the end, `owner_activation` contains username **hpham** and a private
`activationCode` if the owner has not activated yet. Do not post this result in
chat or commit it. On the website select **Activate account**, enter hpham and that
code, then choose your password. If the result is `already-activated`, use your
existing password. To obtain another code before first activation:

```sql
SELECT public.mes_issue_owner_activation();
```

For recovery of an already activated owner, the project owner can explicitly
revoke its password/sessions and issue a new code **in SQL Editor only**:

```sql
SELECT mes_private.issue_account_activation('mes-owner');
```

The owner-bootstrap function and private helpers have no browser/public execution
grants. These SQL commands require project-owner database access.

If using migrations through the Supabase CLI instead, `supabase db push` applies
202610160004_accounts.sql after previous migrations. Then run the bootstrap query
in SQL Editor. Use either migration deployment or the full SQL Editor installer.
If mixing methods later, reconcile CLI migration history first.

### 2. Deploy the Edge API from Cloud Shell / terminal

For a new checkout:

```bash
git clone https://github.com/TuanPham0411/Thien-Ha.git
cd Thien-Ha/mes
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 functions deploy mes-api --project-ref aaosgmphvhjcygldocyi
```

For an existing checkout, pull the latest main first and run the deployment from
its `mes` directory. Complete CLI authentication in your own terminal/browser.
Never send access tokens, database passwords or service-role keys in chat.
`supabase/config.toml` sets verify_jwt=false because the function validates explicit
opaque account sessions and optional owner OAuth itself. Keep that config: the
public publishable key is not a JWT. Supabase supplies the service key only to the
Edge runtime. It must never appear in frontend settings or Netlify variables.

CORS permits only https://mes.th.io.vn and https://mes-th.netlify.app by default.
To add another origin, configure MES_ALLOWED_ORIGINS on Supabase; do not use `*`.

### 3. Netlify frontend

Use the separate **mes-th** Netlify project connected to main:

- Base directory: **mes**
- Build: **npm run build**
- Publish: **dist**
- Node: **24**

Wait for a successful deployment of this commit; trigger a deploy if automatic
builds are not enabled. Then refresh the site. The interface checks both API
`accounts-v1` and database accountVersion 1 and explains when the backend update
is missing. A green frontend deployment alone does not deploy Supabase.

Optional Google owner access also needs Supabase Google provider configuration,
its OAuth callback URL in Google Cloud and the two MES origins in Supabase Auth
redirect URLs. Username/password access does not require that setup.

## Workspace features

Full-width English/Vietnamese dashboard, activity/status/department charts,
reporting-period filters, shared/personal issue search, status/priority filters,
pagination and CSV export. Polling batches reads every 15 seconds and pauses in
hidden tabs. Anonymous visitors see the shell and can sign in; workspace records
are not public. There is no sample data in production.

Feedback requires the signed-in requester, owner-managed department, process and
content. Multiple optional incident moments or ranges are supported. Rich feedback
supports font/size/style/color, headings/lists/alignment, undo/redo and inline local,
pasted or dropped images. Owners assess, prioritize, update status, comment,
edit/delete issues and inspect the complete audit timeline. Tester mode is an
owner-only simulation which stores real tickets under the reserved Tester ID.

Rich content is a bounded versioned Delta, never stored HTML. The shared validator
normalizes allowed formats, rejects external image URLs and references attachment
slots 0–4. Rendering uses safe DOM elements/textContent. Existing plain text still
works. Private image previews open in a fit/full-size viewer.

Up to five nonempty JPG/PNG/WEBP/PDF/TXT/CSV/XLSX files, at most 10 MB each. Storage
has no anonymous/browser policies. Authorized downloads use short-lived signed
links. Uploads are allowed in reserved slots for 15 minutes after submission;
owners may use remaining slots later. Issued signed upload URLs last up to two
hours and cannot overwrite. Actual object metadata is validated before finalizing
attachments. This is not malware scanning.

If upload fails, the issue is already saved; avoid duplicate submission. Owner
delete tombstones the issue, deletes objects, then removes the issue and timeline;
retry if cleanup fails. Unfinalized uploads may need owner follow-up.

## Development and checks

```bash
npm ci
npm run build
```

From the repository root: `npm test`, `npm run build:mes` and
`bash mes/scripts/test-database.sh` (Docker required). The database suite uses a
throwaway PostgreSQL container; it tests all incremental migrations plus repeated
full-installer runs. No production data is touched.

From mes: `deno task check` and `deno task test:edge`. Edge HTTP tests mock Supabase
network calls and check identity, CORS, account errors, Storage metadata and rich
content normalization. `VITE_MES_PREVIEW=true npm run build` is an isolated UI demo;
never enable it for production.

Regenerate the consolidated installer after changing migrations:

```bash
node mes/scripts/build-installer.mjs
```

Validated account lifecycle/authorization with local PostgreSQL, Edge HTTP tests,
production build and browser API-mocked workflows at desktop/mobile sizes. Real
Google OAuth, Supabase database/Edge deployment and production Storage transfer
still require project-owner access; local tests do not prove live deployment.
