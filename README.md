# DriveGallery

A client-side photo and video manager that stores everything in **your own Google Drive**. You sign in with Google and the app keeps your media in a `DriveGallery` folder in My Drive. There's no backend: the browser talks to the Google Drive API v3 directly.

Built with Vite, React, Tailwind CSS, framer-motion, `@react-oauth/google`, `react-dropzone` and `lucide-react`.

## Features

- **Sign in with Google** (implicit/token flow). The access token is kept in `sessionStorage`, so a page reload keeps you signed in; closing the tab (or signing out) clears it. When it expires, or Drive returns 401, the app silently asks for a new token and replays the request. If that's blocked, a "Session expired, Continue" prompt appears.
- **Least privilege**: the app uses only the `drive.file` scope, so it can see files it created and nothing else in your Drive.
- **Browse**: folders and nested subfolders, breadcrumbs, grid and list views, sort by name, date or size, search by name across the whole gallery, an All / Images / Videos filter, and infinite scroll with Drive `pageToken`s.
- **Upload**: drag and drop anywhere on the page, or use the file picker. Up to 3 uploads run at once, each with progress, speed, cancel and retry.
  - Images can be compressed in the browser (longest side capped at 2560px, quality 0.85). Turn this off with **Upload ▾ → Upload original quality**.
  - Videos and any file over 5 MB use Drive's **resumable upload** in 4 MiB chunks. If the network drops, the upload picks up from the last byte Drive stored.
- **Lightbox**: fullscreen viewer with a shared-element transition from the thumbnail. Navigate with ← → or swipe. Images zoom with + / −, the mouse wheel or a double-click, and you can pan while zoomed. Videos play in a built-in player.
- **Organize**: rename (F2), move with a folder picker or by dragging items onto a folder, breadcrumb or sidebar entry, multi-select (checkboxes, Shift-click, Ctrl/⌘-click, Ctrl/⌘-A), and bulk move, delete or download.
- **Delete** moves items to the Drive trash with an **Undo** toast. Deleting a folder asks for confirmation first.
- **Download** originals, singly or in bulk (one file at a time, with a progress indicator). **Open in Google Drive** links are available too.
- **Storage quota** bar in the sidebar. It turns amber at 80% and red at 95%. Running out of space gives a clear message with a link to Google One.
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
src/
  lib/
    drive.js        All Drive API calls: list, folders, simple + resumable upload, rename,
                    move (addParents/removeParents), trash/restore, download, quota.
                    Centralized errors, 401 → refresh → retry, backoff on 429/5xx.
    mediaCache.js   Ref-counted blob: URL cache for thumbnails/media (revoked when unused)
    compress.js     Client-side image resize/re-encode
    format.js, motion.js, dnd.js
  context/
    AuthContext.jsx Token in memory, expiry tracking, silent refresh + "Session expired" fallback
    ToastContext.jsx
  hooks/
    useAuth, useDriveFolder (pagination + optimistic updates), useUploadQueue (3 concurrent),
    useSelection (checkbox + Shift-range), useMediaUrl (lazy thumbnails via IntersectionObserver),
    useCollection, useToast
  components/
    Login, Sidebar, TopBar, Breadcrumbs, FileGrid, FileList, FolderCard, MediaCard, Lightbox,
    UploadPanel, ContextMenu, MoveDialog, RenameDialog, ConfirmDialog, QuotaBar, Toasts,
    EmptyState, DropOverlay, SelectionBar, Skeletons, ui (Modal, Dropdown, Switch, …)
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
