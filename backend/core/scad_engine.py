"""Rendering layer around the OpenSCAD CLI (paper section 2.1.2/2.1.3).

Requires OpenSCAD to be installed and on PATH (or pointed to via the
OPENSCAD_BIN env var). See README.md for install instructions per OS.
"""
from __future__ import annotations

import base64
import os
import platform
import re
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from utils.logger import logger as _default_logger

# Six standard projection views: (name, camera rotation rx,ry,rz)
# OpenSCAD --camera=tx,ty,tz,rx,ry,rz,dist
PROJECTION_VIEWS: List[Tuple[str, Tuple[float, float, float]]] = [
    ("Front", (90, 0, 0)),
    ("Back", (90, 0, 180)),
    ("Left", (90, 0, 90)),
    ("Right", (90, 0, 270)),
    ("Top", (0, 0, 0)),
    ("Bottom", (180, 0, 0)),
]

# Curve smoothness by detail tier. OpenSCAD's default $fn (~12 facets on
# circles/cylinders) looks visibly faceted/low-poly — this is the single
# biggest lever on perceived model "quality" for anything with round
# features, and it's easy for an LLM to just forget to set. We inject it
# as a safety net rather than relying solely on the prompt.
DETAIL_FN = {"draft": 24, "standard": 48, "production": 96}

_FN_DIRECTIVE_RE = re.compile(r"^\s*\$fn\s*=", re.MULTILINE)


def ensure_fn_directive(scad_code: str, detail_level: str = "standard") -> str:
    """Prepends a global $fn directive if the generated code doesn't
    already set one, so curve smoothness matches the requested detail
    tier even if the model forgot to set it itself."""
    if _FN_DIRECTIVE_RE.search(scad_code):
        return scad_code
    fn = DETAIL_FN.get(detail_level, DETAIL_FN["standard"])
    return f"$fn = {fn};\n\n{scad_code}"


@dataclass
class BoundingBox:
    x_mm: float
    y_mm: float
    z_mm: float

    def describe(self) -> str:
        return f"{self.x_mm:.1f} x {self.y_mm:.1f} x {self.z_mm:.1f} mm (X x Y x Z)"


def _parse_binary_stl_bbox(path: str) -> Optional[BoundingBox]:
    """Reads a binary STL's triangle vertices directly (stdlib struct,
    no extra dependency) and returns its axis-aligned bounding box."""
    with open(path, "rb") as f:
        header = f.read(80)
        if len(header) < 80:
            return None
        count_bytes = f.read(4)
        if len(count_bytes) < 4:
            return None
        (tri_count,) = struct.unpack("<I", count_bytes)

        min_x = min_y = min_z = float("inf")
        max_x = max_y = max_z = float("-inf")
        seen_any = False

        for _ in range(tri_count):
            record = f.read(50)  # 12 floats (normal+3 verts) + 2-byte attr
            if len(record) < 50:
                break
            floats = struct.unpack("<12f", record[:48])
            # floats[0:3] = normal, floats[3:12] = 3 vertices (x,y,z each)
            for vi in range(3):
                x, y, z = floats[3 + vi * 3: 6 + vi * 3]
                seen_any = True
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
                min_z, max_z = min(min_z, z), max(max_z, z)

        if not seen_any:
            return None
        return BoundingBox(max_x - min_x, max_y - min_y, max_z - min_z)


@dataclass
class SyntaxCheckResult:
    ok: bool
    error: str = ""


class SCADEngineError(RuntimeError):
    pass


class SCADEngine:
    def __init__(self, openscad_bin: str = None, logger=None):
        self.logger = logger or _default_logger
        self.openscad_bin = openscad_bin or os.getenv("OPENSCAD_BIN", "openscad")
        self._checked_binary = False
        # PNG export (used for the 6 projection views) needs an OpenGL
        # context. On headless Linux servers with no X display, wrap the
        # call with xvfb-run if it's available; on macOS/Windows or a
        # machine with a real display this isn't needed.
        self._needs_xvfb = (
            os.name == "posix"
            and platform.system() == "Linux"
            and not os.environ.get("DISPLAY")
            and shutil.which("xvfb-run") is not None
        )

    # ------------------------------------------------------------------
    def _ensure_binary(self) -> None:
        if self._checked_binary:
            return
        if shutil.which(self.openscad_bin) is None:
            raise SCADEngineError(
                f"OpenSCAD binary '{self.openscad_bin}' not found on PATH. "
                "Install OpenSCAD and/or set OPENSCAD_BIN in your .env. "
                "See README.md for instructions."
            )
        self._checked_binary = True

    def _cmd(self, args: List[str], needs_gl: bool = False) -> List[str]:
        """Prefix with xvfb-run when we need offscreen OpenGL (PNG
        export) and there's no display available."""
        if needs_gl and self._needs_xvfb:
            return ["xvfb-run", "-a", self.openscad_bin] + args
        return [self.openscad_bin] + args

    def _write_temp_scad(self, scad_code: str, tmpdir: str) -> str:
        path = os.path.join(tmpdir, "model.scad")
        with open(path, "w", encoding="utf-8") as f:
            f.write(scad_code)
        return path

    # ------------------------------------------------------------------
    def check_syntax(self, scad_code: str, timeout: int = 60) -> SyntaxCheckResult:
        """Layer-1 validation: does the file run in OpenSCAD without
        errors? (paper: 'first layer, system will run the SCAD file and
        ensures that the file runs without any syntax error')."""
        self._ensure_binary()
        with tempfile.TemporaryDirectory() as tmpdir:
            scad_path = self._write_temp_scad(scad_code, tmpdir)
            out_path = os.path.join(tmpdir, "check.csg")
            try:
                result = subprocess.run(
                    [self.openscad_bin, "-o", out_path, scad_path],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
            except subprocess.TimeoutExpired:
                return SyntaxCheckResult(ok=False, error="OpenSCAD timed out while checking syntax.")

            if result.returncode != 0 or "ERROR" in result.stderr:
                self.logger.log(f"Syntax check FAILED: {result.stderr.strip()[:400]}")
                return SyntaxCheckResult(ok=False, error=result.stderr.strip())
            self.logger.log("Syntax check passed.")
            return SyntaxCheckResult(ok=True)

    # ------------------------------------------------------------------
    def render_stl(self, scad_code: str, output_path: str, timeout: int = 180) -> str:
        self._ensure_binary()
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with tempfile.TemporaryDirectory() as tmpdir:
            scad_path = self._write_temp_scad(scad_code, tmpdir)
            result = subprocess.run(
                self._cmd(["--export-format=binstl", "-o", output_path, scad_path], needs_gl=False),
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if result.returncode != 0:
                raise SCADEngineError(f"STL render failed: {result.stderr.strip()}")
        self.logger.log(f"STL rendered to {output_path}")
        return output_path

    # ------------------------------------------------------------------
    def measure_bounding_box(self, scad_code: str, timeout: int = 120) -> Optional[BoundingBox]:
        """Renders to a throwaway STL and measures its actual geometric
        bounding box. Used to catch the dimensional-accuracy drift the
        paper flags as a known GPT-4o weakness — e.g. the model says
        '80mm tall' in its description but the geometry it wrote is
        actually 65mm, which projection-image self-eval alone often
        misses since it's just judging a 2D render, not measurements."""
        self._ensure_binary()
        with tempfile.TemporaryDirectory() as tmpdir:
            scad_path = self._write_temp_scad(scad_code, tmpdir)
            stl_path = os.path.join(tmpdir, "measure.stl")
            result = subprocess.run(
                self._cmd(["--export-format=binstl", "-o", stl_path, scad_path], needs_gl=False),
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if result.returncode != 0 or not os.path.exists(stl_path):
                self.logger.log(f"Could not measure bounding box: {result.stderr.strip()[:200]}")
                return None
            try:
                return _parse_binary_stl_bbox(stl_path)
            except (struct.error, OSError) as e:
                self.logger.log(f"Could not parse STL for measurement: {e}")
                return None

    # ------------------------------------------------------------------
    def render_projections(self, scad_code: str, output_dir: str, img_size: str = "640,480") -> Dict[str, str]:
        """Render the 6 projection views used by the internal
        self-evaluation feedback loop. Returns {view_name: png_path}."""
        self._ensure_binary()
        os.makedirs(output_dir, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmpdir:
            scad_path = self._write_temp_scad(scad_code, tmpdir)
            paths: Dict[str, str] = {}
            for name, (rx, ry, rz) in PROJECTION_VIEWS:
                png_path = os.path.join(output_dir, f"view_{name.lower()}.png")
                camera = f"0,0,0,{rx},{ry},{rz},140"
                args = [
                    "-o", png_path,
                    f"--camera={camera}",
                    f"--imgsize={img_size}",
                    "--autocenter",
                    "--viewall",
                    "--render=true",
                    scad_path,
                ]
                result = subprocess.run(
                    self._cmd(args, needs_gl=True),
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode != 0:
                    self.logger.log(f"Warning: failed to render {name} view: {result.stderr.strip()[:200]}")
                    continue
                paths[name] = png_path
            self.logger.log(f"Rendered {len(paths)}/6 projection views.")
            return paths

    @staticmethod
    def image_to_base64(path: str) -> str:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
