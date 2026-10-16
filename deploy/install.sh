#!/usr/bin/env bash
# Install a GitHub-built release. Never invokes npm, compiler or changes tunnel/SSH.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run using sudo'; exit 1; }
if [[ ${1:-} == --check ]]; then exit 0; fi
release_source=$(realpath "${1:?Pass the extracted artifact directory}")
release_id=${2:?Pass a release ID}
[[ $release_id =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
[[ $(uname -m) == aarch64 ]] || { echo 'ARM64 is required'; exit 1; }
systemctl is-active --quiet postgresql nginx
for required in runtime/bin/node server/app.cjs server/migrate.cjs web/index.html mes/index.html deploy/th-app.service deploy/nginx.conf; do
 [[ -f "$release_source/$required" ]] || { echo "Missing $required"; exit 1; }
done
# Refuse overlapping host configuration; leave the existing sites untouched.
if nginx -T 2>&1 | awk '/^# configuration file / {file=$4} /server_name.*(mes\.)?th\.io\.vn/ {if(file!="\/etc\/nginx\/sites-enabled\/th-app:") found=1} END {exit !found}'; then
 echo 'Existing Nginx configuration owns th.io.vn/mes.th.io.vn. Consolidate those host blocks before deploying.' >&2
 exit 1
fi
id thapp >/dev/null 2>&1 || useradd --system --home /var/lib/th-app --shell /usr/sbin/nologin thapp
install -d -m 755 /opt/th-app /opt/th-app/releases
install -d -m 700 /etc/th-app
install -d -o thapp -g thapp -m 700 /var/lib/th-app /var/lib/th-app/files
if [[ ! -f /etc/th-app/runtime.env ]]; then
 # Credential only travels over stdin to psql and is saved in a root-only file.
 python3 - <<'PY'
import secrets,subprocess
password=secrets.token_hex(32)
subprocess.run(['sudo','-u','postgres','psql','-v','ON_ERROR_STOP=1','-q'],input="CREATE ROLE th_api LOGIN PASSWORD '"+password+"';\nCREATE DATABASE th_app;\n",text=True,check=True)
with open('/etc/th-app/runtime.env','x') as f:
 f.write('DATABASE_URL=postgresql://th_api:'+password+'@127.0.0.1/th_app\nFILES_ROOT=/var/lib/th-app/files\nPORT=3000\nOWNER_EMAIL=eric.scorp93@gmail.com\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nSMTP_URL=\nMAIL_FROM="TH <noreply@th.io.vn>"\n')
PY
 chmod 600 /etc/th-app/runtime.env
fi
# Copy immutable release first. A failed migration leaves current unchanged.
target="/opt/th-app/releases/$release_id"
[[ ! -e "$target" ]] || { echo 'Release already exists. Use a new release ID.'; exit 1; }
install -d -m 755 "$target"
cp -a "$release_source/." "$target/"
chown -R root:root "$target"
chmod -R a+rX "$target"
sudo -u postgres env DATABASE_URL=postgresql:///th_app?host=/var/run/postgresql "$target/runtime/bin/node" "$target/server/migrate.cjs"
old_target=$(readlink -f /opt/th-app/current || true)
backup=$(mktemp -d /opt/th-app/.deploy-backup.XXXXXX)
[[ ! -f /etc/nginx/sites-available/th-app ]] || cp -a /etc/nginx/sites-available/th-app "$backup/nginx"
[[ ! -f /etc/systemd/system/th-app.service ]] || cp -a /etc/systemd/system/th-app.service "$backup/service"
rollback() {
 if [[ -n $old_target && $old_target != /opt/th-app/current ]]; then
  ln -s "$old_target" /opt/th-app/.rollback
  mv -Tf /opt/th-app/.rollback /opt/th-app/current
 else rm -f /opt/th-app/current; fi
 if [[ -f $backup/nginx ]]; then cp -a "$backup/nginx" /etc/nginx/sites-available/th-app; else rm -f /etc/nginx/sites-enabled/th-app /etc/nginx/sites-available/th-app; fi
 if [[ -f $backup/service ]]; then cp -a "$backup/service" /etc/systemd/system/th-app.service; else systemctl stop th-app || true; rm -f /etc/systemd/system/th-app.service; fi
 systemctl daemon-reload
 if [[ -n $old_target && -f $backup/service ]]; then systemctl restart th-app || true; fi
 nginx -t && systemctl reload nginx
 echo 'Deployment failed; prior application configuration restored. Migrations were retained.' >&2
}
trap rollback ERR
install -m 644 "$target/deploy/th-app.service" /etc/systemd/system/th-app.service
install -m 644 "$target/deploy/nginx.conf" /etc/nginx/sites-available/th-app
ln -sfn /etc/nginx/sites-available/th-app /etc/nginx/sites-enabled/th-app
ln -s "$target" /opt/th-app/.next
mv -Tf /opt/th-app/.next /opt/th-app/current
nginx -t
systemctl daemon-reload
systemctl enable th-app
systemctl restart th-app
healthy=false
for _ in {1..20}; do
 if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then healthy=true; break; fi
 sleep 1
done
[[ $healthy == true ]]
systemctl reload nginx
curl -fsS -H 'Host: th.io.vn' http://127.0.0.1/ >/dev/null
curl -fsS -H 'Host: mes.th.io.vn' http://127.0.0.1/ >/dev/null
curl -fsS -H 'Host: mes.th.io.vn' -H 'Content-Type: application/json' --data '{"name":"getDirectory"}' http://127.0.0.1/api/mes >/dev/null
systemctl is-active ssh cloudflared nginx postgresql th-app
# Future releases use this root-owned entrypoint with a dedicated sudo rule.
install -m 755 "$target/deploy/install.sh" /usr/local/sbin/th-deploy
printf '%s\n' 'thadmin ALL=(root) NOPASSWD: /usr/local/sbin/th-deploy *' > "$backup/sudoers"
visudo -cf "$backup/sudoers"
install -m 440 "$backup/sudoers" /etc/sudoers.d/th-app-deploy
trap - ERR
rm -rf "$backup"
# Keep current plus two older releases to limit use of the 32 GB card.
python3 - <<'PY'
from pathlib import Path
import shutil
current=Path('/opt/th-app/current').resolve()
others=sorted((p for p in Path('/opt/th-app/releases').iterdir() if p.is_dir() and p!=current),key=lambda p:p.stat().st_mtime,reverse=True)
for p in others[2:]: shutil.rmtree(p)
PY
echo 'Deployment healthy. Configure Google OAuth and SMTP in /etc/th-app/runtime.env if this is the first installation.'
