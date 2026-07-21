"""3D printer control layer (paper: 'We integrated Printrun, an
open-source software for controlling 3D printers used to provide
real-time interactions and monitoring').

This implements the same core mechanism Printrun uses under the hood
(streaming G-code over serial and waiting for 'ok' acknowledgements),
via pyserial, so you get real hardware control without vendoring the
whole Printrun GUI codebase. If you'd rather use Printrun/Pronterface
directly, point PRINTER_PORT at the same serial device and use that
tool instead -- this module is just a minimal, scriptable alternative.
"""
from __future__ import annotations

import glob
import os
import platform
import time
from typing import Callable, List, Optional

from utils.logger import logger as _default_logger

try:
    import serial
    from serial.tools import list_ports
except ImportError:  # pragma: no cover
    serial = None
    list_ports = None


class PrinterError(RuntimeError):
    pass


def list_available_ports() -> List[str]:
    if list_ports is None:
        return []
    return [p.device for p in list_ports.comports()]


class PrinterConnection:
    def __init__(self, port: Optional[str] = None, baudrate: int = 115200, logger=None):
        if serial is None:
            raise PrinterError("pyserial is not installed. Run: pip install pyserial")
        self.logger = logger or _default_logger
        self.port = port or os.getenv("PRINTER_PORT")
        self.baudrate = int(os.getenv("PRINTER_BAUDRATE", baudrate))
        self._conn: Optional["serial.Serial"] = None

    @property
    def connected(self) -> bool:
        return self._conn is not None and self._conn.is_open

    def connect(self, timeout: float = 10.0) -> None:
        if not self.port:
            raise PrinterError(
                "No printer port configured. Set PRINTER_PORT in .env, "
                f"e.g. one of: {list_available_ports()}"
            )
        self.logger.log(f"Connecting to printer on {self.port} @ {self.baudrate} baud...")
        self._conn = serial.Serial(self.port, self.baudrate, timeout=2)
        time.sleep(2)  # most boards reset on serial connect
        self._conn.reset_input_buffer()
        self.logger.log("Printer connected.")

    def disconnect(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None
            self.logger.log("Printer disconnected.")

    def _send_line(self, line: str, wait_ok: bool = True) -> None:
        if not self.connected:
            raise PrinterError("Printer is not connected.")
        self._conn.write((line.strip() + "\n").encode("utf-8"))
        if wait_ok:
            start = time.time()
            while time.time() - start < 30:
                resp = self._conn.readline().decode(errors="ignore").strip()
                if resp.lower().startswith("ok") or resp.startswith("error"):
                    return
                if resp:
                    continue

    def print_gcode_file(
        self, gcode_path: str, progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> None:
        """Stream a G-code file to the printer line by line, waiting for
        'ok' after each line, matching Printrun's basic streaming model."""
        if not self.connected:
            self.connect()

        with open(gcode_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [ln.split(";")[0].strip() for ln in f]
            lines = [ln for ln in lines if ln]

        total = len(lines)
        self.logger.log(f"Starting print: {total} G-code lines.")
        for i, line in enumerate(lines):
            self._send_line(line)
            if progress_callback:
                progress_callback(i + 1, total)
        self.logger.log("Print streaming complete.")
