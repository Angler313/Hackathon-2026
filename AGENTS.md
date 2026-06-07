# Agent Notes

Guidance for AI coding assistants (Claude Code, opencode, Copilot, Cursor, etc.) working in this repo.

## What this repo is

A GitHub **template repository** for hackathon attendees. When someone clicks "Use this template", they get a copy of these files in a fresh repo, then open a GitHub Codespace and land in a pre-configured Linux dev environment.

The contents of this repo are **scaffolding**, not a working application. Attendees will replace/extend it with their actual project code.

## Project — Coastal Angler Guide

A fishing guide website built with Vite + React + Tailwind CSS, located in `Coastal-Angler-Guide/`.

### Starting the dev server

```bash
export PATH="$HOME/.local/bin:$PATH"

# Start the API server (requires PostgreSQL on localhost:5432)
cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/api-server
node build.mjs
setsid bash -c 'DATABASE_URL="postgres://vscode:password@localhost:5432/fishing_guide" PORT=3001 node --enable-source-maps ./dist/index.mjs' < /dev/null > /tmp/api-server.log 2>&1 &
disown

# Wait for API then start frontend dev server
sleep 3
cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/fishing-app
setsid bash -c 'PORT=5173 BASE_PATH=/ npx vite --config vite.config.ts --host 0.0.0.0' < /dev/null > /tmp/vite-fishing.log 2>&1 &
disown
```

The site will be available at `http://localhost:5173/`. The Vite dev server proxies `/api/*` requests to the API server on port 3001.

**IMPORTANT:** Start the API server BEFORE Vite. If Vite starts first, its proxy connections will fail with ECONNREFUSED and won't recover. Always restart both together if either goes down.

## Repo layout

- `.devcontainer/devcontainer.json` — Codespaces / dev container config. References `Dockerfile.local` via `build:`, declares VS Code extensions, forwarded ports, and host requirements.
- `.devcontainer/Dockerfile.local` — Thin amd64-pinning wrapper around the prebuilt image. Referenced by `devcontainer.json`'s `build:` stanza so the platform pin is honored at feature-extension time (runArgs alone is too late). No tools live here; see `Dockerfile` for image contents.
- `.devcontainer/Dockerfile` — The prebuilt dev environment image. Bakes in apt utilities, gh CLI, Node, Python, uv, opencode, and the deploy CLIs so a Codespace start is one image pull (no live `apt-get` or `npm install`). Ends with sanity-check assertions so a broken image fails the build instead of silently shipping.
- `.github/workflows/build-devcontainer-image.yml` — Builds the Dockerfile and pushes to `ghcr.io/<owner>/hackathon-template-env:latest` on push to `main`. Only triggers on changes to the Dockerfile or the workflow itself.
- `README.md` — Attendee-facing. Non-technical tone. Covers using the template, what's installed, opencode auth, deploy targets, port sharing, free-tier limits.
- `ORGANIZER.md` — Event-organizer-facing. Covers the prebuilt-image setup (including the one-time "make package public" step), template toggle, org Codespaces secrets for shared API keys, cost math, pre-event checklist.
- `opencode.json` — opencode configuration. Defaults the model to `opencode/deepseek-v4-flash-free` (free, no API key needed) so attendees can start chatting immediately.
- `.opencode/skills/` — Skill packs that opencode auto-discovers. Currently ships `frontend-design` (build distinctive UIs, avoid generic AI aesthetics), `vercel-infrastructure` (Vercel env vars, custom domains, blob storage gotchas), and `c4-diagrams` (source-grounded architecture diagrams). When opencode is asked to do work matching a skill's trigger, it loads the skill automatically.
- `.gitignore` — Standard Node + Python + deploy-tool-cache ignores.

## Conventions when editing

- **The Dockerfile must stay loud-on-failure.** Keep the sanity-assertion `RUN` block at the bottom that runs `--version` on every tool. A silent install is worse than a failed image build — a failed build is visible in the GitHub Actions log; a silent miss leaves attendees debugging "why doesn't X work" mid-hack.
- **Layer order: roughly slowest-changing to fastest-changing.** So most rebuilds hit the cache from the top. The current Dockerfile puts apt utilities first, then apt-based third-party CLIs (gh), then language runtimes (node, python), then npm globals, then the fastest-moving curl-installed CLIs (uv, opencode).
- **README tone: friendly, non-technical.** Assume the reader has never used a terminal. Spell out clicks and menu paths. ORGANIZER.md can be denser and assume CLI familiarity.
- **Keep the dependency surface small.** Every tool added to the Dockerfile is one more thing that can break the image build, slow it down, and one more thing to explain. Add only what most hackathon teams will actually use.
- **Don't add example application code** (no sample Next.js app, no Flask hello-world). The template is deliberately empty so attendees can start from `npm create vite`, `npx create-next-app`, etc., without having to delete scaffolding first.

## When changing `.devcontainer/Dockerfile`

- Build locally before pushing: `cd .devcontainer && docker buildx build --platform linux/amd64 -t test .`. The build must succeed, including the final sanity-assertion `RUN` step.
- New tools must get a matching `--version` line in the sanity-assertion `RUN` block — not scattered through the file.
- Prefer `apt-get install -y --no-install-recommends`, end with `rm -rf /var/lib/apt/lists/*` in the same `RUN`, to keep layers small.
- For `curl | sh`-style installers, check if the installer exposes an install-dir override (e.g. uv's `UV_INSTALL_DIR`) before resorting to a post-install `mv` dance.

## When changing `.devcontainer/devcontainer.json`

- Validate it parses as JSON before committing: `python3 -c "import json; json.load(open('.devcontainer/devcontainer.json'))"`.
- Port additions should include a friendly `label` in `portsAttributes` and use `onAutoForward: notify`.
- VS Code extensions go in `customizations.vscode.extensions` using their full marketplace IDs (e.g. `esbenp.prettier-vscode`, not just `prettier`).
- `postCreateCommand` and `postStartCommand` are intentionally identical (the staged-file copy must run on first attach AND on session resume in case the file was deleted). If you edit one, edit the other.

## If a project actually needs Docker inside the Codespace

The default Codespace deliberately does NOT install Docker — adding the
`docker-in-docker` feature costs ~30s of cold-start time per Codespace, and
most hackathon projects deploy to hosted services (Vercel, Railway, Neon)
rather than running containers locally.

If your project genuinely needs `docker` (e.g. running compose stacks, building
images locally), add this to `.devcontainer/devcontainer.json`:

```json
"features": {
  "ghcr.io/devcontainers/features/docker-in-docker:3": {}
}
```

Then commit, push, and **create a fresh Codespace** (the feature only installs
on container creation; rebuilding an existing Codespace via "Dev Containers:
Rebuild Container" also works). Don't try to install Docker via `apt-get` in a
shell — the feature is needed to set up the daemon, not just the CLI.

## When changing `.github/workflows/build-devcontainer-image.yml`

- The first publish requires a manual "make package public" step in the GitHub UI (see ORGANIZER.md section 0). If you change the package name, attendees will hit a pull failure until that step is repeated.

## When running local commands / dev servers

- **Long-running processes (dev servers, watchers, REPLs, build watchers) must run in the background**, not in the foreground. A foreground `npm run dev` or `python -m http.server` blocks the agent on its own command until it's killed, which wastes the rest of the session. Use `run_in_background: true` (or `&` + `disown` from a shell), capture the output, then continue with other work.
- After starting a server in the background, verify it actually came up before assuming success (e.g. `curl localhost:PORT/health` or check the captured log). A backgrounded process that crashed on boot looks the same as one that's serving — don't conflate them.
- Stop background processes you started before declaring a task complete, unless the user explicitly wants them left running.

## Fishing App Data Architecture

The `search-location` endpoint in `Coastal-Angler-Guide/artifacts/api-server/src/routes/fishing/index.ts` uses:

- **Region-based location matching** — `classifyLocation()` resolves a user query through: alias lookup → substring match → Levenshtein fuzzy match (≤2 edits) → keyword analysis → state detection → community lake detection. Always returns a result — never null.
- **5 match types**: `exact` (known lake, TPWD/NOAA data), `fuzzy` (misspelling corrected), `researched` (Wikipedia/iNaturalist live lookup), `estimated` (regional data with clear note), and community lake profiles.
- **Per-region species lists** — 9 regions (gulf-coast, south-atlantic, northeast, pacific, pacific-nw, florida-keys, great-lakes, inland-south, inland-north, pacific-rivers) + specific lake profiles (lake-houston, lake-conroe, lake-livingston, lake-travis) + community lake profiles (community-lake-south, community-lake-fishin-program).
- **SPECIES_BAIT** — 103 species with bait/lure/tip data from NOAA, TPWD, and published guides.
- **Live lookups** — For unknown water bodies: Wikipedia API (fish sections) → iNaturalist API (species observations near geocoded coords) → regional estimate. Community/HOA names skip lookups and return TPWD Neighborhood Fishin' data.
- **State detection** — `STATE_REGION` map (tx→gulf-coast, fl→florida-keys, ca→pacific, etc.) overrides keyword analysis when a state abbreviation is in the query.
- **Sources in responses** — each response includes citation URLs (NOAA, TPWD, Wikipedia, iNaturalist).
- **Dashboard map** — OpenStreetMap iframe embed shows the matched/search location with a marker.
- **Catch Log units** — lbs/in ↔ kg/cm toggle at the top; database always stores metric, frontend converts display values.
- **Rig Planner** — 103 species in a searchable combobox (type or click from dropdown).

## Troubleshooting

**Blank screen on refresh:** Both servers likely died. Restart API server first, then Vite:
```bash
kill $(lsof -ti:3001) $(lsof -ti:5173) 2>/dev/null
cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/api-server
nohup bash -c 'DATABASE_URL="postgres://vscode:password@localhost:5432/fishing_guide" PORT=3001 node --enable-source-maps ./dist/index.mjs' </dev/null >/tmp/api-server.log 2>&1 &
sleep 3
cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/fishing-app
nohup bash -c 'PORT=5173 BASE_PATH=/ npx vite --config vite.config.ts --host 0.0.0.0' </dev/null >/tmp/vite-fishing.log 2>&1 &
```

## What to push back on

- Requests to add framework-specific scaffolding (a starter Next.js app, etc.) — see "don't add example application code" above.
- Requests to pin every tool to an exact version — for a hackathon template, "latest stable" is usually right. Pinning becomes a maintenance burden when versions drift.
- Requests to install VS Code or extensions into the Dockerfile — Codespaces installs the VS Code server and the extensions listed in `devcontainer.json` into a separate volume at container start. Pre-installing them in the image is unsupported and conflicts.
