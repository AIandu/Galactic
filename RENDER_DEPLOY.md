# Deploying O.S.N. to Render

This project is a pnpm monorepo with two services that need to run:

- **`artifacts/api-server`** — Express API (needs `PORT` from Render)
- **`artifacts/orion`** — React/Vite frontend, built to static files and served

There's no database — all satellite data is fetched live (or from an embedded fallback), so no Postgres instance is needed on Render.

## 1. Push the repo to GitHub

Render deploys from a GitHub repo. Make sure your latest commit (with all the finished updates) is pushed to `main`.

## 2. Create the API service (Web Service)

In the Render dashboard: **New > Web Service**, connect the repo, then set:

- **Root Directory:** leave blank (repo root) — the build needs the whole pnpm workspace, not just `artifacts/api-server`.
- **Environment:** Node
- **Build Command:**
  ```
  pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build
  ```
- **Start Command:**
  ```
  pnpm --filter @workspace/api-server run start
  ```
- **Environment Variables:** none required (no `PORT` needed — Render sets it automatically and the server already reads `process.env.PORT`).

After it deploys, note the public URL Render gives it, e.g. `https://osn-api.onrender.com`. Test it: `https://osn-api.onrender.com/api/healthz` should return `200`.

## 3. Create the frontend service (Static Site)

In the Render dashboard: **New > Static Site**, connect the same repo, then set:

- **Root Directory:** leave blank (repo root)
- **Build Command:**
  ```
  pnpm install --frozen-lockfile && pnpm --filter @workspace/orion run build
  ```
- **Publish Directory:**
  ```
  artifacts/orion/dist/public
  ```
- **Environment Variables:**
  - `PORT` = `4173` (Vite's build step reads this; any value works, Render ignores it for static sites)
  - `BASE_PATH` = `/`
  - `VITE_API_BASE_URL` = the API URL from step 2, e.g. `https://osn-api.onrender.com`

  > `PORT` and `BASE_PATH` are required at *build* time only (the Vite config throws without them) — they don't affect the static output otherwise.

- Under **Redirects/Rewrites**, add a catch-all rewrite so client-side routing works:
  - Source: `/*`
  - Destination: `/index.html`
  - Action: Rewrite

Once deployed, Render gives you a URL like `https://osn.onrender.com` — that's the live app.

## 4. Verify

- Open the frontend URL and confirm the radar view loads with satellite data.
- Open browser dev tools > Network tab and confirm requests go to the full API URL (e.g. `https://osn-api.onrender.com/api/...`, not `localhost` or a relative `/api/...`) and return `200`.

## Notes

- Don't add `corepack enable` to the build command — on Render's current build image it fails with `EROFS: read-only file system, unlink '/usr/bin/pnpm'`. The repo's root `package.json` now pins `"packageManager": "pnpm@10.26.1"`, which Render's Node buildpack reads automatically to install the matching pnpm version without needing `corepack enable`.
- CORS is already open (`cors()` with no options) on the API, so cross-origin calls from the static site work out of the box.
- Both services are on Render's free tier by default, which spins down when idle — the first request after inactivity can take ~30s (cold start). Upgrade to a paid instance if the buyer needs it always warm during a demo.
