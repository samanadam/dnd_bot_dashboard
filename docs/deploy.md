# Deploying to the VPS

Target setup: the portal at **https://dashboard.example.com**, running as
containers on the VPS next to the recorder bot. Caddy (also a container) serves
HTTPS with an automatic Let's Encrypt certificate.

```
internet ──HTTPS :443──> caddy container ──> 127.0.0.1:3000 portal container ──> bot API
```

The portal needs about 70 MB of RAM and almost no CPU when running. Building
the image needs about 1.5 GB of RAM, so on a small VPS build it somewhere else
(option A or B below).

## 0. Once per VPS

- Docker Engine with the compose plugin (`docker compose version`).
- **DNS:** at your DNS provider, add
  `dcdashboard  A  <VPS IPv4>` (and `AAAA <VPS IPv6>` if it has one). Check
  with `nslookup dashboard.example.com` before starting Caddy, or the
  certificate request fails and Let's Encrypt rate-limits retries.
- **Firewall:** allow only SSH, 80 and 443 (e.g. `ufw allow OpenSSH`,
  `ufw allow 80,443/tcp`, `ufw enable`). Port 80 must be open for the
  certificate challenge and the HTTP→HTTPS redirect. The portal port is bound
  to 127.0.0.1, so it is never reachable from outside.
- Nothing else may already listen on 80/443. If another proxy is there, skip
  the Caddy container and use `deploy/nginx.conf` or add the site to that proxy.
- **Discord application** (Developer Portal > OAuth2): add the redirect
  `https://dashboard.example.com/api/auth/callback/discord`.

## 1. Get the files onto the VPS

Only these are needed on the VPS: `docker-compose.yml`, `compose.caddy.yml`,
`compose.host.yml` (if used), `.env.example` and `deploy/Caddyfile`.

```bash
git clone <your repo> dnd-portal && cd dnd-portal
```

## 2. Configure

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

`.env.example` is written for this setup; follow its comments. The choices
that matter:

| Setting | Value |
|---|---|
| `PORTAL_DOMAIN` | your bare hostname, e.g. `dashboard.example.com` — Caddy requests the certificate for it, and compose refuses to start without it |
| `AUTH_URL` | `https://` followed by the same hostname |
| `BOT_API_URL` | loopback (a), Docker network (b) or remote HTTPS (c) as described in the file |
| `AUTH_SECRET` | output of `openssl rand -base64 33`, used for nothing else |

## 3. Get the image

**A. Prebuilt from GitHub (recommended).** Pushing to `main` runs CI, which
tests everything and publishes `ghcr.io/<github-user>/dnd-portal` for amd64 and
arm64. On the VPS:

```bash
echo "PORTAL_IMAGE=ghcr.io/<github-user>/dnd-portal:latest" >> .env
# If the package is private, log in with a token that has read:packages only:
docker login ghcr.io -u <github-user>
docker compose pull
```

**B. Build on your PC and copy it over.**

```bash
# on your PC (use --platform linux/arm64 for an ARM VPS)
docker build --platform linux/amd64 -t dnd-portal:latest .
docker save dnd-portal:latest | gzip | ssh <user>@<vps> 'gunzip | docker load'
```

**C. Build on the VPS.** Only with at least 2 GB of RAM plus swap:
`docker compose build`.

## 4. Start

Pick the command that matches `BOT_API_URL` in `.env`:

```bash
# (a) bot on the VPS's loopback
docker compose -f docker-compose.yml -f compose.host.yml -f compose.caddy.yml up -d

# (b) bot as a container (uncomment the networks section in docker-compose.yml first)
# (c) remote bot over HTTPS
docker compose -f docker-compose.yml -f compose.caddy.yml up -d
```

Tip: put the chosen files in `.env` once, so every later command is just
`docker compose ...`:

```bash
echo "COMPOSE_FILE=docker-compose.yml:compose.host.yml:compose.caddy.yml" >> .env
docker compose up -d
```

Check it:

```bash
docker compose ps                             # portal "healthy", caddy "running"
curl -s http://127.0.0.1:3000/api/health      # {"status":"ok"}
docker compose logs caddy | grep -i certificate   # "certificate obtained successfully"
curl -sI https://dashboard.example.com/signin | head -1   # HTTP/2 200
```

`{"status":"misconfigured"}` means a value in `.env` is wrong; the log line
`Invalid server configuration: ...` names it without showing the value.

## 5. HTTPS

Handled by the Caddy container with `deploy/Caddyfile`:

- certificate issued and renewed automatically, stored in the `caddy_data` volume;
- HTTP redirects to HTTPS;
- `/api/health` is not served publicly;
- any other hostname pointed at the VPS gets no response.

Already running a proxy on the VPS? Leave out `compose.caddy.yml` and use
`deploy/nginx.conf`, or copy the site block from `deploy/Caddyfile`.

## 6. First-run checks

Walk the checklist at the end of [security.md](security.md). In short:

- Signed out: `https://dashboard.example.com/bot` redirects to sign-in, and
  `https://dashboard.example.com/api/bot/stats` returns 401.
- `http://dashboard.example.com` redirects to HTTPS, and
  `curl -m 5 http://<VPS IP>:3000` from another machine fails.
- An account without the admin role is refused at sign-in.
- The Overview shows the bot as online. Joining voice from Discord flips the
  status to Active within a few seconds.
- On a phone: start and stop a test recording, change the volume.

## What the container enforces

| Setting | Why |
|---|---|
| Port bound to 127.0.0.1 (or `HOSTNAME=127.0.0.1` with host networking) | Only the reverse proxy on the same machine can reach it |
| Runs as uid 1001, app files owned by root | A compromised process cannot rewrite the app |
| `read_only: true` + tmpfs for `/tmp` and the Next cache | Nothing on disk can be changed |
| `cap_drop: ALL`, `no-new-privileges` | No kernel capabilities, no privilege escalation |
| `mem_limit: 512m`, `pids_limit`, log rotation | A runaway process cannot take the bot down with it |
| Healthcheck on `/api/health` | Says only `ok` or `misconfigured` |
| Shared 2-second read cache | However many dashboards are open, the bot sees about 30 requests a minute, well under its 60/min limit |

## Updating

```bash
cd /opt/dnd-bot-dashboard && sh deploy/deploy.sh
```

It pulls the code and the image, recreates the portal, waits up to two minutes
for it to report healthy and otherwise puts the previous image back (and sends
an alert, see below). Exit code 0 means the new version is live.

With a locally loaded image (option B) run `docker compose up -d` instead.

## DM Screen

The bestiary, NPCs, combat tracker and dice are only for the Discord user ids in
`DM_USER_IDS` (your own id: Discord Developer Mode, right-click yourself, Copy
User ID). Everyone else, admins included, gets a 404.

```bash
echo "DM_USER_IDS=<your user id>" >> /opt/dnd-bot-dashboard/.env
sh deploy/deploy.sh
```

"Send to Discord" posts through the bot. Set the channel on the bot and
recreate it (only while nothing is recording):

```bash
echo "DICE_CHANNEL_ID=<text channel id>" >> /opt/dnd-bot/.env
cd /opt/dnd-bot && docker compose up -d
```

DM data (your monsters, NPCs, encounters) lives in the `portal_data` Docker
volume. `docker compose down -v` deletes it. A daily copy goes to R2 under
`backups/portal/`, kept for 30 days:

```bash
sudo cp deploy/systemd/dnd-portal-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dnd-portal-backup.timer
sudo systemctl start dnd-portal-backup.service && journalctl -u dnd-portal-backup -n 5
```

To restore, download `portal-YYYY-MM-DD.db` from the R2 bucket, then:

```bash
docker compose stop portal
docker run --rm -v dnd-bot-dashboard_portal_data:/data -v "$PWD":/in alpine   sh -c 'cp /in/portal-YYYY-MM-DD.db /data/portal.db && rm -f /data/portal.db-wal /data/portal.db-shm && chown 1001:1001 /data/portal.db'
docker compose start portal
```

## Music uploads and the soundboard

Uploading and deleting tracks, and the soundboard, are DM-only. Files go
browser → portal → bot → R2; nothing is stored on the host. The bot checks the
name, the first bytes and ffprobe's answer before anything reaches the bucket.

Bucket layout under `MUSIC_R2_PREFIX` (default `music/`):

| Where | What | Shown in |
|---|---|---|
| `music/` | Tracks | Music page library |
| `music/ambience/` | Looping ambience | Soundboard |
| `music/sfx/` | One-shot effects, 2 minutes at most | Soundboard |

The size cap is `MUSIC_UPLOAD_MAX_MB` on the bot (default 150). Keep it well
under the free space on the data disk: an upload passes through it, and raw
capture must never run out of room. Uploads need `ffmpeg`/`ffprobe`, which the
bot image already has.

Tags on sounds are kept by the portal, in its own database (`sound_tags`), and
are backed up with it. A tag is tied to a file by its bucket key, so renaming a
file in the bucket by hand drops its tags; deleting one from the portal clears
them.

The soundboard mixes over the music on the same voice connection, so it obeys
the same truce with the recorder: it never hangs up a connection a recording
owns. Ambience comes back by itself after a voice reconnect; effects do not.

## Upgrading to sound tags

The portal applies one database migration on start. A saved link's old
category becomes a tag on it (a comma inside one becomes a space), and the
category column is left in place, unused. The bot is not involved: it needs no
new version. Back up the portal database first if you want a way back, since
an older portal build refuses a database this new.

## Upgrading to campaigns, search, scenes and initiative

This release needs a new bot and a new portal; the transcriber can follow.

1. **Bot first.** Deploy it as usual. On start it applies two database
   migrations (campaigns, initiative reports) on top of the existing data;
   existing sessions keep working and show as "not in a campaign". Discord
   picks up the new commands (`/campaign`, `/init`, and the `campaign` option on
   `/session start` and `/character`) after the restart. Take a copy of the
   bot database before the first start if you want a rollback point.
2. **Then the portal**, with `deploy/deploy.sh`. Its own database gains three
   migrations (campaign columns, scenes, prepared encounters) the first time it
   starts. A copy from the daily R2 backup is your rollback point.
3. **Transcriber (optional, any time).** Copy the new `contract.py` from the
   bot repository into it. Until then it still works with the new bot, but it
   does not write the campaign into transcripts. Sessions recorded before the
   update, or with no campaign, are transcribed exactly as before.
4. **Once it is up, do these checks:**
   - `/campaign create` in Discord, then open **Campaigns** in the portal.
   - Start a short recording, stop it, and file it under a campaign from the
     Sessions page.
   - Search a word from an old transcript. The first search prepares the index
     and may ask you to search again in a moment.
   - On the Sound page, save what is playing as a scene and play it back; drag
     the seek bar on a real track.
   - In a test encounter, run `/init 15` as a player and apply it in the
     tracker.

If a step fails, the previous portal image is restored by `deploy.sh`. The bot
migrations only add tables and columns, so rolling the bot image back to the
previous version is safe: it ignores what it does not know.

## Transcripts

Every signed-in portal user can read a delivered transcript at
`/bot/sessions/<id>`, the same text the bot posts in the game channel. It is
read from the session's own directory on the bot's data disk, so it survives
long after the audio is cleaned up. Sessions the transcriber has not returned
yet show "No transcript yet".

## Autoheal and alerts

Docker marks a container unhealthy but never restarts it. `deploy/autoheal.sh`
does, after three failed checks in a row (about six minutes). It never restarts
the bot while a recording may be running; it alerts instead.

Alerts go to a Discord webhook (channel settings > Integrations > Webhooks). The
URL is a secret: it stays in a root-only file on the server.

```bash
sudo install -d -m 700 /etc/dnd-ops
sudo sh -c 'umask 077; read -r url; echo "$url" > /etc/dnd-ops/alert-webhook'   # paste the URL, Enter
sudo chmod 600 /etc/dnd-ops/alert-webhook

sudo cp deploy/systemd/dnd-autoheal.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dnd-autoheal.timer
sudo sh -c '. deploy/lib/alert.sh; alert "test alert"'
```

For outages of the whole server, add an external uptime check (for example
UptimeRobot) on `https://<your domain>/signin`.

Rotating secrets: change `AUTH_SECRET` (signs everyone out) or `BOT_API_TOKEN`
in `.env`, then run the step 4 command again.

## Logs and audit trail

```bash
docker compose logs -f portal
docker compose logs portal | grep '"type":"audit"'    # who did what
docker compose logs caddy                             # access log, certificates
```

## Try it locally first

```bash
docker compose -f docker-compose.yml -f compose.mock.yml up -d --build
```

Runs the container against the in-memory mock bot. Signing in still needs a
real Discord application.
