# DriveGallery

A client-side photo and video manager that stores everything in **your own Google Drive**. You sign in with Google and the app keeps your media in a `DriveGallery` folder in My Drive. The browser talks to the Google Drive API v3 directly. An optional Cloudflare Worker keeps *linked* accounts connected (see below); your files never pass through it.

Built with Vite, React, Tailwind CSS, framer-motion, `@react-oauth/google`, `react-dropzone` and `lucide-react`, plus a small Cloudflare Worker (Workers KV) for linked accounts.

## Features

- **Sign in with Google** (implicit/token flow). The access token is kept in `sessionStorage`, so a page reload keeps you signed in; closing the tab (or signing out) clears it. When it expires, or Drive returns 401, the app silently asks for a new token and replays the request. If that's blocked, a "Session expired, Continue" prompt appears.
- **Least privilege**: the app uses only the `drive.file` scope, so it can see files it created and nothing else in your Drive.
- **Browse**: folders and nested subfolders, breadcrumbs, grid and list views, sort by name, date or size, search by name across the whole gallery, an All / Images / Videos filter, and infinite scroll with Drive `pageToken`s.
- **Upload**: drag and drop anywhere on the page, or use the file picker. Up to 3 uploads run at once, each with progress, speed, cancel and retry.
  - Images are compressed in the browser: the longest side is capped at 2560px and they're re-encoded as **WebP** (quality 0.82), usually 25–35% smaller than JPEG. Browsers that can't encode WebP keep the original format. Turn this off with **Upload ▾ → Original quality**.
  - Videos and any file over 5 MB use Drive's **resumable upload** in 4 MiB chunks. If the network drops, the upload picks up from the last byte Drive stored.
- **Lightbox**: fullscreen viewer with a shared-element transition from the thumbnail. Navigate with ← → or swipe. Images zoom with + / −, the mouse wheel or a double-click, and you can pan while zoomed. Videos play in a built-in player.
- **Organize**: rename (F2), move with a folder picker or by dragging items onto a folder, breadcrumb or sidebar entry, multi-select (checkboxes, Shift-click, Ctrl/⌘-click, Ctrl/⌘-A), and bulk move, delete or download.
- **Delete** moves items to the Drive trash with an **Undo** toast. Deleting a folder asks for confirmation first.
- **Download** originals, singly or in bulk (one file at a time, with a progress indicator). **Open in Google Drive** links are available too.
- **Storage pool across Google accounts.** Link extra Google accounts (sidebar → **Storage** → **Link account**) and their free space adds up: two free accounts give 30 GB. Each account keeps its own `DriveGallery` folder, and the gallery shows them merged (same-named folders become one folder). New uploads go to the first account with room, main account first; if Google reports an account full, the upload moves on to the next one.
  - Linked accounts are handled by the **Cloudflare Worker**, which keeps each one's refresh token encrypted, so they **stay linked** across sign-outs, closed tabs and devices. They only need reconnecting if Google stops accepting the grant (access revoked, password change, or the 7-day limit of apps in *Testing* mode).
  - **Unlink** revokes that account's access; its files stay in its own Drive. Up to 9 extra accounts.
  - Without the Worker the app works as before with the main account only.
- **Send from your phone.** On the laptop, click the phone icon next to **Upload** (or **Upload ▾ → Send from your phone…**) and scan the QR code with your phone. Sign in with the same Google account, choose photos from the phone's gallery, then **flick the phone toward the laptop** (or tap **Send**). The photos upload straight from the phone to Drive, into whatever folder the laptop has open, and appear on the laptop as they land. Needs the Worker (it hosts the pairing room) and HTTPS (motion sensors only work on secure pages; iPhones ask once for motion access).
- **Storage** card in the sidebar: pooled usage with a bar split by account, and a **Google accounts** dialog with per-account usage, upload order and link / reconnect / unlink. It turns amber at 80% and red at 95%.
- A light, minimal layout with a dark mode (System / Light / Dark toggle in the sidebar): a fixed sidebar (All media, Recents, Favorites, your folders, storage) that becomes a slide-in drawer on mobile. Animations respect `prefers-reduced-motion`.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` or `Ctrl/⌘ K` | Focus search |
| Arrow keys | Move focus between items (in the grid) or go to the next/previous item (in the lightbox) |
| `Enter` | Open the focused item |
| `Space` | Select or deselect the focused item |
| `Shift`-click | Select a range |
| `Ctrl/⌘ A` | Select everything |
| `Delete` | Move the selection to the trash |
| `F2` | Rename |
| `Esc` | Close the lightbox, menu or dialog, or clear the selection |
| `+` / `-` / `0` | Zoom in, zoom out, reset zoom (lightbox) |

## 1. Google Cloud setup

1. **Create a project.** Open the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or pick an existing one).
2. **Enable the Drive API.** Go to **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. **Configure the OAuth consent screen.** Go to **APIs & Services → OAuth consent screen**. In the newer console this is **Google Auth Platform → Branding / Audience / Data access**.
   - User type: **External**. Choose Internal only if everyone who will use it is in your Google Workspace org.
   - Fill in the app name, support email and developer contact.
   - **Scopes / Data access**: add `.../auth/drive.file`, `openid`, `.../auth/userinfo.profile` and `.../auth/userinfo.email`.
   - **Test users / Audience**: while the app is in *Testing* mode, add the Google account of everyone who should be able to sign in. You can add up to 100. Anyone else gets an "Access blocked" error.
4. **Create the OAuth client.** Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173`. Add your production origin too, for example `https://gallery.example.com`.
   - Leave *Authorized redirect URIs* empty. The token flow uses a popup, not a redirect.
   - Copy the **Client ID**.

> Origin changes can take a few minutes to propagate. If you see `origin_mismatch` or `idpiframe_initialization_failed`, check that the origin matches exactly (scheme, host and port), then wait and retry.

## 2. Run it locally

Requires Node 18 or newer.

```bash
npm install
cp .env.example .env
# edit .env and set VITE_GOOGLE_CLIENT_ID=<your client id>.apps.googleusercontent.com
npm run dev
```

Open http://localhost:5173 and sign in. On first login the app creates the `DriveGallery` folder at the top of My Drive.

To build for production:

```bash
npm run build     # outputs dist/
npm run preview   # serves dist/ on http://localhost:5173
```

`dist/` is a static site, so you can host it anywhere (Netlify, Vercel, GitHub Pages, S3, and so on). Remember to add that origin to the OAuth client.

## 2b. Linked accounts Worker (optional)

The main sign-in never touches the Worker. It only handles linked accounts: it runs Google's authorization-code flow for each one, keeps the refresh token encrypted (AES-GCM) in Workers KV, and hands the app short-lived access tokens. The app proves who it is with the main account's Google access token, which the Worker checks with Google and requires to be issued to your OAuth client.

**Google Cloud:** on the same OAuth client, add these **Authorized redirect URIs**, and copy the **Client secret**:

- `http://localhost:5173/link/callback` (development)
- `https://<your worker host>/link/callback` (production)

**Local development** (a second terminal next to `npm run dev`; Vite forwards `/api` and `/link` to it):

```bash
cp .dev.vars.example .dev.vars
```

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a `TOKEN_KEY` from:

```bash
openssl rand -base64 32
```

```bash
npm run dev:worker
```

`wrangler dev` simulates KV locally, so no Cloudflare account is needed for development.

**Deploy:**

1. Sign in to Cloudflare: `npx wrangler login`.
2. Create the KV namespace and paste the printed `id` into `wrangler.jsonc`:

   ```bash
   npx wrangler kv namespace create DG_KV
   ```

3. In `wrangler.jsonc`, set `APP_ORIGINS` to your app's origin (for example `https://gallery.example.com`).
4. Add the secrets (use a **new** `TOKEN_KEY` for production):

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   ```

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

   ```bash
   npx wrangler secret put TOKEN_KEY
   ```

5. Deploy, then add its `/link/callback` URL to the OAuth client:

   ```bash
   npm run deploy:worker
   ```

6. Build the app with `VITE_LINK_API_URL` set to the Worker's URL (for example `https://drivegallery-links.<you>.workers.dev`).

The same deploy creates the `BeamRoom` Durable Object used by **Send from your phone** (see `durable_objects` and `migrations` in `wrangler.jsonc`). It only relays small messages between the laptop and the phone; photos never pass through it. To try it from a real phone during development, the phone must reach the app over HTTPS on an origin listed in the OAuth client (for example a Cloudflare or ngrok tunnel to `localhost:5173`), since phones can't open the laptop's `localhost`.

Keep `TOKEN_KEY` safe: if it changes, stored refresh tokens can't be decrypted and each linked account has to reconnect once.

## 3. Moving from Testing to production

While the consent screen's publishing status is **Testing**:

- only the listed test users can sign in, up to 100 of them;
- users see an "unverified app" warning;
- grants expire after 7 days, so users re-consent weekly. With the token flow they'd be re-prompted anyway once a token expires and the silent refresh can't run.

To open the app to everyone:

1. On the consent screen, add your **app homepage**, **privacy policy URL** and **terms of service URL**. They must be on a domain you own.
2. **Verify domain ownership** of those URLs and of your production origin in [Google Search Console](https://search.google.com/search-console). Then add the domain under **Authorized domains**.
3. Click **Publish app** to move the status from Testing to **In production**.
4. **Verification:**
   - `drive.file`, `openid`, `profile` and `email` are all **non-sensitive** scopes. You don't need the security assessment that sensitive or restricted scopes (like full `drive`) require.
   - If you show an app name and logo on the consent screen, Google runs a lighter **brand verification**, which typically takes a few business days. Submit it from the consent-screen page, and answer any email from the Trust & Safety team promptly.
   - Once verified, the "unverified app" warning disappears and the 100-user cap no longer applies.

Asking for a broader scope later, such as `drive.readonly` to show files the user didn't create with this app, would make the app **sensitive or restricted**. That means a full review and possibly a third-party security assessment, which is a good reason to stay on `drive.file`.

## Project structure

```
worker/
  index.js          Cloudflare Worker for linked accounts: OAuth code flow + PKCE, encrypted
                    refresh tokens in KV, /api/links, /api/token, /api/unlink; BeamRoom
                    Durable Object relaying phone → laptop pairing messages (/api/beam/{room})
src/
  lib/
    drive.js        All Drive API calls: list, folders, simple + resumable upload, rename,
                    move (addParents/removeParents), trash/restore, download, quota.
                    Centralized errors, 401 → refresh → retry, backoff on 429/5xx.
    mediaCache.js   Ref-counted blob: URL cache for thumbnails/media (revoked when unused)
    compress.js     Client-side image resize/re-encode
    beam.js         Send from phone: pairing room ids, QR link, WebSocket with reconnect
    format.js, motion.js, dnd.js
  context/
    AuthContext.jsx Main token in memory, expiry tracking, silent refresh + "Session expired" fallback;
                    linked-account tokens from the Worker
    ToastContext.jsx
  hooks/
    useAuth, useDriveFolder (pagination + optimistic updates), useUploadQueue (3 concurrent),
    useBeamHost (laptop side of Send from phone), useFlick (DeviceMotion flick detection),
    useSelection (checkbox + Shift-range), useMediaUrl (lazy thumbnails via IntersectionObserver),
    useCollection, useToast
  components/
    Login, Sidebar, TopBar, Breadcrumbs, FileGrid, FileList, FolderCard, MediaCard, Lightbox,
    UploadPanel, ContextMenu, MoveDialog, RenameDialog, ConfirmDialog, StorageCard, Toasts,
    EmptyState, DropOverlay, SelectionBar, Skeletons, ui (Modal, Dropdown, Switch, …),
    BeamDialog (QR + "Receiving…" pill), BeamSend (phone screen: pick, flick, send)
  Gallery.jsx       The signed-in workspace that wires everything together
```

## How the Drive parts work

- **Queries.** A folder listing uses `'FOLDER_ID' in parents and trashed=false` plus a MIME clause (`mimeType contains 'image/'` and so on). `orderBy=folder,<key>` keeps folders ahead of files on every page. Search drops the parent clause and uses `name contains '…'`. Because of `drive.file`, that still only covers the app's own files.
- **Moving.** There's no move endpoint. Instead the app sends `PATCH files/{id}?addParents=NEW&removeParents=OLD` in a single atomic request.
- **Resumable upload.** The app POSTs the metadata, and Drive returns a session URI in `Location`. Each 4 MiB chunk is sent as a `PUT` with `Content-Range`. While the upload is incomplete Drive answers `308` and says how much it has stored in `Range: bytes=0-N`. After a failure the app asks Drive where it got to (`Content-Range: bytes */TOTAL`) and resumes from there. The final chunk returns the new file's metadata.
- **Private media.** Thumbnails and originals are fetched with the `Authorization` header and shown through `blob:` URLs. Thumbnails load only when they scroll near the viewport, and at most 6 fetches run at once.

## Known limitations

- Reloading the tab means signing in again, because the token is deliberately never persisted.
- Silent token refresh opens a short-lived Google popup. Browsers block popups that aren't triggered by a click, so after an hour you'll usually see the "Session expired, Continue" prompt. One click resumes everything that was waiting.
- Videos are downloaded completely into memory before they play (Drive media requires the auth header, which a plain `<video src>` can't send). Very large videos take a while to open.
- Folders can't be downloaded as a whole. Bulk download skips them.
- A file always stays in the Google account it was uploaded to. Drive has no API to move a file between accounts.
