#!/usr/bin/env bash
set -euo pipefail
mes_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$mes_root"
# Authenticate with `npx supabase login` first. Never put access tokens in source.
# `supabase link` asks for the database password securely in your terminal.
npm ci
npm run build
npx --yes supabase@2.121.0 link --project-ref aaosgmphvhjcygldocyi
npx --yes supabase@2.121.0 db push
npx --yes supabase@2.121.0 functions deploy mes-api --project-ref aaosgmphvhjcygldocyi
