#!/usr/bin/env bash
# Provision only the requested Raspberry Pi; never accept credentials in source/logs.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run on the Pi as root'; exit 1; }
[[ -r /proc/device-tree/model ]] && grep -aq 'Raspberry Pi' /proc/device-tree/model || { echo 'Tailscale setup skipped: not a Raspberry Pi'; exit 0; }
workdir=$(mktemp -d)
trap 'rm -rf -- "$workdir"' EXIT
if ! command -v tailscale >/dev/null; then
 curl --fail --silent --show-error --location --connect-timeout 15 --max-time 120 https://tailscale.com/install.sh -o "$workdir/install.sh"
 DEBIAN_FRONTEND=noninteractive timeout 300 sh "$workdir/install.sh"
fi
systemctl enable --now tailscaled
state=$(tailscale status --json | python3 -c 'import json,sys;print(json.load(sys.stdin).get("BackendState","Unknown"))')
enrollment=/var/lib/th-app/tailscale-enrollment
install -d -m 700 "$enrollment"
payload="$(dirname "$0")/tailscale-enrollment.enc"
if [[ -f $payload ]]; then
 digest=$(sha256sum "$payload" | cut -d' ' -f1)
 if [[ ! -f $enrollment/consumed.sha256 || $(cat "$enrollment/consumed.sha256") != "$digest" ]]; then
  [[ -f $enrollment/private.pem ]] || { echo 'Enrollment private key is unavailable'; exit 1; }
  base64 -d "$payload" >"$workdir/payload.bin"
  openssl pkeyutl -decrypt -inkey "$enrollment/private.pem" -in "$workdir/payload.bin" -out "$workdir/auth-key" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256
  chmod 600 "$workdir/auth-key"
  if ! tailscale up --auth-key="file:$workdir/auth-key" --accept-dns=false --force-reauth --timeout=40s >"$workdir/enroll.log" 2>&1; then
   echo 'Encrypted enrollment failed; credential and diagnostic output withheld'
   tailscale status --json | python3 -c 'import json,sys; print("TAILSCALE_STATE="+json.load(sys.stdin).get("BackendState","Unknown"))'
   exit 1
  fi
  printf '%s\n' "$digest" >"$enrollment/consumed.sha256"
  rm -f "$enrollment/private.pem"
 fi
else
 # Invalidate any unfinished interactive enrollment; no login URL is logged.
 if [[ $state == NeedsLogin ]]; then tailscale logout >/dev/null 2>&1 || true; fi
 if [[ ! -f $enrollment/private.pem ]]; then
  umask 077
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$enrollment/private.pem" 2>/dev/null
 fi
 echo TAILSCALE_ENROLLMENT_PUBLIC_KEY_BEGIN
 openssl pkey -in "$enrollment/private.pem" -pubout 2>/dev/null
 echo TAILSCALE_ENROLLMENT_PUBLIC_KEY_END
fi
tailscale status --json | python3 -c 'import json,sys;s=json.load(sys.stdin);print("TAILSCALE_STATE="+s.get("BackendState","Unknown"));[print("TAILSCALE_IPV4="+ip) for ip in (s.get("TailscaleIPs") or []) if ":" not in ip]'
systemctl is-active tailscaled
