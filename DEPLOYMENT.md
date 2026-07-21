# GAD — Deployment & Development Guide (internal / owner use)

**This is not the online-facing README** — see `README.md` for that.
This file covers local development, Docker, and hosting setup for
whoever owns/operates this project.

**Copyright:** all rights reserved — see `LICENSE`.

---

A React + FastAPI rebuild of the GAD system (Daareyni et al., 2025):
text/voice/image input → GPT-4o generates OpenSCAD code → a syntax-check
loop and self-evaluation loop refine it → live 3D preview → STL/G-code
export → optional direct 3D printer control.

```
gad-v2/
  backend/     FastAPI API around the (already tested) generation pipeline
  frontend/    React + Vite UI, dark "drafting table" design, live 3D viewer
  docker-compose.yml
```

## Option A — Docker (recommended)

This is the fix for the OpenSCAD/PATH/xvfb install pain from the previous
version: the backend image bundles OpenSCAD + xvfb + PrusaSlicer, so
there's nothing to install or configure manually — CAD generation and
G-code export both work out of the box.

Note: PrusaSlicer pulls in a large dependency tree (OpenCASCADE, wxGTK),
so the first `docker compose build` will take noticeably longer and
produce a bigger image than before. Subsequent builds are cached and
fast.

**Requirements:** Docker Desktop.

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

Leave `MOCK_MODE=true` in `backend/.env` to try the whole app (UI, feedback
loops, live 3D preview) without an API key — it'll return a placeholder
shape. Add `OPENAI_API_KEY=sk-...` and set `MOCK_MODE=false` when you're
ready for real generations, then `docker compose up --build` again.

**Printer control note:** Docker Desktop on Windows doesn't support USB
serial passthrough. If you want to drive a physical printer, run the
backend natively (Option B) instead of in Docker — the frontend can stay
however you like, since it just calls the backend's API.

## Option B — Native (no Docker)

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

You'll still need OpenSCAD installed separately for real STL/preview
rendering — see the "External tools" section below. The API and mock-mode
pipeline work without it; only rendering needs it.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Opens at http://localhost:5173 and talks to the backend at
`http://localhost:8000` by default. To point it elsewhere, create
`frontend/.env` with:
```
VITE_API_BASE=http://your-backend-host:8000
```

### External tools (native setup only)

**OpenSCAD** (required for real rendering)
- macOS: `brew install openscad`
- Ubuntu/Debian: `sudo apt-get install openscad`
- Windows: install from https://openscad.org/downloads.html, then either
  add it to PATH or set `OPENSCAD_BIN` in `backend/.env` to the full path,
  e.g. `OPENSCAD_BIN="C:\Program Files\OpenSCAD\openscad.exe"`

**Headless Linux only:** install `xvfb` (`sudo apt-get install xvfb`) —
the backend auto-detects and uses it for the projection renders used by
the self-evaluation loop. Not needed on macOS/Windows/desktop Linux.

**PrusaSlicer or Slic3r** (only if you want G-code export)
- https://www.prusa3d.com/prusaslicer/
- Set `SLICER_BIN` in `backend/.env` if it's not named `prusa-slicer` on
  your system.

### Alternatives

Any Docker-friendly host works with the same `backend/Dockerfile` —
Railway, Fly.io, DigitalOcean App Platform, or a plain VPS running
`docker compose up -d` behind a reverse proxy (Caddy is the simplest for
automatic HTTPS). Render was chosen here for the genuinely free static
frontend hosting and the lowest setup effort.

## Production checklist

The backend now has real hardening built in — set these before exposing
it publicly:

```
CORS_ORIGINS=https://your-domain.com
RATE_LIMIT_PER_MINUTE=10
```

- **CORS** is locked to `CORS_ORIGINS` (comma-separated). Defaults to
  `*` for local dev only.
- **Rate limiting**: visitors using *your* server-side API key are
  capped at `RATE_LIMIT_PER_MINUTE` requests/minute so a stranger can't
  run up your bill. Visitors using their own key (via the "add api key"
  button in the UI) aren't limited, since they're spending their own
  money.
- **Health check**: `GET /api/health`, already wired into the backend
  Docker image's `HEALTHCHECK`.
- **Single worker only**: job state for the SSE streams lives in
  process memory. Don't scale the backend to multiple workers/replicas
  without first moving that state to something shared (Redis, etc.) —
  see the note at the top of `main.py`.
- **HTTPS**: not handled here — put a reverse proxy (Caddy, nginx, or
  your host's built-in TLS) in front for real deployments.
- **Secrets**: use your hosting platform's secret manager for
  `OPENAI_API_KEY`/`GEMINI_API_KEY` rather than a committed `.env` file.

## Design

The UI direction is grounded in actual engineering-drawing conventions
rather than a generic dark-mode template: the header is styled as a
drawing title block, panels use CAD-viewport corner-bracket framing, and
the palette is graphite + blueprint-blue + machinist safety-orange. The
3D viewer is a first-class React Three Fiber scene (not an iframe), with
smooth damped orbit controls, wireframe/grid toggles, and contact
shadows.

## Notes / limitations

Same ones the paper reports: GPT-4o can infer rough shape from an image
but struggles with exact dimensions without text specs, and the
self-evaluation loop is a heuristic, not a guarantee of correctness.
