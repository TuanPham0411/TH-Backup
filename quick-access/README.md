# MES Quick Access

Quick Access is a child application at `/quick-access/`. It uses the existing MES
accounts and HttpOnly `th_mes` session cookie. There is no separate user database,
default password, Windows identity header, or Quick Access login service.
The interface shares the MES Operations Studio palette and navigation, starts
in Night mode, and preserves existing account-specific appearance choices.
The toolbar Day/Night switch saves to the current user’s Drive preferences.
Account/profile and administrator links open the matching MES screens; no
account-creation or password-reset forms exist inside Quick Access.

Opening the application without a session redirects to `/?returnTo=/quick-access`.
Password and Google owner login return to Quick Access after authentication.
MES members can view the workspace and save their own preferences. Only the MES
owner can edit production lines, stations, layouts and the document catalogue or
upload resources. Sessions are checked against MES on every request, including
static assets and documents. Signing out revokes the shared MES session.

## Data on Google Drive

Connect Drive through MES Administration using the existing Google OAuth setup.
The application stores JSON documents in the connected `TH MES` root folder:

- `quick-access-content.json`: shared catalogue and layouts. Saving requires the
  current version; a stale editor receives HTTP 409 and must reopen the catalogue.
- `quick-access-settings-<SHA-256 of MES user ID>.json`: private preferences keyed
  by the stable MES identity. Renaming a user does not create a different record.
- New uploads: private Drive files marked with the application's resource property.

JSON file lookup uses private app properties and the connected root folder, never
user-supplied Drive queries. PostgreSQL transaction advisory locks serialize
writes across application processes. All replicas must share the same MES database,
Drive credentials and root folder. The PostgreSQL lock coordinates access; the
Quick Access content and preferences themselves are stored on Drive. Drive failures
return an error; there is no silent fallback that saves data only on the Pi.

`default-config.json` is the initial catalogue extracted from the supplied app.
It is used until the owner first saves the catalogue to Drive. The supplied `users.json`,
session secret, logs and `node_modules` are not imported. Old per-user settings are
not automatically assigned to new MES identities; preferences start with the
application defaults until each member saves them.

The original documents and layouts remain in the supplied Drive source folder:
`https://drive.google.com/drive/folders/1B_aUCIAtwVe20EcG_IV7OncU3LXVPoGR`.
`source-files.json` maps existing relative resource paths to those exact file IDs.
The server streams only listed source files or marked uploads in its own Drive
root. Files are never made public. Scripts and Windows installers are downloads;
the server does not execute them. PDF.js is bundled locally for previews.

**Required once for the existing source documents:** the Drive account connected
on the server must have read access to that folder. Enable
the optional `https://www.googleapis.com/auth/drive.readonly` scope in the Google
OAuth consent configuration. As the MES owner, open Quick Access → MES account →
**Connect source documents on Drive** and approve Google's read-access request
with the same Drive account. This reuses the existing connected root folder.
Alternatively set `GOOGLE_DRIVE_SOURCE_READ=true` in the private runtime environment,
restart and reconnect through MES Administration.
Google may require OAuth app verification for this restricted scope depending on
the app's publishing mode. Existing `drive.file` consent alone does not grant
access to an arbitrary pre-existing source folder. The extra scope is read-only;
new application data continues to use `drive.file`. Do not copy refresh tokens or
Google client secrets into frontend configuration or Git.

## Pi deployment

The `feat/mes-quick-access` branch and `main` use the existing **Build and deploy Pi**
workflow. A push builds/tests on GitHub before deploying the artifact to the
existing `th-server` ARM64 runner. Pull requests only build/test. A global workflow
concurrency group prevents the two deployment branches from installing concurrently;
the latest successfully deployed run controls the shared live instance. Merge
the feature branch when ready and remove its extra workflow trigger afterwards.

The artifact includes `server/quick-access/`, and the existing installer checks
these files before rollout. Nginx proxies `/quick-access/` to the API so that
assets and documents receive the same server-side session checks. Local and public
health checks verify the unauthenticated page redirect and protected API response.
The existing release switch and rollback mechanism still applies.

Pi requires no new database migration, npm install or frontend build. The service
sets `QUICK_ACCESS_ROOT` and `QUICK_ACCESS_DATA_ROOT` to the files in the current
release. Runtime Drive consent and source-folder access are separate from a
successful deployment; test a signed-in document preview and an owner save after
reconnecting Drive.

## Other platforms

The existing standalone MES export includes Quick Access:

```sh
node mes/export.mjs work/mes-quick-access-source
cd work/mes-quick-access-source
npm ci
npm run build
```

Use the generated README, `compose.yaml`, Dockerfile and `.env.example` for
PostgreSQL, migrations, runtime role and initial owner setup. `start.mjs` sets
the Quick Access asset/data paths relative to the portable bundle. Configure
`MES_ORIGIN=https://your-mes-host.example`, Google OAuth callbacks for that origin,
and persistent `/data` storage for Drive credentials. Behind a reverse proxy,
preserve the MES hostname and configure trusted proxies deliberately. All routes
must reach the same MES process; static-only hosting cannot run this application.

Accounts and session validation require PostgreSQL. Drive stores Quick Access
content, uploads and preferences; it does not replace the MES authentication
database. Other MES media follows the existing storage-provider setting.

## Verification

```sh
npm test
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST/th_test npm run test:pi
npm run build && npm run build:mes && npm run build:server
```

The test database must be disposable and its name must end in `_test`. Automated
checks cover session expiry, rejection of Windows/tester-header impersonation,
owner-only edits/uploads, private preferences, stale versions, safe resource
paths, origin checks and existing MES functionality. Live Google consent and
real Pi/domain operation require separate integration verification.
