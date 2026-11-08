# Promo Finder frontend

React 18 + strict TypeScript + Vite + Tailwind CSS v4 (official Vite plugin), with lucide-react, Fetch, custom hooks, Vitest and React Testing Library. No UI component framework, API keys or secrets are shipped in the frontend.

## Beginner quick start: no backend required

1. Install Node.js (20.19+; Node 22 LTS recommended) with npm on your computer.
2. Extract the ZIP completely. Open the extracted `promo-finder` folder in VS Code.
3. Choose **Terminal → New Terminal** and enter:

```bash
cd frontend
npm install
npm run dev:mock
```

4. Keep the terminal open and visit **http://localhost:5173** in your browser.
5. Click **Try the sample show**. After approximately 12 seconds, eight ranked synthetic promos appear, with one failed episode out of twelve. Try the follow-up chips, history, timestamp copying and downloads.
6. Stop the server with **Ctrl+C**. Next time, run `npm run dev:mock` from the frontend folder; installation is only needed initially or when dependencies change.

Mock mode does not call Gemini or the backend. It uses `.env.mock` automatically. No `.env` needs to be created for this command. Do not judge model quality from these synthetic fixtures.

## Run with the real backend

The parent directory contains the FastAPI backend. Follow its README to create a Python environment, install `requirements.txt`, fill in the root `.env`, and load that environment. Run the API and Inngest Dev Server in separate terminals as described there. API uploads require the Inngest worker; starting only FastAPI will not complete an analysis.

In a third terminal, inside `frontend`:

```bash
npm install
npm run dev
```

This uses `http://localhost:8000` by default. Keep the frontend at **http://localhost:5173**, the backend's allowed CORS origin. Click the paperclip, choose a ZIP, then press the gold send button. You can also drop a ZIP anywhere in the app.

To customize frontend settings, copy `.env.example` to `.env.local` inside `frontend` (NOT the project root):

```bash
# macOS / Linux
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Edit the file and restart Vite:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_MAX_UPLOAD_MB=25
VITE_USE_MOCK=0
```

Set `VITE_USE_MOCK=1` if you want ordinary `npm run dev` to run the demo. Avoid setting that variable in `.env.local` when switching between `dev` and `dev:mock`: Vite env precedence can override mode defaults. Delete that local override or set the intended value explicitly. All VITE variables are public browser configuration. Gemini and Inngest credentials belong only in the root backend environment.

Both `promo-finder/.env.example` and `promo-finder/frontend/.env.example` are included. Dotfiles may be hidden in your file manager; use VS Code's Explorer or enable **Show hidden files**. These are two different configurations.

## Working with the app

- Each upload creates a thread and URL `/a/:analysisId`. Reload refetches its status and results. History is saved locally and separated by mock/real server.
- Search history, rename threads, export JSON/CSV or remove an entry. Removal only affects this browser's list, never server data. Optional server history is merged if supported.
- File names and basic metadata persist. Original ZIP bytes and follow-up messages do not; after reload, retrying requires selecting the ZIP again.
- Progress polls every 1.5 seconds, stops at complete/partial/failed and backs off on network failures. Retry controls handle unavailable servers and results.
- Eligibility precedes ranking: hook, cliffhanger and clarity must pass; weighted score is 40% hook + 35% cliffhanger + 25% clarity.
- Source start/end strings are preserved exactly. Integer centiseconds are formatted only when strings are absent. Human review is required for hook landing times without word-level timing.
- The optional chat endpoint is disabled gracefully on 404/501. Copying uses the browser clipboard with a compatibility fallback; blocked clipboard access is reported.
- To exercise a failed mock run, upload a nonempty ZIP whose name includes `fail-demo`.

## Architecture

`src/config.ts` owns the app name and environment defaults. `api/client.ts` isolates HTTP, error mapping and upload validation. `api/normalize.ts` is the only wire-format adapter, accepting `promos`/`shortlist`, `run_summary`/`summary` and this backend's `run_report`. Hooks own polling, health and persisted history. Components consume normalized internal types. All design tokens live in `styles/tokens.css` and are exposed through Tailwind's `@theme inline` in `styles/index.css`.

## Verification and production build

```bash
npm test
npm run build
npm run preview
```

39 tests cover integer timestamps, calendar buckets, wrapper normalization, missing fields, polling/backoff/termination/cancellation, upload errors, promo rendering/copy order, history merging/removal and mock UI flows including unavailable chat. The production build also runs strict TypeScript checks. `npm ci` installs exactly the checked-in lockfile in CI.

Deploy `dist` using a static host with SPA fallback to `index.html` for `/a/*`. Set the intended API base before building; Vite replaces env values at build time. Backend CORS must allow your production origin. Do not expose an unauthenticated backend publicly without adding appropriate authentication and deployment controls.

## Assumptions

- The reference supplies visual direction only; the logo and product copy are original. The app fills the viewport without the reference poster backdrop.
- Editor is the default name; it can be changed locally. The avatar is initials only.
- ZIP inputs are screenplay text archives, not video. The backend performs eligibility, judging and ranking; the frontend displays its results.
- The included sample ZIP is generated by `examples/make_synthetic.py` and contains three synthetic episodes. Mock mode deliberately simulates twelve episodes, one failure and eight promos regardless of uploaded content, as requested.
- Optional server history accepts a bare list or an `analyses`/`items` list. Servers without it use local history alone. The existing backend's wrapper/status/error variations are handled centrally.
- The archive icon focuses history search; there is no server archive/delete endpoint. The top three cards carry the requested “Post first” tag.
- Font delivery uses Google Fonts with a local sans-serif fallback; core mock behavior works without a model server.

## Known limits and troubleshooting

- Live Gemini/Inngest end-to-end operation requires your credentials and selected model IDs and was not exercised during frontend verification. Automated frontend tests use deterministic fixtures; production ranking quality needs real editorial evaluation.
- No authentication, cross-device history sync, video playback/editing, or server-side deletion is implemented. Shared URLs require access to the same backend; mock URLs work only with the same browser storage.
- Local storage may be blocked or full. The app warns and keeps the current session usable where possible. Clearing browser data removes local history and mock runs.
- “Can't reach the server”: start FastAPI, check the displayed base URL, use localhost:5173 and press Retry. A healthy API with stuck jobs usually means the Inngest worker is absent or misconfigured.
- “Port 5173 already in use”: stop the old Vite terminal with Ctrl+C and retry. Strict port selection avoids silently breaking CORS.
- `npm` not found: install Node.js, then restart your terminal. Use an extracted directory, not the ZIP viewer.
- `npm run dev` shows the wrong mode: remove stale VITE_USE_MOCK overrides from `.env.local` or your shell and restart.
- Mobile layout is designed down to 360px. Reduced motion disables orb motion and shimmer; keyboard controls include focus rings, dialogs, drawer focus management and skip-to-content.
