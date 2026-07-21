"""External resources layer (paper Fig. 2e): lets GAD point the LLM at
locally-installed OpenSCAD libraries (e.g. a parametric gears library)
so generated code can `use <...>` them instead of hand-rolling geometry.

Drop .scad library files into the libraries/ folder next to this file
(or point LIBRARIES_DIR elsewhere) and they'll show up here.
"""
from __future__ import annotations

import os
from typing import List

DEFAULT_LIBRARIES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "libraries")


def list_available_libraries(libraries_dir: str = DEFAULT_LIBRARIES_DIR) -> List[str]:
    if not os.path.isdir(libraries_dir):
        return []
    return sorted(f for f in os.listdir(libraries_dir) if f.endswith(".scad"))


def combined_libraries_string(selected: List[str], libraries_dir: str = DEFAULT_LIBRARIES_DIR) -> str:
    """Returns a text blob describing the selected libraries (names +
    file paths) to embed in the LLM prompt, so it knows what `use <...>`
    statements are valid."""
    if not selected:
        return ""
    lines = []
    for name in selected:
        path = os.path.join(libraries_dir, name)
        lines.append(f"- {name} (use <{path}>;)")
    return "Available OpenSCAD libraries:\n" + "\n".join(lines)
