# Release and go-live checklist

This is the short, ordered path from a local Docker instance to a real deployment. It does not include changing DNS for you; the domain and mail records are owner actions.

## 1. Prepare the server

- A Linux host with Docker Engine and the Compose plugin.
- Inbound ports 80 and 443 open if using Caddy.
- DNS `A`/`AAAA` for the chosen hostname pointing at the host.
- A copy of this repository and a `.env` based on `.env.example`.

## 2. Set the public URL

In `.env` (or the shell that runs Compose), set:

```dotenv
APP_URL=https://your-domain.example
COOKIE_SECURE=true
TRUST_PROXY=true
```

`APP_URL` is used by invite emails, password resets, the email logo, unsubscribe links and board webhook URLs. It must be the public HTTPS origin, with no trailing slash. `COOKIE_SECURE=true` requires HTTPS; do not set it while testing over plain HTTP.

## 3. Choose a proxy

### Caddy (recommended)

```bash
cp deploy/Caddyfile.example deploy/Caddyfile
# Edit Caddyfile if you are not passing DOMAIN in the environment.
DOMAIN=your-domain.example \
  docker compose -f deploy/docker-compose.prod.example.yml up -d --build
```

Caddy obtains and renews the certificate automatically. The app is only exposed on the internal network; only Caddy publishes 80/443.

### Cloudflare Tunnel

Use `deploy/cloudflared.example.yml` as the starting point. Replace `YOUR_TUNNEL_ID`, the credentials path and the hostname. The tunnel connects to `http://tuesday:3000`; no inbound ports are needed. Keep `APP_URL` on the public HTTPS hostname.

## 4. Verify the deployment

```bash
docker compose -f deploy/docker-compose.prod.example.yml config >/dev/null
curl -fsS https://your-domain.example/api/health
```

Open the site, complete setup, create a board and an item, then restart the stack and confirm the item survives.

## 5. Email DNS

In the DNS page for your domain, add the SPF, DKIM and DMARC records your mail provider gives you. Then in Tuesday go to **Admin → Email → Check domain**. Do not send real mail until SPF and DMARC are found.

- SPF: a TXT record starting `v=spf1`, usually including `include:purelymail.com`.
- DKIM: publish the DKIM selector your mail provider gives you; Tuesday can only report it as an external check.
- DMARC: TXT at `_dmarc.your-domain.example`, for example `v=DMARC1; p=quarantine; rua=mailto:...`.

## 6. Backups

- Configure an off-site S3-compatible target (`BACKUP_S3_*`) or take regular local backups and copy them off the host.
- Run one backup through **Admin → Data**.
- Restore it into a throwaway instance and confirm a board and item return. The repository includes `scripts/restore-drill.sh` for a disposable Docker drill.
- Only after that, tick **Restore drill done** in the Go-live checklist.

## 7. Go-live checks

Admin → **Go-live checklist** should show pass or an explicit warning for:

- HTTPS `APP_URL`
- secure cookies
- SMTP configured and a successful test email
- SPF and DMARC found
- off-site backups configured and recent
- restore drill ticked
- `VAPID_SUBJECT` set
- AI budget set

## 8. Rollback

- The data volume is the source of truth. Keep the pre-update snapshot taken before a deploy.
- If the new container fails, start the previous image against the same volume only after taking a fresh backup.
- Do not delete the volume; use the Admin → Data restore path for a database rollback.

## 9. Publish a release and container image

Version tags publish a multi-arch image to GHCR. Ordinary commits do not build or publish an image.

```bash
git tag -a v0.1.0 -m "Tuesday v0.1.0"
git push origin v0.1.0
```

The `Publish container` workflow builds `ghcr.io/itchyparrot53/tuesday` for linux/amd64 and linux/arm64 with the tags `v0.1.0`, `0.1.0`, `0.1`, `0` and, for stable tags, `latest`. Publishing a GitHub Release from the same tag triggers the same workflow; if the tag is already published, the existing image is detected and the build is skipped.

Deploy the published image with:

```bash
cp .env.example .env
TUESDAY_VERSION=v0.1.0 docker compose -f docker-compose.release.yml up -d
```

If the package is private after the first publish, set it to Public in the package settings on GitHub.

## 10. After launch

- Test the share target from an installed Android PWA.
- Test the inbound webhook with a real sender.
- Send a test email to a Gmail and an Outlook address and check spam.
- Watch the first day of logs and AI/email usage.
