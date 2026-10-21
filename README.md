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

## Viewer access and saved dashboard layout

Visitors can read the dashboard, published notices/videos, tickets and timelines without an account. The read-only SQL facade excludes account records, upload slots and private reporter IDs. Creating feedback, commenting, uploading, profile changes and administration still require a valid session. Ticket content and published media are visible to visitors; keep confidential material out of published tickets.

**Customize dashboard** controls individual widgets. Signed-in users save their own selection in PostgreSQL; visitors save it in the current browser. This never changes ticket data.

## Storage folders, USB transfers and PostgreSQL

In **Administration → Storage**:

1. Mount an existing USB partition if it appears under unmounted devices. MES never formats the USB.
2. Select SD/USB, browse folders and enter a new/empty relative folder, then register it. The full path is displayed. Unrelated non-empty directories are rejected.
3. Review a Copy/Move plan for existing media. Copy retains originals; Move deletes each original only after checksum verification. Ticket IDs, attachment URLs and history remain unchanged. An interrupted operation keeps remaining originals and can be retried.
4. To move the running PostgreSQL cluster, select its device and a separate empty database folder, review the plan and start the operation. Writes pause, a logical dump is retained, the cluster stops, every database file is copied/verified and the cluster restarts. The original database directory remains as a rollback copy. Never unplug a drive hosting PostgreSQL while Pi is running.

Linux filesystems hold PostgreSQL directly. On exFAT/NTFS, the broker creates a new private `pgdata.ext4` image inside the chosen folder and mounts it; it does **not** format the physical partition. Choose image capacity with room for future database growth. Boot checks the UUID, storage marker and PostgreSQL version before binding the database path; a missing drive prevents startup instead of creating an empty replacement database. Physical migration is an explicit administrator operation, never part of a routine deployment.

## Google Drive active media and backups

PostgreSQL runs on local SD/USB. Google Drive can store active image/video/file originals and complete backups containing a PostgreSQL custom-format dump, media with original relative paths, and a SHA-256 manifest. Backups stream to Drive without staging a full media archive on the SD card. A temporary database dump still needs local free space. Uploads use bounded 4 MiB buffers and verify Drive MD5 checksums. Final cloud transfer runs in the background, with browser polling to avoid proxy timeouts. Media files stay private in Drive and MES proxies permitted reads, including video byte ranges; existing MES links remain unchanged.

Setup (no secrets in GitHub or tickets):

1. Enable **Google Drive API** in the Google Cloud project used by MES Google login.
2. In its Web OAuth client, add `https://mes.th.io.vn/api/mes/drive/callback` under authorized redirect URIs. Retain the existing login redirect URIs.
3. The existing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are reused. Optionally set a separate `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET` in `/etc/th-app/runtime.env` and restart `th-app` and `th-storage`. If the OAuth app is Testing, add the connecting Google account as a test user. Testing-mode refresh tokens can expire after seven days; reconnect when necessary or publish the OAuth app as appropriate.
4. Sign in to MES as admin, open **Administration → Google Drive storage and backup → Connect Google Drive**, and approve offline access. MES creates private `TH MES/Media` and `TH MES/Backups` folders using the limited `drive.file` scope.
5. Choose Drive for new uploads, or Copy/Move existing media to Drive. Copy keeps local originals. Move removes verified local originals after copying all media. Data migrations and backups pause writes for consistency; dashboard reads continue.
6. Use **Back up database and media to Drive** for an on-demand full backup. Use **Copy Drive media back locally** to return to a registered SD/USB folder, retaining Drive originals. Backups are not automatically scheduled.

The refresh token is stored only in `/var/lib/th-app/drive-credentials.json` with mode `0600` (override with `DRIVE_TOKEN_FILE`). It is excluded from media backups. Do not manually delete/move files inside the managed Drive folders. Keep the same Google account while cloud files are in use; MES prevents switching accounts until cloud mappings have been removed. After an interrupted server process, an administrator can clear the interrupted Drive operation in the storage panel and retry. A backup is usable only after the operation reports completion; restore requires an operator to restore `database.dump`, restore media at their manifest paths, and reconnect the same Drive account if the restored database retains cloud mappings.


## Ticket numbers and direct links

Tickets have public references such as `TH2610-01` (`TH` + two-digit year + month + `-01`…`-99`). Allocation is atomic, resets by calendar month in `Asia/Ho_Chi_Minh`, and stops new ticket creation after 99 allocations in that month. Deleting a ticket never reuses its number. Old issue IDs, attachment paths, ticket JSON and timelines remain unchanged; a separate mapping assigns references to existing tickets chronologically within each original creation month. If a historical month already contains more than 99 records, overflow historical records retain their existing IDs and links; the upgrade never deletes or rewrites them.

- Open a ticket: `https://mes.th.io.vn/ticket/TH2610-01`.
- Read ticket JSON: `GET https://mes.th.io.vn/api/mes/tickets/TH2610-01`.
- Both routes also accept the original internal issue ID, and preserve the same viewer/authentication rules as the dashboard. Deleted/unknown tickets return HTTP 404 from the API.
- Use **Copy ticket link** in ticket details. Ticket numbers are shown in the list, detail heading and CSV export, and can be searched.

Workspace video uses a responsive 16:9 frame. Notice board places scrollable text on the left and its illustration on the right in a 4:3 frame; images cover the entire frame with a centered crop. Multiple illustrations use Previous/Next controls in the same frame. Multiple notices have Previous/Next controls; only notice text scrolls. Images keep their proportions without a black frame. Feedback images can be inserted at the cursor with **+ Image**, pasted or dropped into the text editor. Existing attached images also display directly below their feedback text. Attachments use compact rows and the image viewer shows a preview immediately while loading the original. Access history has a bounded scroll area and cursor-based Previous/Next pages of 100 entries.

## Complete administrator ticket edits

**Edit feedback** lets administrators change the title, process, requester, department, issue type, incident times, formatted text, assessment, priority, status and progress in one save. The attachment section supports Add, Rename, Replace and Remove; inline images update with their attachment slots. Up to five active attachments remain supported, with the existing image/file and 200 MB video limits. Fresh immutable upload paths permit replacing files even when all five original slots are occupied or the ticket is old.

A save validates all attachments and fields, then commits ticket metadata and timeline records atomically. A ticket changed by someone else while the dialog was open produces a conflict instead of overwriting their changes. Canceling the dialog does not modify the published ticket. Removed/replaced originals remain stored for historical audit and backups; the normal ticket links no longer expose them. This operation does not change the internal ticket ID, public ticket number, creation time or prior timeline rows.

Each attachment has separate **View** and **Download** controls. Download streams the original using `?download=1` with its filename, including media stored in Drive. Public ticket numbers are shown as distinct badges beside titles in lists, recent feedback and ticket details.

### MES dashboard and content tabs

The default theme is night mode; an explicitly saved day/night choice is retained. Dashboard data has no periodic polling. Use **Refresh** to fetch current records, announcements, videos and tab content. Initial navigation and successful edits load the relevant data. Uploads and active storage/Drive jobs still report progress until complete.

Administrators can select **Create tab** in navigation (also available in Settings), then **Add widget** to add headings, text, links, documents, images, videos, callouts or dividers. **Tab settings** controls title, order, publication and audience. New tabs are unpublished and restricted to members by default. Only explicitly published public tabs are visible to anonymous viewers. Documents have View/Download controls, and uploaded files use the active storage backend. Deleting a tab archives it and retains its files and revision history.

Signed-in users can open **My profile → Display settings**, choose a site font and base size (12–20 px), then **Save display settings**. Preferences are private, stored in PostgreSQL by authenticated account ID, and restored on other devices. **Use defaults** selects Calibri 14 px; save to confirm. Headings and interface labels scale proportionally without resizing media. Existing authored rich-text font overrides are preserved.
