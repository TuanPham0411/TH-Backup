# TH portfolio + MES on Raspberry Pi

Portfolio: `https://th.io.vn`. MES: `https://mes.th.io.vn`.
Target: Pi 3B+, Raspberry Pi OS Lite ARM64, 1 GB RAM. See [deployment guide](deploy/README.md).

## Architecture

Nginx serves both Vite builds and proxies `/api` to one Node.js process bound to `127.0.0.1:3000`. PostgreSQL holds portfolio records, accounts and MES business logic; private attachments live at `/var/lib/th-app/files`. Google OAuth and SMTP run through the backend. No Firebase or Supabase service, client SDK, hosted auth, storage or Edge Function is used by the deployed apps.

GitHub hosted runners install dependencies, test and build both frontends and bundle the backend plus the official Node.js 22 ARM64 runtime. The existing self-hosted `th-server` runner only downloads and installs the artifact. Pull requests never run deployment code on the Pi. SSH and Cloudflare Tunnel configuration are untouched.

## Development and checks

Use Node.js 22.12+ (Node.js 24 also works).

```sh
npm ci
npm test
npm run build
npm run build:mes
npm run build:server
```

`npm run dev` serves the portfolio; `npm run dev:mes` serves MES. Authentication needs the same-origin backend behind a local reverse proxy; Vite alone only previews the UI. `VITE_MES_PREVIEW=true npm run dev:mes` uses sample MES data.

Integration tests require a **disposable** PostgreSQL database with a name ending in `_test`. They apply and reapply the Pi migrations and exercise the real API under its restricted runtime database role. Database fixtures persist in that disposable database; recreate it before another run.

```sh
TEST_DATABASE_URL=postgresql://postgres:test-only@127.0.0.1:5432/th_test npm run test:pi
```

Frontend source lives in `site/` and `mes/site/`; backend in `server/`; Pi SQL migrations in `server/migrations/`. The older `mes/supabase/` directory is retained as historical SQL/authorization reference and for existing regression tests. It is not packaged or executed on Pi. Pi migrations retain the MES dispatcher and its account lifecycle, rich documents, tester mode and catalog/issue/timeline permissions, with local PostgreSQL grants.

## Accounts

Portfolio supports Google sign-in and email/password registration with email verification and one-time password reset. Only the configured `OWNER_EMAIL` becomes administrator through verified Google sign-in. The API always checks the database role, verification and record ownership; client-side UI checks are not authorization.

MES supports verified Google owner login or local `hpham` activation/password login, admin-issued single-use user activation links, profile updates and password changes. Sessions use Secure, HttpOnly, SameSite=Lax cookies, expire in 12 hours and are revoked by logout, credential changes or user deactivation. No passwords or session tokens are placed in browser storage.

Attachments are private, up to 10 MB each and five per issue, with the existing allowed MIME types. Upload/download URLs expire in 60 seconds, work once and recheck the account and issue permission at use time. Uploads cannot overwrite an existing slot, and actual stored size/type are used when linking attachments. Files are always downloaded as attachments, never served as executable HTML.
