# MES Ticket — child project of TH portfolio

Live: <https://mes.th.io.vn> · Parent portfolio: <https://th.io.vn>.

MES is maintained as a child application in the `Thien-Ha` monorepo, with its own frontend package in this directory and shared backend code in `../server/`. It runs on Node.js/PostgreSQL; the active deployment does not use Supabase or Firebase.

- From the repository root: `npm ci && npm run build:mes`.
- Frontend-only build from this directory: `npm ci && npm run build` (API must be hosted separately).
- Export independent **full-stack source**: `npm run export:mes -- work/mes-source` (choose a new directory).
- Generated independent branch: [`mes-standalone`](https://github.com/TuanPham0411/Thien-Ha/tree/mes-standalone). Clone this branch or copy the export into a new repository.
- Docker, custom domains, activation, backups and data migration: [standalone deployment guide](STANDALONE.md).
- Current Pi deployment and data preservation: [deployment guide](../deploy/README.md).

`main` is the source of truth. The GitHub **Export standalone MES** workflow builds the exported project in isolation, validates its Docker image, publishes a source artifact and updates `mes-standalone` without force-pushing. Generated branch edits should be brought back to `main` before the next sync.

Historical Supabase/Netlify instructions are archived in [LEGACY_SUPABASE.md](LEGACY_SUPABASE.md); they are not the current deployment path. The `supabase/functions/_shared/rich-document.js` file is retained as a pure JavaScript validation/rendering library, not a Supabase service dependency.
