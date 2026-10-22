#!/usr/bin/env bash
# Reversible transport change only; retain all existing tunnel identities and ingress routes.
set -euo pipefail
[[ $(id -u) == 0 ]] || exit 1
service_dir=/etc/systemd/system/cloudflared.service.d
config="$service_dir/50-th-transport.conf"
backup=$(mktemp -d /run/th-tunnel-transport.XXXXXX)
chmod 700 "$backup"
previous=false
[[ ! -e $config ]] || { cp -a "$config" "$backup/previous"; previous=true; }
changed=false
cleanup(){ rm -rf -- "$backup"; }
rollback(){
 if [[ $changed == true ]]; then
  if [[ $previous == true ]]; then cp -a "$backup/previous" "$config"; else rm -f "$config"; fi
  systemctl daemon-reload
  systemctl restart cloudflared
  echo 'Tunnel transport check failed; previous transport settings restored.' >&2
 fi
}
trap cleanup EXIT
trap rollback ERR
curl --fail --silent --show-error --max-time 5 -H 'Host: mes.th.io.vn' http://127.0.0.1:3000/api/health >/dev/null
mkdir -p "$service_dir"
cat > "$backup/next" <<'CONF'
[Service]
Environment=TUNNEL_TRANSPORT_PROTOCOL=http2
Environment=TUNNEL_EDGE_IP_VERSION=4
CONF
if [[ -f $config ]] && cmp -s "$config" "$backup/next"; then
 echo 'Preferred tunnel transport already configured.'
 exit 0
fi
started=$(date +%s)
changed=true
install -m 644 "$backup/next" "$config"
systemctl daemon-reload
systemctl restart cloudflared
registered=false
for _ in {1..20}; do
 count=$(journalctl -u cloudflared --since "@$started" --no-pager -o cat | grep -c 'Registered tunnel connection.*protocol=http2' || true)
 if [[ $count -ge 2 ]]; then registered=true; break; fi
 sleep 2
done
[[ $registered == true ]]
systemctl is-active --quiet cloudflared
for host in th.io.vn mes.th.io.vn; do
 for attempt in 1 2 3; do
  curl --fail --silent --show-error --compressed --max-time 12 -o /dev/null -w "tunnel.http2.$host.$attempt status=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" "https://$host/api/health"
 done
done
changed=false
trap - ERR
echo 'Tunnel now uses HTTP/2 over IPv4; identities, credentials and routes retained.'
