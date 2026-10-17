# Deploy to th-server

## What has and has not been verified

The existing `.github/workflows/pi-check.yml` was inspected before changes and is preserved. It is a manual diagnostic workflow with no deployment/build steps. The existing remote `pi-build.yml` was also inspected after fetching the latest main: it built static sites on GitHub and only staged them under the runner home directory. That workflow has been upgraded in place. The updated `pi-build.yml` builds/tests on GitHub, then deploys `main` on `[self-hosted, Linux, ARM64]` and checks that the selected runner's name is `th-server`. Runner name is not assumed to be an automatic label.

The installer has no Cloudflare or SSH mutation commands. Live deployment still requires repository push/Actions access; local checks do not prove live Pi/domain health.

## First installation

`th-server` has now been initialized with the root-owned deployment entrypoint. The normal workflow uses only that command. For a different fresh Pi, download/extract a built artifact and run `sudo bash ARTIFACT/deploy/install.sh ARTIFACT RELEASE_ID` once from an administrative shell before enabling automatic deployment. The installer creates the dedicated sudo rule after a healthy rollout.

1. Push reviewed source to `main` (or manually run **Build and deploy Pi** on `main`). GitHub builds both static sites, the dependency-bundled API/migration runner, and downloads/checksums the official Node.js 22 Linux ARM64 runtime. No Node/npm preinstallation or compilation on Pi is needed. Deployment receives only the artifact and verifies its SHA-256 checksum.
2. Installer checks ARM64, existing Nginx/PostgreSQL services and overlapping host blocks. If an enabled Nginx site already owns either hostname, deployment stops **before changes** with a specific conflict message. Review `sudo nginx -T` on Pi and consolidate only those two host blocks. Preserve all other hosts and the Tunnel's existing local origin/port. The supplied configuration listens on port 80; if the existing Tunnel uses another port, adjust `deploy/nginx.conf` to that existing origin before deploying. The installer never edits the Tunnel.
3. On first successful installation, the installer creates system user `thapp`, database `th_app`, database login `th_api` with a random password, `/var/lib/th-app/files`, and root-only `/etc/th-app/runtime.env`. Existing database/role name collisions stop provisioning; it does not drop existing databases. Runtime DB role cannot read MES credential tables or invoke bootstrap activation directly.
4. Configure Google OAuth and email locally on Pi using `sudoedit /etc/th-app/runtime.env`. See `runtime.env.example`; never put secrets in Vite variables, Git or Actions logs. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_URL`, `MAIL_FROM`; set `OWNER_EMAIL` to the intended verified Google owner before first login. Register both exact OAuth callback URLs:
   - `https://th.io.vn/api/oauth/callback`
   - `https://mes.th.io.vn/api/oauth/callback`
5. Restart only the app: `sudo systemctl restart th-app`. Email/password registration and outgoing verification/reset require SMTP; Google sign-in requires the OAuth client. Missing settings fail explicitly. Public sites and local MES account activation work independently.
6. If using password activation for the initial MES owner, run locally (this prints a **secret activation code**; do not paste it into CI logs):

   ```sh
   sudo -u postgres psql th_app -Atc 'select public.mes_issue_owner_activation();'
   ```

   Open `https://mes.th.io.vn/#activate=CODE&username=hpham`, then choose a password. Activation is single-use, expires in 72 hours, and returns `already-activated` once the owner password is set. Google owner login can be used instead. The old Windows-agent sign-in is disabled by the existing account migration.

## Cloudflare routes

The Pi application is installed and its local HTTP/API checks pass. Public checks initially returned Cloudflare HTTP 404; the owner confirmed that the portfolio route had not yet been created.

In Cloudflare Zero Trust, open the **existing** tunnel under Networks → Tunnels/Connectors, then Published application routes (also called Public Hostnames). Add these entries with no path restriction:

| Public hostname | Service type | Service URL |
| --- | --- | --- |
| `th.io.vn` | HTTP | `localhost:80` |
| `mes.th.io.vn` | HTTP | `localhost:80` |

For the root hostname, leave Subdomain empty and select domain `th.io.vn`; for MES, set Subdomain to `mes`. Leave HTTP Host Header override unset so Nginx receives the original hostname. Preserve the existing SSH route. The dashboard normally creates the DNS record for a new route; resolve any conflicting DNS record for that same hostname deliberately. No tunnel token, SSH unit or tunnel service command is changed by the application deployment.

If `mes.th.io.vn` does not resolve, create/check a proxied DNS CNAME named `mes` in the `th.io.vn` zone, pointing to the same `TUNNEL_ID.cfargotunnel.com` target as the root domain. Editing a route hostname does not always synchronize an existing DNS record.

After saving the routes and DNS, rerun the **verify-public** job in the latest Actions run. It tests the two public HTTPS roots, both `/api/health` endpoints and the MES API version. OAuth and email need the runtime settings described above as separate integration checks.

## Sudo bootstrap

The runner initially required a sudo password despite the earlier cached `sudo -n true` check. One-time password transport uses RSA-OAEP-SHA256 with a private key generated on Pi under `/var/tmp/th-pi-deploy-auth` (mode 700). Only the public key and encrypted ciphertext pass through GitHub; the password is piped directly into `sudo -S` and never logged or written as plaintext. The key is deleted after the bootstrap attempt. The temporary ciphertext has been removed from the current workflow after successful bootstrap. The bootstrap transport is not needed by the normal workflow.

A successful install creates the root-owned `/usr/local/sbin/th-deploy` entrypoint and `/etc/sudoers.d/th-app-deploy`, allowing only that deployment command without a password for `thadmin`. Subsequent releases invoke this entrypoint; the runner has no need for passwordless arbitrary shell commands. Keep repository workflow write access restricted to trusted maintainers, since deployment artifacts include service configuration and migrations.

## Runtime and resources

One process, PostgreSQL pool max 4, Node heap 192 MB, service memory cap 320 MB. Static files are served directly by Nginx. No Docker, npm install or frontend build on Pi. Releases live under `/opt/th-app/releases`; the atomic `current` symlink selects the active release. Three releases are retained after successful deployment. Attachments are stored outside releases and survive redeploys.

PostgreSQL is already installed: inspect its current memory settings rather than overwriting global configuration. For this machine, a conservative starting point is `shared_buffers=64MB`, `work_mem=2MB`, `maintenance_work_mem=32MB`, `max_connections=20`, provided other applications fit those limits. No global PostgreSQL setting is changed automatically.

The API listens on loopback only. Nginx overwrites forwarded host/address headers. With a loopback Cloudflare Tunnel the built-in rate limit may be shared across clients (180 requests/minute; auth 30/15 minutes). Configure trusted client IP handling only after verifying the actual Tunnel path; do not trust arbitrary browser-supplied forwarded headers. Keep PostgreSQL local and retain the current firewall/SSH setup.

## Health, rollout and rollback

Deployment runs transactional, versioned migrations, switches the release symlink, checks Nginx syntax, restarts the API, polls database health, reloads Nginx, then checks both host roots and MES directory API. It confirms that SSH, cloudflared, Nginx and PostgreSQL remain active. A failure during switching restores the old application/configuration. SQL migrations remain applied; future migrations must stay backward compatible or have a deliberate database recovery plan.

Check on Pi:

```sh
sudo systemctl status th-app nginx postgresql cloudflared ssh --no-pager
curl -f http://127.0.0.1:3000/api/health
curl -f -H 'Host: th.io.vn' http://127.0.0.1/
curl -f -H 'Host: mes.th.io.vn' http://127.0.0.1/
sudo journalctl -u th-app -n 50 --no-pager
```

Then check both public HTTPS domains, Google owner login, email verification/reset, a non-owner account, and an upload/download. These external integrations cannot be fully verified without the real OAuth/SMTP settings and domain access.

Manual application rollback (choose an actual previous release ID):

```sh
sudo ln -s /opt/th-app/releases/PREVIOUS_ID /opt/th-app/.rollback
sudo mv -Tf /opt/th-app/.rollback /opt/th-app/current
sudo systemctl restart th-app
```

For backups, retain PostgreSQL dumps **together with** `/var/lib/th-app/files` and `/etc/th-app/runtime.env` on another device. Stop the app while taking the dump/file snapshot if a consistent maintenance backup is required. Monitor `df -h /` and attachment growth on the 32 GB card; failed/crashed uploads can leave temporary files and unattached uploads for administrator cleanup. Never delete live linked attachments by age alone.

## Credential rotation

Rotate credentials if they have been shared in a screenshot or other unintended location. Enter replacements directly on Pi using `sudoedit /etc/th-app/runtime.env`; do not put them in Git or CI logs.

- **Google OAuth:** add a new client secret in Google Auth Platform → Clients, update `GOOGLE_CLIENT_SECRET`, restart `th-app`, test a fresh login, then delete the old client secret.
- **Gmail SMTP:** create a replacement App Password, update the password in `SMTP_URL`, then revoke the old App Password. Remove display spaces from the App Password. For an initial Gmail delivery test, set `MAIL_FROM` to the authenticated Gmail address; a custom sender needs the provider's verified sender configuration.
- **PostgreSQL:** stop only `th-app`, open `sudo -u postgres psql -d th_app`, run `\password th_api` and enter the new password at the hidden prompts, then `\q`. Update the password component of `DATABASE_URL` to match; percent-encode reserved URL characters. Restart `th-app` and check `/api/health`. Keep the existing database, tables, files and role name.

Apply environment changes with `sudo systemctl restart th-app`. This does not restart SSH or Cloudflare Tunnel. OAuth callback requests must begin from a fresh Google login after a deployment or secret change; an old callback URL may have an expired state or authorization code.
