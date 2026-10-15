#!/usr/bin/env bash
set -euo pipefail
mes_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$mes_root"
# Execute only from a terminal authenticated as the owner of th-mes-web.
# Requires Blaze, Firestore, Storage and Google Authentication to be enabled.
npm ci
npm run build
(cd functions && npm ci)
npx --yes firebase-tools@15.33.0 deploy --project th-mes-web --only functions:mes,firestore:rules,storage
