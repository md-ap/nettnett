# NettNett - Project Documentation

## Overview

NettNett is a radio streaming platform and file management system built with Next.js. The public home page is a radio player streaming from AzuraCast (running on a UGREEN NAS via Cloudflare Tunnel). Admins can upload files to Backblaze B2 cloud storage and optionally to the Internet Archive. The app uses NileDB (Postgres-compatible) for user authentication and a dark-themed UI with Helvetica typography.

**Live deployment:** Vercel
**Tech stack:** Next.js 16.1.6 | React 19 | TypeScript | Tailwind CSS v4 | PostgreSQL | Backblaze B2 | Internet Archive | AzuraCast

**Page structure:**
- `/` — Public radio player (no login required)
- `/login` — Auth page (login/register)
- `/dashboard` — Admin panel (upload/manage files, requires login)

---

## Architecture

```
User (Browser)
  │
  ├── Vercel (Next.js App)
  │     ├── Auth (JWT + httpOnly cookies)
  │     ├── API Routes (upload, delete, list)
  │     └── Dashboard UI
  │
  ├── NileDB (Postgres-compatible)
  │     └── users table (auth only)
  │
  ├── Backblaze B2 (S3-compatible)
  │     └── nettnett1 bucket
  │         └── user_firstname_lastname/
  │             └── item-title-folder/
  │                 ├── file1.mp3
  │                 ├── file2.jpg
  │                 └── metadata.json
  │
  ├── Internet Archive (optional)
  │     └── identifier: user_firstname_lastname-item-title
  │
  └── UGREEN NAS (DXP4800 Plus)
        ├── AzuraCast (Docker) → Radio streaming
        │     ├── Icecast (streaming server)
        │     └── Liquidsoap (auto-DJ)
        ├── rclone (Docker) → B2 backup sync
        └── Cloudflare Tunnel (Docker) → Public access
              └── https://[random].trycloudflare.com
```

---

## File Structure

```
nettnett/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register/route.ts   # Register user + create B2 folder
│   │   │   ├── login/route.ts      # Login with bcrypt verify
│   │   │   └── logout/route.ts     # Clear session cookie
│   │   ├── files/
│   │   │   ├── upload/route.ts     # Upload to B2 + optional IA
│   │   │   ├── delete/route.ts     # Delete from B2 + optional IA
│   │   │   └── list/route.ts       # List items from B2
│   │   └── setup/route.ts          # One-time DB table creation
│   ├── login/
│   │   └── page.tsx                # Auth landing (logo + AuthForm)
│   ├── dashboard/
│   │   ├── layout.tsx              # Auth check + Navbar wrapper
│   │   └── page.tsx                # UploadForm + ItemList
│   ├── globals.css                 # Black theme, Helvetica
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Public radio player home
├── components/
│   ├── RadioPlayer.tsx              # AzuraCast stream player
│   ├── AuthForm.tsx                # Login/Register toggle form
│   ├── Navbar.tsx                  # Sticky navbar, hide on scroll
│   ├── UploadForm.tsx              # Two-column upload form
│   ├── ItemList.tsx                # Uploaded items with IA badges
│   ├── RichTextEditor.tsx          # contentEditable rich text
│   ├── FileUploadZone.tsx          # (legacy) Simple upload zone
│   └── FileList.tsx                # (legacy) Simple file list
├── lib/
│   ├── db.ts                       # Postgres pool (NileDB)
│   ├── db-init.ts                  # CREATE TABLE scripts
│   ├── auth.ts                     # JWT sign/verify/session
│   ├── b2.ts                       # Backblaze B2 S3 client
│   └── internet-archive.ts         # IA upload/delete via https
├── middleware.ts                    # Route protection
├── public/
│   └── logo_nettnett.jpg
└── .env.local                      # All credentials
```

---

## Environment Variables

```bash
# NileDB (Postgres-compatible)
DATABASE_URL=postgres://...@us-west-2.db.thenile.dev/nettnett

# JWT Secret (7-day token expiry)
JWT_SECRET=your-secret-key

# Backblaze B2 (S3-compatible)
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-app-key
B2_BUCKET_NAME=nettnett1
B2_REGION=us-west-004

# Internet Archive S3 API
IA_S3_ACCESS_KEY=your-ia-access-key
IA_S3_SECRET_KEY=your-ia-secret-key

# AzuraCast Radio (NAS via Cloudflare Tunnel)
NEXT_PUBLIC_AZURACAST_URL=https://[random].trycloudflare.com
```

---

## Services Configuration

### NileDB (PostgreSQL)

- **Provider:** NileDB (Postgres-compatible, serverless)
- **Connection:** SSL required (`rejectUnauthorized: false`)
- **Important:** NileDB has a built-in `users` table in the `users` schema. Our app uses `public.users` to avoid conflicts. All SQL queries must use explicit `public.` schema prefix.
- **Tables:**
  - `public.users` - User accounts (id, email, first_name, last_name, password_hash)
  - `public.files` - File metadata (mostly unused, file listing comes from B2 directly)
- **Setup:** Hit `GET /api/setup` once to create tables

### Backblaze B2

- **SDK:** `@aws-sdk/client-s3` with `forcePathStyle: true` (required for B2)
- **Bucket:** `nettnett1` (public readable)
- **Public URL pattern:** `https://f004.backblazeb2.com/file/nettnett1/{key}`
- **Folder structure:** `user_firstname_lastname/item-title/files`
- **Metadata:** Each item has a `metadata.json` file alongside its uploaded files
- **File listing:** Items are listed directly from B2 (not from database). The `listUserItems()` function reads B2 objects, groups by folder, and parses `metadata.json` for each item.
- **On user registration:** A folder `user_firstname_lastname/` is created in B2

### Internet Archive

- **API:** S3-like API at `s3.us.archive.org`
- **Auth:** `Authorization: LOW access_key:secret_key` header
- **Important:** Uses Node.js native `https` module (NOT `fetch`). The `fetch` API interferes with the `Authorization: LOW` header format.
- **Identifier format:** `user_firstname_lastname-item-title` (sanitized, max 80 chars)
- **Metadata headers:** Sent as `x-archive-meta-*` headers on first file upload only
- **Auto-bucket:** First file upload creates the IA item with `x-archive-auto-make-bucket: 1`
- **Collection:** Defaults to `opensource`
- **Deletion:** IA deletes are queued and NOT instant (can take hours/days). Uses `x-archive-cascade-delete: 1` header.
- **307 Redirects:** The `iaRequest()` function handles 307 redirects from IA's S3 API
- **Account:** Items appear under the IA account associated with the S3 keys

---

### AzuraCast (Radio Streaming)

- **Runs on:** UGREEN DXP4800 Plus NAS (Docker)
- **Installation path:** `/volume1/docker/azuracast/`
- **Local access:** `http://192.168.1.102:8080`
- **Public access:** Via Cloudflare quick tunnel (URL changes on restart)
- **Admin login:** `admin@admin.com` (local only)
- **Station name:** `nettnett`
- **Components:** Icecast (streaming) + Liquidsoap (auto-DJ)
- **Stream URL:** `${AZURACAST_URL}/listen/nettnett/radio.mp3`
- **Now Playing API:** `${AZURACAST_URL}/api/nowplaying/nettnett`
- **Quick tunnel note:** URL is random and changes if container restarts. Check new URL with: `sudo docker logs cloudflare-tunnel`
- **Docker containers on NAS:** `azuracast`, `azuracast_updater`, `cloudflare-tunnel`, `rclone-backblaze-sync`, `qbittorrent`

---

## Authentication Flow

1. **Register:** `POST /api/auth/register`
   - Validates email, firstName, lastName, password (min 6 chars)
   - Hashes password with bcrypt (12 salt rounds)
   - Inserts into `public.users`
   - Creates B2 user folder
   - Signs JWT and sets `nettnett_session` httpOnly cookie (7 days)

2. **Login:** `POST /api/auth/login`
   - Queries `public.users` by email
   - Compares password with bcrypt
   - Signs JWT and sets cookie

3. **Session:** `getSession()` in `lib/auth.ts`
   - Reads cookie, verifies JWT
   - Returns `{ userId, email, firstName, lastName }` or null

4. **Middleware:** Checks cookie presence only (JWT not verifiable in Edge runtime)
   - `/` is public (radio player, no auth check)
   - `/login` with cookie → redirect to `/dashboard`
   - `/dashboard/*` without cookie → redirect to `/login`

5. **Logout:** `POST /api/auth/logout` → clears cookie

---

## Upload Flow

1. User fills the UploadForm (title, description, files, optional metadata)
2. Client sends `FormData` to `POST /api/files/upload`
3. Server verifies JWT session
4. Files uploaded to B2: `user_folder/title_folder/filename`
5. If "Upload to Internet Archive" is checked:
   - Sanitize title into IA identifier
   - Upload each file to IA with metadata headers (first file only)
   - Store IA identifier and URL in metadata
6. Save `metadata.json` to B2 with all item info
7. Return success response

---

## Key Technical Decisions

- **Auth:** bcryptjs (pure JS, Vercel-compatible) + jsonwebtoken + httpOnly cookies
- **DB:** `pg` Pool with SSL for NileDB. Used `public.` schema prefix to avoid NileDB's built-in `users` table
- **B2:** `@aws-sdk/client-s3` with `forcePathStyle: true` (required for B2 compatibility)
- **IA:** Native `https` module instead of `fetch` (fetch interferes with LOW auth header)
- **File listing:** Reads directly from B2 bucket (not from database) for accuracy
- **Rich text:** Custom `contentEditable` editor (no external dependency). Outputs HTML accepted by Internet Archive
- **Uploads:** Server-side via API route (FormData). Vercel 4.5MB limit applies
- **Middleware:** Only checks cookie presence. Full JWT verification in server components/API routes
- **File keys:** `user_firstname_lastname/item-title-folder/filename` format

---

## Components

### RadioPlayer (`components/RadioPlayer.tsx`)
- Streams audio from AzuraCast via HTML5 `<audio>` element
- Polls AzuraCast `/api/nowplaying/nettnett` every 15 seconds
- Shows current track title and artist
- Play/Pause toggle with large circular button
- Visual equalizer animation when playing
- LIVE badge when a streamer is connected
- Listener count display
- Graceful "Station Offline" state
- Stream URL from `NEXT_PUBLIC_AZURACAST_URL` env variable

### UploadForm (`components/UploadForm.tsx`)
- Two-column responsive layout (stacks on mobile)
- Left: Title, Description (rich text), Media Type, Creator, Date, Language, Tags
- Right: Drag & drop zone, file list, IA checkbox, progress bar, upload button
- Progress tracking with step indicators
- All user-facing text says "Cloud" (not "Backblaze")

### ItemList (`components/ItemList.tsx`)
- Lists uploaded items with IA status badges (green "Internet Archive" or gray "Cloud only")
- Each item shows files with "Ver" (view) links to B2 public URLs
- Delete button with different confirmation for IA items
- Date formatting

### Navbar (`components/Navbar.tsx`)
- Sticky positioned, hides on scroll down, shows on scroll up
- `h-14` height with backdrop blur
- Shows "Welcome, FirstName LastName" + Logout button
- Logo on the left

### RichTextEditor (`components/RichTextEditor.tsx`)
- `contentEditable` div with toolbar
- Buttons: Bold, Italic, Underline, H1, H2, P, Lists, Link, Clear
- Outputs HTML (compatible with IA descriptions)
- Paste handler strips formatting (plain text only)

### AuthForm (`components/AuthForm.tsx`)
- Toggle between Sign In and Register modes
- Fields: email, password, firstName (register), lastName (register)
- Error handling and loading states

---

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# First-time setup: create database tables
# Visit http://localhost:3000/api/setup

# Build for production
npm run build
```

---

## Known Issues & Notes

- **Vercel file size limit:** 4.5MB per upload (Vercel serverless function limit)
- **IA deletes are async:** Items may still appear on archive.org for hours after deletion
- **NileDB schema:** Always use `public.users` and `public.files` in queries to avoid NileDB's built-in `users` table conflict
- **Middleware deprecation:** Next.js 16 shows warning about `middleware` → `proxy` migration. Currently functional but may need updating.
- **Legacy components:** `FileUploadZone.tsx` and `FileList.tsx` are superseded by `UploadForm.tsx` and `ItemList.tsx`

---

## NAS Integration (UGREEN DXP4800 Plus)

- **rclone (Docker):** Syncs Backblaze B2 bucket to NAS as backup
- **Sync path:** `Shared Folder > docker > rclone > data > user_mario_alvarado`
- **Purpose:** Local backup of all uploaded files + future radio streaming source

---

## Deployment (Vercel)

1. Push to GitHub
2. Connect repo to Vercel
3. Add all environment variables in Vercel dashboard
4. Deploy
5. Run `/api/setup` once to create database tables
