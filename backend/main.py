"""GAD backend API.

Wraps the existing, already-tested core/ pipeline (LLM client, OpenSCAD
engine, feedback loops, slicer, printer) behind a REST API so a React
frontend can drive it, with live log streaming over Server-Sent Events
so the UI can show generation progress in real time instead of one
big blob at the end.

Run with:  uvicorn main:app --reload --port 8000

Note on scaling: job state (for SSE streaming) and the rate limiter are
in-memory and process-local. Running multiple worker processes would
route a job's SSE stream request to a different worker than the one
that created it and 404. Keep this at a single worker unless you swap
the in-memory job/rate-limit stores for a shared backend (e.g. Redis).
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import threading
import time
import uuid
from collections import defaultdict, deque
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.feedback_loop import run_gad_pipeline
from core.libraries import combined_libraries_string, list_available_libraries
from core.llm_client import LLMClient
from core.printer import PrinterConnection, PrinterError, list_available_ports
from core.scad_engine import SCADEngine, SCADEngineError
from core.slicer import Slicer, SlicerError
from core.speech_input import transcribe_audio_bytes
from utils.logger import GADLogger

load_dotenv()

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL_OPTIONS = [
    "gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo",
    "gemini-3.1-pro-preview", "gemini-3.5-flash",
    "open-r1/olympiccoder-32b:free",
]

# Comma-separated list of allowed origins in production, e.g.
# "https://gad.example.com,https://www.gad.example.com". Defaults to "*"
# for local development only — set CORS_ORIGINS before deploying publicly.
_cors_env = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = ["*"] if _cors_env.strip() == "*" else [o.strip() for o in _cors_env.split(",") if o.strip()]

# Requests-per-minute per client IP for the expensive endpoints (only
# matters when the *server's own* key is being used — a visitor's own
# BYOK key isn't rate-limited here since they're only spending their
# own money, not yours).
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "10"))

app = FastAPI(title="GAD API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


# ---------------------------------------------------------------------
# Minimal in-memory rate limiter. Fine for a single-process deployment;
# swap for a Redis-backed limiter if you ever scale to multiple workers
# behind a load balancer.
# ---------------------------------------------------------------------
_request_log: dict = defaultdict(deque)


def _check_rate_limit(request: Request, uses_server_key: bool) -> None:
    if not uses_server_key:
        return  # visitor is spending their own API budget, not yours
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _request_log[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({RATE_LIMIT_PER_MINUTE}/min using the server's key). "
                   "Add your own API key in Settings to bypass this limit.",
        )
    window.append(now)


_loop: Optional[asyncio.AbstractEventLoop] = None


@app.on_event("startup")
async def _capture_loop() -> None:
    global _loop
    _loop = asyncio.get_running_loop()


# ---------------------------------------------------------------------
# In-memory job registry (single-process, single-machine desktop app —
# no external queue/broker needed).
# ---------------------------------------------------------------------
_jobs: dict = {}


def _new_job() -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"queue": asyncio.Queue(), "result": None}
    return job_id


def _job_logger(job_id: str) -> GADLogger:
    def on_log(line: str) -> None:
        q = _jobs[job_id]["queue"]
        _loop.call_soon_threadsafe(q.put_nowait, {"event": "log", "data": line})

    return GADLogger(on_log=on_log)


def _finish_job(job_id: str, result: dict) -> None:
    _jobs[job_id]["result"] = result
    q = _jobs[job_id]["queue"]
    _loop.call_soon_threadsafe(q.put_nowait, {"event": "done", "data": None})


async def _sse_stream(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Unknown job id")
    q = _jobs[job_id]["queue"]
    try:
        while True:
            item = await q.get()
            if item["event"] == "done":
                result = _jobs[job_id]["result"]
                yield f"event: result\ndata: {json.dumps(result)}\n\n"
                break
            yield f"event: log\ndata: {json.dumps(item['data'])}\n\n"
    finally:
        _jobs.pop(job_id, None)


# ---------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------
class GenerateRequest(BaseModel):
    description: str = Field("", max_length=2000)
    images: List[str] = Field(default_factory=list, max_length=4)
    model: str = "gpt-4o"
    enable_syntax_loop: bool = True
    max_syntax_retries: int = Field(3, ge=0, le=10)
    enable_internal_loop: bool = True
    max_internal_iterations: int = Field(3, ge=0, le=10)
    libraries: List[str] = []
    save_stl: bool = True
    generate_gcode: bool = False
    detail_level: str = "standard"  # draft | standard | production
    # Optional bring-your-own-key: if provided, used only for this one
    # request and never written to disk or logged. Lets a hosted/public
    # deployment run without the operator's own API key being shared or
    # billed for every visitor.
    api_key: Optional[str] = None


class PrinterConnectRequest(BaseModel):
    port: str
    baudrate: int = 115200


class PrintRequest(BaseModel):
    gcode_base64: str


# ---------------------------------------------------------------------
# Static metadata endpoints
# ---------------------------------------------------------------------
@app.get("/api/models")
async def get_models():
    return {"models": MODEL_OPTIONS}


@app.get("/api/libraries")
async def get_libraries():
    return {"libraries": list_available_libraries()}


@app.get("/api/status")
async def get_status():
    """Lets the frontend show whether real generation is configured, and
    whether OpenSCAD/slicer binaries are actually present, up front."""
    server_keys = {
        "openai": bool(os.getenv("OPENAI_API_KEY")),
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "openrouter": bool(os.getenv("OPENROUTER_API_KEY")),
    }
    mock_mode = os.getenv("MOCK_MODE", "true").lower() == "true" or not any(server_keys.values())
    scad_engine = SCADEngine()
    try:
        scad_engine._ensure_binary()
        openscad_ok = True
    except SCADEngineError:
        openscad_ok = False
    return {"mock_mode": mock_mode, "openscad_available": openscad_ok, "server_keys": server_keys}


# ---------------------------------------------------------------------
# Generation pipeline (SSE-streamed)
# ---------------------------------------------------------------------
def _provider_kwargs_for(model: str, user_api_key: Optional[str]) -> dict:
    """Routes a bring-your-own-key to the right LLMClient constructor
    kwarg based on the model name, mirroring LLMClient's own provider
    detection. Only used when the client supplied a key — otherwise
    LLMClient falls back to whatever's configured in the server's .env."""
    if not user_api_key:
        return {}
    if model.startswith("gemini"):
        return {"gemini_api_key": user_api_key}
    if model.startswith(("gpt-", "o1", "o3", "o4", "text-", "chatgpt")):
        return {"openai_api_key": user_api_key}
    return {"openrouter_api_key": user_api_key}


def _run_generate_job(job_id: str, req: GenerateRequest) -> None:
    jlogger = _job_logger(job_id)
    try:
        llm = LLMClient(model=req.model, logger=jlogger, **_provider_kwargs_for(req.model, req.api_key))
        scad_engine = SCADEngine(logger=jlogger)

        description = req.description.strip()
        if not description and req.images:
            jlogger.log("No description given — asking the model to interpret the image(s)...")
            description = llm.describe_image(req.images)
            jlogger.log(f"Inferred description: {description}")

        combined_libs = combined_libraries_string(req.libraries) if req.libraries else ""

        result = run_gad_pipeline(
            llm=llm,
            scad_engine=scad_engine,
            description=description,
            images_b64=req.images,
            combined_libraries=combined_libs,
            enable_syntax_loop=req.enable_syntax_loop,
            max_syntax_retries=req.max_syntax_retries,
            enable_internal_loop=req.enable_internal_loop,
            max_internal_iterations=req.max_internal_iterations,
            detail_level=req.detail_level,
            logger=jlogger,
        )

        payload = {
            "success": result.success,
            "scad_code": result.scad_code,
            "description": result.description,
            "error": result.error,
            "attempts_log": result.attempts_log,
        }

        if result.success and (req.save_stl or req.generate_gcode):
            stl_path = os.path.join(OUTPUT_DIR, f"{job_id}.stl")
            try:
                scad_engine.render_stl(result.scad_code, stl_path)
                with open(stl_path, "rb") as f:
                    payload["stl_base64"] = base64.b64encode(f.read()).decode("utf-8")
            except SCADEngineError as e:
                payload["stl_error"] = str(e)

            if req.generate_gcode and payload.get("stl_base64"):
                gcode_path = os.path.join(OUTPUT_DIR, f"{job_id}.gcode")
                try:
                    slicer = Slicer(logger=jlogger)
                    slicer.slice_to_gcode(stl_path, gcode_path)
                    with open(gcode_path, "rb") as f:
                        payload["gcode_base64"] = base64.b64encode(f.read()).decode("utf-8")
                except SlicerError as e:
                    payload["gcode_error"] = str(e)

        _finish_job(job_id, payload)
    except Exception as e:  # noqa: BLE001
        jlogger.log(f"Fatal error: {e}")
        _finish_job(job_id, {"success": False, "error": str(e)})


@app.get("/api/health")
async def health():
    """Container/load-balancer health check — cheap, no external calls."""
    return {"ok": True}


@app.post("/api/generate")
async def generate(req: GenerateRequest, request: Request):
    if not req.description.strip() and not req.images:
        raise HTTPException(status_code=400, detail="Provide a description, voice input, and/or images.")
    _check_rate_limit(request, uses_server_key=not req.api_key)
    job_id = _new_job()
    threading.Thread(target=_run_generate_job, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/generate/stream/{job_id}")
async def generate_stream(job_id: str):
    return StreamingResponse(_sse_stream(job_id), media_type="text/event-stream")


# ---------------------------------------------------------------------
# Voice input
# ---------------------------------------------------------------------
@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    try:
        text = transcribe_audio_bytes(audio_bytes)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"text": text}


# ---------------------------------------------------------------------
# Printer control
# ---------------------------------------------------------------------
_printer: Optional[PrinterConnection] = None


@app.get("/api/printer/ports")
async def printer_ports():
    return {"ports": list_available_ports()}


@app.post("/api/printer/connect")
async def printer_connect(req: PrinterConnectRequest):
    global _printer
    try:
        _printer = PrinterConnection(port=req.port, baudrate=req.baudrate)
        _printer.connect()
    except PrinterError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"connected": True}


@app.post("/api/printer/disconnect")
async def printer_disconnect():
    global _printer
    if _printer:
        _printer.disconnect()
        _printer = None
    return {"connected": False}


def _run_print_job(job_id: str, gcode_path: str) -> None:
    jlogger = _job_logger(job_id)
    try:
        if not _printer or not _printer.connected:
            raise PrinterError("Printer is not connected.")

        def progress(i: int, total: int) -> None:
            q = _jobs[job_id]["queue"]
            _loop.call_soon_threadsafe(
                q.put_nowait, {"event": "log", "data": f"Printing line {i}/{total}"}
            )

        _printer.print_gcode_file(gcode_path, progress_callback=progress)
        _finish_job(job_id, {"success": True})
    except PrinterError as e:
        _finish_job(job_id, {"success": False, "error": str(e)})


@app.post("/api/printer/print")
async def printer_print(req: PrintRequest):
    if not _printer or not _printer.connected:
        raise HTTPException(status_code=400, detail="Connect to the printer first.")
    job_id = _new_job()
    gcode_path = os.path.join(OUTPUT_DIR, f"{job_id}_print.gcode")
    with open(gcode_path, "wb") as f:
        f.write(base64.b64decode(req.gcode_base64))
    threading.Thread(target=_run_print_job, args=(job_id, gcode_path), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/printer/print/stream/{job_id}")
async def printer_print_stream(job_id: str):
    return StreamingResponse(_sse_stream(job_id), media_type="text/event-stream")
