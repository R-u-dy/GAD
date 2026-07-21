"""Tiny logger that keeps an in-memory history so a UI can show a live
'system log' panel (see Fig. 2b in the paper), while also printing to
stdout for terminal debugging.

Supports an optional per-instance callback so a web backend can stream
log lines out to a specific client (e.g. over Server-Sent Events)
without different concurrent jobs' logs getting mixed together.
"""
from __future__ import annotations

import datetime
from typing import Callable, List, Optional


class GADLogger:
    def __init__(self, on_log: Optional[Callable[[str], None]] = None) -> None:
        self.lines: List[str] = []
        self._on_log = on_log

    def log(self, message: str) -> None:
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {message}"
        self.lines.append(line)
        print(line)
        if self._on_log:
            try:
                self._on_log(line)
            except Exception:  # noqa: BLE001 - never let a broken UI callback break generation
                pass

    def text(self) -> str:
        return "\n".join(self.lines)

    def clear(self) -> None:
        self.lines = []


# Single shared instance for standalone/CLI use (e.g. the original
# Streamlit app). Web endpoints create their own per-job GADLogger()
# instance instead so concurrent requests don't share log state.
logger = GADLogger()
