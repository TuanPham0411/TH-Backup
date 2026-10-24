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
if [[ $state == NeedsLogin || $state == Stopped ]]; then
 # Keep the Pi's working DNS and default routes; enable no SSH/exit-node features.
 tailscale up --accept-dns=false --timeout=20s >"$workdir/login.log" 2>&1 || true
fi
tailscale status --json >"$workdir/status.json"
python3 - "$workdir/status.json" "$workdir/login.log" <<'PY'
import json,pathlib,re,sys
status=json.loads(pathlib.Path(sys.argv[1]).read_text())
print('TAILSCALE_STATE='+status.get('BackendState','Unknown'))
for address in status.get('TailscaleIPs') or []:
 if ':' not in address: print('TAILSCALE_IPV4='+address)
text=status.get('AuthURL') or ''
log=pathlib.Path(sys.argv[2])
if log.exists(): text+='\n'+log.read_text()
match=re.search(r'https://login\.tailscale\.com/a/[A-Za-z0-9_-]+',text)
if match: print('TAILSCALE_LOGIN_URL='+match.group(0))
PY
systemctl is-active tailscaled
