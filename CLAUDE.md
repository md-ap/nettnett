# NettNett - Project Documentation

## Overview

NettNett is a radio streaming platform and file management system built with Next.js. The public home page is a radio player streaming from **AzuraCast running on a Hetzner Cloud VPS**. Members upload files to Backblaze B2 (and optionally the Internet Archive). Admins run the whole radio from the **Management panel**: playlists, weekly calendar, live DJ sessions from the browser (no external software), URL broadcasts of public MP3s, and cloud-stored session recordings. Auth uses NileDB (Postgres-compatible) with a dark-themed Helvetica UI.

**Live deployment:** Vercel
**Tech stack:** Next.js 16.1.6 | React 19 | TypeScript | Tailwind CSS v4 | PostgreSQL | Backblaze B2 | Internet Archive | AzuraCast (Hetzner VPS)

**Page structure:**
- `/` — Public radio player (no login required)
- `/about`, `/curators`, `/participate`, `/program` — Public pages (route group `(public)`)
- `/login` — Auth page (login/register, Turnstile on both)
- `/forgot-password`, `/reset-password`, `/verify-email` — Public auth flows
- `/dashboard` — Member panel (upload/manage files; `user` role sees an access-request notice instead)
- `/management` — Radio management (`management`/`admin` roles; exclusive-lock sessions)
- `/admin` — User administration (admin role only)

**App shell:** one unified `Navbar` everywhere (logo + public links left; logged-in users get a user dropdown with Dashboard/Management/Admin/Logout, role-gated; hamburger on mobile). The stream player is a `FloatingPlayer` pill fixed bottom-right (minimizable), mounted once in the root layout — hidden on `/` (the home IS the big player) and on the minimal auth pages. Audio survives navigation (RadioProvider in root layout).

---

## Architecture

```
User (Browser)
  │
  ├── Vercel (Next.js App)
  │     ├── Auth (JWT + httpOnly cookies; roles user/uploader/management/admin
  │     │        enforced FRESH from DB via requireRole — fail-closed)
  │     ├── API Routes (upload, radio proxy, recordings, admin)
  │     ├── Dashboard / Management / Admin UI
  │     └── Native Live Studio (Webcast protocol over WebSocket)
  │
  ├── NileDB (Postgres-compatible)
  │     └── users, items, management_sessions (public schema)
  │
  ├── Backblaze B2 (S3-compatible)
  │     ├── nettnett1 (PUBLIC) — member uploads + radio media library
  │     │     └── {users.b2_folder}/item-title/files + metadata.json
  │     │         (folder allocated once at registration, UNIQUE — never
  │     │          re-derived from the non-unique first/last name)
  │     └── nettnett-recordings (PRIVATE) — live session recordings
  │           └── {dj_username}/stream_YYYYMMDD-HHMMSS.mp3 (+ .ia.json sidecars)
  │
  ├── Internet Archive (optional, for uploads and recordings)
  │
  ├── Hetzner Cloud VPS "nettnett-radio" (49.12.191.80, Falkenstein)
  │     └── AzuraCast (Docker, /var/azuracast) → radionettnettstream.com
  │           ├── Icecast (streaming) + Liquidsoap (auto-DJ)
  │           ├── Media storage = s3://nettnett1/ (reads the public bucket)
  │           ├── Recordings storage = s3://nettnett-recordings/ (writes)
  │           └── Harbor (port 8005) — live DJ input via Webcast WebSocket
  │
  └── UGREEN NAS (optional local backup only)
        ├── rclone webhook (sync.radionettnettstream.com) — B2→NAS backup
        └── legacy AzuraCast (decommission pending)
```

**Domains:**
- `radionettnettstream.com` (root, DNS-only/grey cloud) → Hetzner AzuraCast (stream, API, WebDJ)
- `radio.` / `sync.` subdomains → legacy NAS Cloudflare Tunnel (backup only)
- `nettnettradio.com` → future official site domain (pending Vercel hookup)

---

## File Structure (key paths)

```
nettnett/
├── app/
│   ├── (public)/                    # about, curators, participate, program
│   ├── (admin)/                     # dashboard, management, admin
│   ├── forgot-password/ reset-password/ verify-email/   # public auth pages
│   ├── api/
│   │   ├── auth/                    # register, login, logout, session,
│   │   │                            # forgot-password, reset-password,
│   │   │                            # verify-email, resend-verification
│   │   ├── request-access/route.ts  # "user" role requests a role (emails admin)
│   │   ├── files/                   # presign, finalize, delete, list,
│   │   │                            # update, send-to-ia (all canUpload-gated)
│   │   ├── radio/
│   │   │   ├── route.ts             # Authenticated proxy to AzuraCast API
│   │   │   │                        # (playlists, streamers, URL broadcast actions)
│   │   │   ├── schedule/route.ts    # Public schedule for calendar/program
│   │   │   ├── metadata/route.ts    # Public track metadata enrichment
│   │   │   └── broadcast-status/route.ts  # Public URL-broadcast status
│   │   ├── recordings/route.ts      # List/play/delete recordings + send to IA
│   │   ├── activity/route.ts        # Audit trail: GET paginated log (mgmt-gated),
│   │   │                            # POST whitelisted client events (stream.*)
│   │   ├── admin/users/...          # Admin user management
│   │   ├── management/session/      # Exclusive management lock (5min timeout)
│   │   └── setup/route.ts           # Idempotent DB setup + migrations
│   │                                # (ADMIN-gated; open only on fresh install)
│   ├── login/  ├── globals.css  └── layout.tsx / page.tsx
├── components/
│   ├── RadioPlayer.tsx / RadioProvider.tsx / FloatingPlayer.tsx
│   ├── ui/                          # Spinner, Modal, Button, Field primitives
│   ├── ManagementTabs.tsx           # Stream | URL Broadcast | Playlists |
│   │                                # Calendar | Streamers | Recordings | Logs
│   ├── ActivityLog.tsx              # Logs tab: audit trail list + filters
│   ├── NowPlayingControl.tsx / PlaylistManager.tsx / ScheduleCalendar.tsx
│   ├── StreamerManager.tsx          # DJ accounts + native Live Studio
│   ├── LiveStudio.tsx               # Browser broadcasting UI (mic picker,
│   │                                # signal check, VU meter, mute, metadata)
│   ├── UrlBroadcast.tsx             # Instant + scheduled URL broadcasts
│   ├── RecordingsManager.tsx        # Recordings list + IA publish + delete
│   ├── UploadForm.tsx / ItemList.tsx / RichTextEditor.tsx
│   ├── AdminPanel.tsx / ManagementGate.tsx / AuthForm.tsx
│   ├── Navbar.tsx                   # Unified nav (optional initialSession prop;
│   │                                # admin layout passes it, public self-fetches)
│   ├── RequestAccess.tsx            # Access-request notice for "user" role
│   ├── Turnstile.tsx                # Cloudflare Turnstile widget (dark)
├── lib/
│   ├── db.ts / db-init.ts / auth.ts # auth.ts: requireRole (fresh-DB, fail-closed),
│   │                                # getDbRole (display-only), hashToken, helpers
│   ├── user-folder.ts               # allocateB2Folder for new users
│   ├── activity-log.ts              # logActivity() — audit trail writes (never throws)
│   ├── constants.ts / format.ts / schedule.ts   # client-safe shared consts/helpers
│   ├── radio-client.ts              # postJson/radioPost/radioGet (AbortSignal)
│   ├── http-retry.ts / nas-webhook.ts  # webhook retry + NAS backup triggers
│   ├── app-url.ts                   # trusted APP_URL for emailed links
│   ├── url-guard.ts                 # SSRF guard (isPublicHttpUrl)
│   ├── email.ts                     # Resend + branded templates (Spanish)
│   ├── turnstile.ts                 # Server-side Turnstile verification
│   ├── b2.ts                        # Public bucket + titleToFolder/sanitizeFileName
│   ├── b2-recordings.ts             # Private recordings bucket (presigned GETs)
│   ├── internet-archive.ts          # IA S3 API via native https (LOW auth)
│   ├── audio-duration.ts            # Remote MP3 duration+title detection (SSRF-guarded)
│   └── webcaster.ts                 # Browser→harbor live streaming (Webcast)
├── middleware.ts                    # Route protection (cookie presence)
├── nas/                             # Legacy NAS webhook + tunnel config
└── .env.local
```

---

## Environment Variables

```bash
# NileDB (Postgres-compatible)
DATABASE_URL=postgres://...@us-west-2.db.thenile.dev/nettnett

# JWT Secret (7-day token expiry)
JWT_SECRET=...

# Backblaze B2 — main PUBLIC bucket (uploads + radio media)
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=nettnett1
B2_REGION=us-west-004

# Backblaze B2 — PRIVATE recordings bucket (AzuraCast writes live sessions)
B2_RECORDINGS_BUCKET_NAME=nettnett-recordings
B2_RECORDINGS_KEY_ID=...
B2_RECORDINGS_APPLICATION_KEY=...

# Internet Archive S3 API
IA_S3_ACCESS_KEY=...
IA_S3_SECRET_KEY=...

# AzuraCast Radio (Hetzner VPS, root domain, DNS-only)
NEXT_PUBLIC_AZURACAST_URL=https://radionettnettstream.com
AZURACAST_API_KEY=...        # admin API key created on the Hetzner AzuraCast
AZURACAST_STATION_ID=1

# Resend (transactional email) — resend.dev sender until the real domain is verified
RESEND_API_KEY=...
EMAIL_FROM=NettNett Radio <onboarding@resend.dev>
ADMIN_NOTIFY_EMAIL=quetelapongo@proton.me   # receives access-request notifications

# App base URL for emailed links (verification/reset/admin CTA) — never the Host header
APP_URL=https://nettnett.vercel.app

# Cloudflare Turnstile (anti-bot on register / LOGIN / forgot-password / resend-verification)
# REQUIRED in production: missing secret now fails closed (dev without keys still skips)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...          # build-time! registered for nettnett.vercel.app
TURNSTILE_SECRET_KEY=...

# NAS Sync Webhook (legacy backup, via Cloudflare Named Tunnel)
NAS_WEBHOOK_URL=https://sync.radionettnettstream.com/sync
NAS_WEBHOOK_SECRET=...
```

⚠️ `NEXT_PUBLIC_*` vars are baked at build time — changing them in Vercel requires a **Redeploy**.

---

## AzuraCast Server (Hetzner)

- **VPS:** Hetzner CPX12 (1 vCPU, 2GB, 40GB), Falkenstein, IP `49.12.191.80`, Ubuntu 24.04
- **Install:** official `docker.sh` at `/var/azuracast` (Stable channel); SSH as root with key auth
- **Station:** name/shortcode `nettnett`, station ID `1`
- **Stream URL:** `https://radionettnettstream.com/listen/nettnett/radio.mp3`
- **Now Playing API:** `https://radionettnettstream.com/api/nowplaying/nettnett`
- **HTTPS:** Let's Encrypt built into AzuraCast (requires the DNS record to be grey-cloud/DNS-only in Cloudflare)
- **Media storage:** Remote S3 → `s3://nettnett1/` (whole bucket, path-style ON). AzuraCast indexes the members' uploads automatically (~5min rescan); only files added to a playlist actually broadcast
- **Recordings storage:** Remote S3 → `s3://nettnett-recordings/` (private bucket). `record_streams` mp3 192kbps — every live DJ session is recorded and uploaded automatically on disconnect
- **Streamers enabled** (`enable_streamers`, harbor port 8005); WebDJ page at `/public/nettnett/dj`
- **Web Proxy for Radio: ON** — stream + WebDJ ride ports 80/443 (`/listen/...`, `wss://.../webdj/nettnett/`)

### Critical AzuraCast gotchas (learned the hard way)

1. **B2 canned-ACL rule:** AzuraCast's S3 writes send `x-amz-acl: private`. B2 only accepts an ACL matching the bucket's visibility → writes to the PUBLIC bucket fail (`Unsupported value for canned acl 'private'`) — this is why recordings live in a separate PRIVATE bucket. Cover-art writes to the public media bucket fail harmlessly (cosmetic).
2. **Remote playlist hijack:** a `remote_url` playlist with NO schedule items — even disabled — gets baked into the Liquidsoap config as an always-available `mksafe(input.http(...))` source and hijacks the rotation with empty metadata after a station restart. This also wedges the nowplaying worker ("No track to update" crash loop → station shows offline while audio streams). **Always DELETE URL-broadcast playlists, never just disable** (the app's stop action does this).
3. **Wedged nowplaying worker:** if `/api/nowplaying/nettnett` returns "Record not found" or stale data while the stream plays → `ssh root@49.12.191.80` then `docker exec azuracast supervisorctl restart php-nowplaying`.
4. **Admin API:** `X-API-Key` header. When PUTting `/api/admin/station/1`, send the FULL `backend_config` object — partial nested writes clobber the rest.

---

## Radio Management Features

All under `/management` (tabs), talking to AzuraCast through the authenticated proxy `app/api/radio/route.ts` (GET `?endpoint=...` whitelist + POST `{action: ...}`).

### URL Broadcast (tab)
Airs a public MP3/stream URL (replaces the legacy Telegram flow). **Instant:** creates a fresh `remote_url` playlist named `URL Broadcast — {title}`, schedules it "now" (station timezone) with `interrupt`, reloads; switch takes ~30s. **Stop:** DELETES the playlist + reload (see gotcha #2). **Scheduled:** one playlist per event (`URL: {title}`), date-bound, shows up in the Calendar tab. **Duration & title auto-detection** (`lib/audio-duration.ts`): exact via the IA metadata API (supports both `archive.org/download/...` and direct node `xxx.archive.org/N/items/...` URLs), else MP3 header parse (Xing/VBR-aware), else filename/1h fallback. Because remote streams usually carry no metadata (AzuraCast would show "Station Offline"), the human title is embedded in the playlist name and surfaced by the public endpoint `/api/radio/broadcast-status`, which `RadioProvider` polls to override the player display.

### Live Studio (Streamers tab)
Native browser broadcasting — no BUTT/external software. `lib/webcaster.ts`: mic capture → MP3 192kbps encoded in-browser (`@breezystack/lamejs`; note: only its ESM build exports `Mp3Encoder`) → WebSocket subprotocol `webcast` to `wss://radionettnettstream.com/webdj/nettnett/` → Liquidsoap harbor with DJ credentials. UI: mic picker + pre-live signal check (VU meter + signal dot), Go Live/End, mute (streams silence; connection and recording continue), now-playing title updates, leave-page warning. AzuraCast's WebDJ page remains linked as "Advanced studio" fallback. DJ accounts are managed in the same tab (create/edit/delete streamers).

### Recordings (tab)
Live sessions auto-record to the private bucket. The tab lists them (DJ, date, estimated duration from size@192kbps, size) with presigned play/download URLs, optional **publish to Internet Archive** (buffers B2→IA, identifier `nettnett-live-...`, sidecar `{key}.ia.json` marks sent state, route has `maxDuration = 300`), and delete (removes B2 object + sidecar; the IA copy stays).

### Playlists / Calendar / Streamers
Pre-existing features: playlist CRUD + song assignment by B2 path, weekly schedule with `interrupt` (AzuraCast times are integers 900=09:00, ISO days 1=Mon..7=Sun — NOT JS days), DJ account management.

### Logs (tab)
Audit trail of member/admin activity (`public.activity_log`, 180-day retention pruned on read). Server routes call `logActivity()` (`lib/activity-log.ts` — awaited, never throws) after successful mutations: uploads/edits/deletes/IA publishes, URL broadcasts (start/stop/schedule/delete), playlist + calendar + DJ-account changes, station actions, recordings, management-panel claims, admin user operations, registrations. Live-stream start/end is reported by the browser (LiveStudio → `POST /api/activity`, whitelisted `stream.*` actions only, since the DJ connects straight to the AzuraCast harbor). The tab lists entries with category badges, user, detail, timestamp; search + category filter + pagination.

---

## Auth, Roles & Email

### Role ladder (single `role` column; legacy `can_manage` superseded)
| Role | Upload files | Radio management | Admin panel |
|------|:---:|:---:|:---:|
| `user` (default on register) | ❌ dashboard shows access-request notice + button (emails `ADMIN_NOTIFY_EMAIL`) | ❌ | ❌ |
| `uploader` | ✅ | ❌ | ❌ |
| `management` | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ |

- **API guards use `requireRole(predicate)` (`lib/auth.ts`)** — ONE fresh DB read per request returning `{ session, role, b2Folder }`. Fail-closed: DB error → 503, deleted user with live JWT → 401. JWT `role`/`canManage` claims are never trusted for authorization. `getDbRole` remains for DISPLAY-ONLY spots (`/api/auth/session`, server pages) where a DB blip shouldn't log the UI out.
- Guarded APIs: all `/api/files/*` (incl. `list`) with `canUpload`; `/api/radio`, `/api/recordings`, `/api/management/session` with `canManageRadio`; all `/api/admin/*` with `isAdmin`; `request-access` authenticated + fresh role. `/api/auth/session` returns the FRESH role so the navbar gates links without re-login.
- **B2 tenant isolation:** each user gets a unique `users.b2_folder` allocated at registration (`lib/user-folder.ts`, name-derived + suffix on collision). Routes read `auth.b2Folder`; the folder is NEVER re-derived from the (non-unique) name. Backfill migration `migrateB2Folder` used the byte-identical legacy derivation so existing folders/AzuraCast paths kept working.
- Files input hardening: presign re-derives `titleToFolder(title)` and sanitizes file names (basename, control chars stripped, 180-char cap, ≤25 files); finalize 400s if the client `titleFolder` mismatches; delete/update/send-to-ia validate the folder slug shape.
- One-shot migrations tracked in `public.migration_log` (e.g. `roles_overhaul`: can_manage→management, old plain users→uploader). The `can_manage` column still exists but no code reads it.
- Admin panel: Role dropdown per user, Verified yes/no toggle, Add User modal picks a role (admin-created users are auto-verified); mobile shows cards instead of the table.

### Email verification
- Registration sends a combined welcome+verify email (7-day token, `public.email_verification_tokens` — matches the copy and the grace period); the account works immediately but **deactivates after a 7-day grace period** if unverified (login returns 403 + `needsVerification` flag → link to `/verify-email`, which verifies from the token or resends the link).
- Emailed links are built from `APP_URL` (`lib/app-url.ts`), never from the request Host header (host-spoofing would redirect valid tokens to an attacker domain).
- Admins can verify/unverify manually from the admin panel (`PATCH /api/admin/users/[id]/verify`).
- Existing users were grandfathered as verified.

### Transactional email (Resend)
- `lib/email.ts` — Resend via plain REST; branded dark layout ("nnr" wordmark, Helvetica, Spanish copy). Templates: welcome+verify, password reset, access request notification.
- **Sandbox limitation:** with the `onboarding@resend.dev` sender, Resend only delivers to the Resend account owner's email. Real delivery to all users requires verifying the future domain (`nettnettradio.com`) in Resend, then updating `EMAIL_FROM`.
- Password reset: `/forgot-password` → SHA-256-hashed token (1h, `public.password_reset_tokens`) → `/reset-password?token=`. Anti-enumeration on both forgot and resend endpoints.

### Turnstile (anti-bot)
- On register, **login**, forgot-password, and resend-verification. `components/Turnstile.tsx` renders nothing when the keys are unset, and `lib/turnstile.ts` skips verification **only outside production** — a missing secret in prod rejects requests instead of silently disabling protection.
- Tokens are single-use: `AuthForm` remounts the widget (key bump) after a failed submit.
- Site key is registered for `nettnett.vercel.app`; add `localhost` to the widget's allowed domains in the Cloudflare dashboard for local testing.

---

## Services Configuration

### NileDB (PostgreSQL)
- SSL required; **always use explicit `public.` schema** (NileDB has a built-in `users` table in its own schema)
- Tables: `public.users` (+ `role`, `email_verified`, `b2_folder` UNIQUE columns), `public.items`, `public.management_sessions`, `public.activity_log`, `public.password_reset_tokens`, `public.email_verification_tokens`, `public.migration_log`, legacy `public.files` (no longer created or read)
- Setup/migrations: `GET /api/setup` (idempotent; **admin-gated** — open only on a fresh install with no users)
- ⚠️ **Local `.env.local` and Vercel point at the SAME database** — migrations run locally are live in production immediately

### Backblaze B2
- SDK: `@aws-sdk/client-s3` with `forcePathStyle: true` (required for B2)
- `nettnett1` (public): browser uploads via presigned PUT URLs (`/api/files/presign` → direct upload → `/api/files/finalize`), bypassing Vercel's 4.5MB limit. Public URL: `https://f004.backblazeb2.com/file/nettnett1/{key}`
- `nettnett-recordings` (private): AzuraCast writes; app reads via presigned GETs
- File listing for the dashboard comes from B2 directly (`listUserItems(auth.b2Folder)`), not the DB

### Internet Archive
- S3-like API at `s3.us.archive.org`, `Authorization: LOW key:secret`
- Uses Node's native `https` (fetch breaks the LOW auth header); handles 307 redirects
- Deletes are queued and slow (hours/days); `x-archive-cascade-delete: 1`

### Management sessions
- Exclusive lock: only one user edits the radio at a time (`public.management_sessions`, 5-min inactivity timeout, kick/release/heartbeat via `/api/management/session`). The claim runs in a transaction; a concurrent claim returns 409 (partial unique index on `is_active`).

---

## Development

```bash
npm install
npm run dev          # usually http://localhost:3001 (3000 taken by other projects)
# First-time DB setup: visit /api/setup (admin-gated once users exist;
# open only while the users table is missing/empty)
npm run build
npx tsc --noEmit     # typecheck
```

Git remote: `git@github.com:md-ap/nettnett.git` (SSH as `md-ap`). Vercel auto-deploys `main`.

---

## Known Issues & Notes

- **Resend sandbox:** emails only deliver to the Resend account owner until the domain is verified (see Auth section) — new users won't receive verification/reset emails yet; admins can verify them manually from the admin panel
- **Remote streams show no metadata natively** — mitigated app-side via `/api/radio/broadcast-status` override (see URL Broadcast section)
- **IA deletes are async** — items linger on archive.org for hours after deletion
- **Bots hammer the SFTP port (2022)** on the Hetzner box — pending: Hetzner Cloud Firewall (allow 22/80/443 only; SFTP unused since media lives in B2)
- **Crossfade set to `none`** during debugging (was not the culprit) — can be re-enabled via station backend_config
- **CPX12 is the smallest viable size** — if Liquidsoap struggles under load, rescale to CPX22 with "CPU/RAM only" (keeps the change reversible)
- **NAS decommission pending** — the `sync.` webhook still fires after uploads (harmless local backup, `lib/nas-webhook.ts`); the old NAS AzuraCast and `radio.` tunnel hostname can be retired
- Middleware only checks cookie presence (JWT not verifiable in Edge runtime); full verification happens server-side (requireRole per route)
- **SSRF guard scope:** `lib/url-guard.ts` blocks private/internal targets for URL-broadcast duration detection; DNS rebinding is out of scope (callers are management-gated)

---

## Deployment (Vercel)

1. **Before pushing schema-affecting changes:** add/confirm env vars in Vercel (`APP_URL`, `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are hard-required in prod), then run `GET /api/setup` **locally first** — local and prod share the same NileDB, and old prod code ignores new columns, so migrating before the deploy is the safe order.
2. Push to `main` → auto-deploy
3. Env vars live in the Vercel dashboard (remember: `NEXT_PUBLIC_*` changes need a Redeploy)
4. After deploy: a **logged-in admin** visits `/api/setup` once (idempotent; the endpoint is admin-gated now)
