# Elevate browser extension

This is one Manifest V3 extension for **Google Chrome and Microsoft Edge** (116+). Open a job posting and click the Elevate icon. The side panel opens and shows a preview of the detected job. Click **Analyze This Job** to send the page to Elevate. The panel then shows the server's results: recommendation, Fit and ATS estimates, top match and top gap, the interview process and questions. It also links to the full analysis.

The extension shows only what the server returns. It does no scoring or classification of its own. The one local step is the pre-analysis preview, which uses `quickDetect` from `@elevate/core/extraction`.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm run build -w @elevate/extension` | Production build into `apps/extension/build/` (minified, no sourcemaps, no `key` unless `EXTENSION_PUBLIC_KEY` is set). |
| `npm run build:dev -w @elevate/extension` | Development build with sourcemaps. Pins the extension ID from `.dev-key.pem` when that file exists. |
| `npm run dev -w @elevate/extension` | Development build plus watch. |
| `npm run dev-key -w @elevate/extension` | Creates `.dev-key.pem` once (gitignored) and prints the public key and extension ID. |
| `npm run typecheck -w @elevate/extension` | `tsc --noEmit` |
| `npm test -w @elevate/extension` | `vitest run` |
| `npm run zip -w @elevate/extension` | Production build, then `dist/elevate-extension-<version>.zip` for store upload. It refuses to package a build that has a `key`. |

### Environment variables (read at build time)

| Variable | Default | Purpose |
| --- | --- | --- |
| `ELEVATE_APP_URL` | `http://localhost:3000` | The Elevate web app origin. It sets `host_permissions`, `externally_connectable` and all API calls. Must be https unless it is localhost. |
| `EXTENSION_PUBLIC_KEY` | none | Base64 DER public key. When set, it becomes the manifest `key` and pins the extension ID. |
| `ELEVATE_SENTRY_DSN` | none | When set, extension errors are reported to Sentry (scrubbed). When unset, nothing is reported. |

## Load it unpacked

1. Run `npm run build:dev -w @elevate/extension`. Use `npm run build` for a production-like build.
2. **Chrome:** go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select `apps/extension/build`.
3. **Edge:** go to `edge://extensions`, turn on **Developer mode**, click **Load unpacked** and select `apps/extension/build`.
4. Pin the Elevate icon. Open a job posting, click the icon, then click **Connect Elevate**. The connect page is `${APP_URL}/extension/connect`, and you need to be signed in there.

After rebuilding, click the reload button on the extension card.

## Pinning the extension ID for local development

The web app's connect page uses `chrome.runtime.sendMessage(EXTENSION_ID, …)`, and the server's CORS allows `chrome-extension://<id>`. Both need a stable ID.

1. Run `npm run dev-key -w @elevate/extension`. This writes `apps/extension/.dev-key.pem` (the private key, gitignored, never commit it) and prints the ID.
2. `npm run build:dev` and `npm run dev` read the public key from that file and set the manifest `key`. You can also export `EXTENSION_PUBLIC_KEY=<printed value>` for any build.
3. Set `NEXT_PUBLIC_EXTENSION_IDS=<printed extension ID>` in the web app's environment.

Store builds must not contain `key`, because the store assigns its own ID. Add that ID to `NEXT_PUBLIC_EXTENSION_IDS` as well.

## Why these permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Gives temporary access to the current tab **only after you click the Elevate icon**. This replaces broad host permissions: the extension cannot read any site you haven't clicked it on. |
| `scripting` | Runs the one capture function in the tab you granted (through `activeTab`) to read its URL, title, selection and cleaned HTML. It is never injected automatically. |
| `sidePanel` | Shows Elevate in the browser's side panel. |
| `storage` | `local`: your own Elevate session tokens. `session` (memory only): which tabs you clicked the icon on. |
| Host `${APP_URL}/*` | Lets the extension call the Elevate API without CORS restrictions. It is the only site in `host_permissions`. |
| `externally_connectable` `${APP_URL}/*` | Lets the Elevate website hand your session to the extension. Messages are also checked against the exact origin in code. |

The extension declares no content scripts, no `tabs`/`history`/`webRequest` permissions, no `<all_urls>` and no optional permissions. It uses `action.onClicked` (not `openPanelOnActionClick`) so that the click grants `activeTab`.

See [PRIVACY.md](./PRIVACY.md).

## How it works

- `src/background.ts` is the service worker. When you click the icon, it calls `sidePanel.open()` synchronously and records the grant in `storage.session`. It also performs captures when the panel asks, and it validates `onMessageExternal` (`elevate:session`, `elevate:ping`, `elevate:signout`).
- `src/lib/capture.ts` holds the self-contained `capturePage()` injected with `executeScript`, plus the rules for which URLs can't be read: `chrome://`, `edge://`, stores and the PDF viewer.
- `src/lib/session.ts` is the session store. It refreshes when fewer than 60 seconds remain and once on a 401. Refreshes are single-flight (Web Lock). The session is cleared when the server rejects the refresh token.
- `src/lib/api.ts` is the API client. Every request has a timeout, and server error envelopes become `ApiError`s.
- `src/lib/sse.ts` and `src/lib/watch.ts` handle progress. They read Server-Sent Events over `fetch` (needed for the Authorization header) and honor `reconnect` frames. If streaming fails, they fall back to polling every 4 seconds and give up after 7 minutes with a clear message.
- `src/sidepanel/*` is the panel: a state machine (`main.ts`), pure server-to-view derivation (`view-model.ts`), DOM-only rendering with no `innerHTML` (`views.ts`, `dom.ts`) and every UI string (`strings.ts`).
- Fonts (Schibsted Grotesk, Newsreader, IBM Plex Mono) are bundled from `@fontsource`. Icons are drawn at build time (`scripts/icons.ts`).
