"""Rendering/export layer, slicing step (paper: 'Slic3r, an open-source
slicer engine, is used to generate the G-code from 3D CAD files').

Works with PrusaSlicer or Slic3r's command-line interface, both of
which accept the same basic --export-gcode style flags. Set SLICER_BIN
in .env to whichever binary you have installed.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from typing import Optional

from utils.logger import logger as _default_logger


class SlicerError(RuntimeError):
    pass


class Slicer:
    def __init__(self, slicer_bin: Optional[str] = None, config_path: Optional[str] = None, logger=None):
        self.logger = logger or _default_logger
        self.slicer_bin = slicer_bin or os.getenv("SLICER_BIN", "prusa-slicer")
        self.config_path = config_path or os.getenv("SLICER_CONFIG") or None

    def _ensure_binary(self) -> None:
        if shutil.which(self.slicer_bin) is None:
            raise SlicerError(
                f"Slicer binary '{self.slicer_bin}' not found on PATH. "
                "Install PrusaSlicer or Slic3r and/or set SLICER_BIN in your .env."
            )

    def slice_to_gcode(self, stl_path: str, gcode_path: str, timeout: int = 300) -> str:
        self._ensure_binary()
        os.makedirs(os.path.dirname(os.path.abspath(gcode_path)), exist_ok=True)

        cmd = [self.slicer_bin, "--export-gcode", "-o", gcode_path]
        if self.config_path:
            cmd += ["--load", self.config_path]
        cmd.append(stl_path)

        self.logger.log(f"Slicing {stl_path} -> {gcode_path} ...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0 or not os.path.exists(gcode_path):
            raise SlicerError(f"Slicing failed: {result.stderr.strip() or result.stdout.strip()}")
        self.logger.log("G-code generated.")
        return gcode_path
