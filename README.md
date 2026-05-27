# Influencer-X

A free-tier MVP for influencers to share watermarked UGC previews with brand partners *before* payment. Videos live in the creator's own Google Drive (we pay zero storage), are streamed through a proxy that hides the original URL, and the player overlays a moving watermark with the brand's name, the creator's handle, and the share token.

## How it works

1. **Creator signs up** (Supabase Auth) and connects their Google Drive over OAuth.
2. **Creator adds a video** — either pick one from their Drive or upload a file straight from their device (which the app pushes into their Drive via the Drive API; we never store the bytes).
3. **Creator generates a share link** with optional expiry, and sends it to a brand.
4. **Brand opens the link**, types their company name, and watches in a custom HTML5 player. The watermark moves across the video the whole time and re-mounts itself if removed from the DOM. DevTools, right-click, drag-save, and tab-switching all trip the player into a paused/blurred state.
5. **Creator can revoke** any link any time.

> True undownloadability is impossible — anything that plays can be screen-recorded. This MVP raises the cost of leaking enough that casual misuse stops, and makes every leak visually traceable to the brand who received the link. For studio-grade DRM or invisible forensic watermarks, you need paid transcoding (Mux / Cloudflare Stream); see the post-MVP roadmap.

## Stack

- **Next.js 16 (App Router)** + TypeScript + React 19
- **Tailwind v4**
- **Supabase** (Postgres + Auth)
- **Google Drive API** (per-file scope — `drive.file`)
- **Edge runtime** for the streaming proxy

## Setup

### 1. Supabase

1. Create a project at https://supabase.com (free tier is enough).
2. Open **SQL Editor**, paste the contents of [supabase/migrations/0001_initial.sql](supabase/migrations/0001_initial.sql), and run.
3. In **Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`
4. (Optional) In **Authentication → URL Configuration**, set the **Site URL** to your dev URL (`http://localhost:3000`) so email links route correctly.

### 2. Google Cloud — OAuth + Drive API

1. Go to https://console.cloud.google.com → create or pick a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Add scopes: `.../auth/drive.file`, `openid`, `email`
   - Add your email under **Test users** while the app is in *Testing* mode.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:3000` (dev)
     - your production URL (after deploy)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/drive/google/callback`
     - `https://YOUR-DEPLOY-URL/api/drive/google/callback`
5. Copy **Client ID** → `GOOGLE_CLIENT_ID` and **Client secret** → `GOOGLE_CLIENT_SECRET`.

### 3. Env file

```bash
cp .env.example .env.local
# generate an AES key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# generate a signing secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the generated values into `AES_KEY` and `TOKEN_SIGNING_SECRET`, then fill in the Supabase + Google values.

### 4. Run

```bash
pnpm install   # only if you haven't yet
pnpm dev
```

Open http://localhost:3000.

## End-to-end smoke test

1. Sign up at `/signup` with any email/password (no email confirmation needed if Supabase confirmation is off; otherwise confirm via the link in your inbox).
2. From `/dashboard`, click **Connect Google Drive** → complete OAuth → you'll land on `/upload`.
3. Either pick a video from Drive or upload one from your device.
4. Click into the video → **Generate share link** with a 7-day expiry → copy the URL.
5. Open the URL in **incognito** and verify:
   - Brand-label gate appears; submit `Acme Co`.
   - Video plays, seek works, the moving watermark says `Acme Co • @<your-handle> • <token-tail> • <timestamp>`.
   - Right-click does nothing on the video.
   - Open DevTools — the video blurs heavily and pauses.
   - Switch tabs — playback pauses.
   - In the Network tab, the only video request is `/api/stream/<token>`; no `googleapis.com` URL or Drive file ID is exposed.
   - In Elements, delete the watermark `<canvas>` — it gets re-mounted.
6. Back in the creator dashboard, **Revoke** the link → refresh incognito → player shows "Link revoked".
7. Edit the link row in Supabase and set `expires_at` to a past time → refresh → "Link expired".

## Deploy

The app is built for Vercel free (Hobby) tier. Push the repo, import on Vercel, set the same env vars in **Settings → Environment Variables**, and add the deploy URL to the Google OAuth client's authorized origins + redirect URIs.

## What this MVP intentionally does **not** do

- DRM (Widevine / FairPlay)
- Invisible forensic watermarking (requires per-viewer transcoding)
- Dropbox / OneDrive providers
- Brand identity verification or login
- Payment workflow (release watermark-free original after payment)
- View analytics UI (the `view_events` table is populated, but there's no dashboard yet)
- Native mobile apps with screen-recording detection

See [the plan file](https://github.com) for the full post-MVP roadmap.
# influencer-x
