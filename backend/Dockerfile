FROM python:3.11-slim

# OpenSCAD + xvfb (headless OpenGL for the projection-view renders) baked
# into the image — this is what eliminates the manual install/PATH pain
# on native setups (especially Windows). curl is just for the healthcheck.
# prusa-slicer is needed for G-code export (confirmed via testing: its
# CLI --export-gcode mode does NOT need a display/xvfb, unlike OpenSCAD's
# PNG export).
RUN apt-get update && apt-get install -y --no-install-recommends \
    openscad \
    xvfb \
    xauth \
    curl \
    prusa-slicer \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p outputs

ENV OPENSCAD_BIN=openscad
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Single worker is intentional — job state for SSE streaming lives in
# process memory (see note in main.py). Don't add --workers > 1 without
# also moving job/rate-limit state to a shared store.
# Shell form (not exec/JSON array form) so ${PORT} expands — needed for
# PaaS hosts like Render that assign the port dynamically. Falls back to
# 8000 for local docker-compose, where PORT isn't set.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
