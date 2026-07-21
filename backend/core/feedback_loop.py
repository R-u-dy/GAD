"""Orchestration layer implementing Figure 1 of the paper:

    User input -> LLM generation -> Syntax OK? -> (no: syntax feedback loop)
               -> Self-evaluation OK? -> (no: internal feedback loop)
               -> Final CAD model

Extended beyond the original paper with:
- detail_level: draft/standard/production quality tiers (curve
  smoothness, fillets, parametric structure — see core/prompts.py)
- a real measured bounding-box check fed into self-evaluation, catching
  "looks right but is the wrong size" errors that a 2D projection image
  alone can't reveal
- a $fn safety-net injection so curve smoothness matches the requested
  detail tier even if the model forgets to set it

Returns the final SCAD code plus a structured log of every attempt so
the UI can show what happened at each step.
"""
from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from typing import List, Optional

from core.llm_client import LLMClient
from core.scad_engine import SCADEngine, SCADEngineError, ensure_fn_directive
from utils.logger import logger as _default_logger


@dataclass
class GADResult:
    success: bool
    scad_code: str = ""
    description: str = ""
    attempts_log: List[str] = field(default_factory=list)
    syntax_retries_used: int = 0
    internal_iterations_used: int = 0
    error: str = ""


def run_gad_pipeline(
    llm: LLMClient,
    scad_engine: SCADEngine,
    description: str,
    images_b64: Optional[List[str]] = None,
    combined_libraries: str = "",
    enable_syntax_loop: bool = True,
    max_syntax_retries: int = 3,
    enable_internal_loop: bool = True,
    max_internal_iterations: int = 3,
    detail_level: str = "standard",
    logger=None,
) -> GADResult:
    logger = logger or _default_logger
    log: List[str] = []

    def note(msg: str) -> None:
        logger.log(msg)
        log.append(msg)

    # 1. Main loop: initial generation ---------------------------------
    note(f"Generating initial model from description: '{description[:80]}...'"
         if len(description) > 80 else f"Generating initial model from description: '{description}'")
    try:
        gen = llm.generate_scad(description, combined_libraries, images_b64, detail_level)
    except Exception as e:  # noqa: BLE001
        note(f"Initial generation failed: {e}")
        return GADResult(success=False, attempts_log=log, error=str(e))

    scad_code = ensure_fn_directive(gen["code"], detail_level)
    model_description = gen["description"]

    # 2. Syntax-error feedback loop -------------------------------------
    syntax_retries = 0
    if enable_syntax_loop:
        while syntax_retries < max_syntax_retries:
            try:
                result = scad_engine.check_syntax(scad_code)
            except SCADEngineError as e:
                note(str(e))
                return GADResult(success=False, scad_code=scad_code, attempts_log=log, error=str(e))

            if result.ok:
                break

            syntax_retries += 1
            note(f"Syntax error found (retry {syntax_retries}/{max_syntax_retries}): {result.error[:200]}")
            try:
                fixed = llm.fix_syntax_error(description, scad_code, result.error, combined_libraries)
                scad_code = ensure_fn_directive(fixed, detail_level)
            except Exception as e:  # noqa: BLE001
                note(f"Syntax fix request failed: {e}")
                return GADResult(success=False, scad_code=scad_code, attempts_log=log, error=str(e))
        else:
            note("Max syntax retries reached; the model may still contain errors.")

    # 3. Internal self-evaluation feedback loop -------------------------
    internal_iterations = 0
    if enable_internal_loop:
        with tempfile.TemporaryDirectory() as tmpdir:
            while internal_iterations < max_internal_iterations:
                try:
                    projections = scad_engine.render_projections(scad_code, tmpdir)
                except SCADEngineError as e:
                    note(f"Could not render projections for self-eval: {e}")
                    break

                if not projections:
                    note("No projections rendered; skipping self-evaluation.")
                    break

                # Real measured geometry, not just a 2D projection image —
                # lets the model catch "looks right but wrong size" errors.
                bbox = scad_engine.measure_bounding_box(scad_code)
                measured = bbox.describe() if bbox else ""
                if bbox:
                    note(f"Measured geometry: {measured}")

                needs_refine = False
                for view_name, png_path in projections.items():
                    img_b64 = scad_engine.image_to_base64(png_path)
                    try:
                        verdict = llm.self_evaluate(
                            scad_code, description, view_name, img_b64, combined_libraries, measured
                        )
                    except Exception as e:  # noqa: BLE001
                        note(f"Self-evaluation call failed on {view_name} view: {e}")
                        continue

                    if verdict.get("response", "Yes").lower() == "no" and verdict.get("code"):
                        note(f"Self-evaluation on {view_name} view: refinement suggested.")
                        scad_code = ensure_fn_directive(verdict["code"], detail_level)
                        needs_refine = True
                        break  # restart with the refined code
                    else:
                        note(f"Self-evaluation on {view_name} view: OK.")

                internal_iterations += 1
                if not needs_refine:
                    note("Model passed self-evaluation on all views.")
                    break

                # Re-check syntax on the refined code before next round
                if enable_syntax_loop:
                    check = scad_engine.check_syntax(scad_code)
                    if not check.ok:
                        note(f"Refined code has syntax errors, attempting fix: {check.error[:200]}")
                        try:
                            fixed = llm.fix_syntax_error(
                                description, scad_code, check.error, combined_libraries
                            )
                            scad_code = ensure_fn_directive(fixed, detail_level)
                        except Exception as e:  # noqa: BLE001
                            note(f"Syntax fix on refined code failed: {e}")
                            break
            else:
                note("Max internal iterations reached.")

    return GADResult(
        success=True,
        scad_code=scad_code,
        description=model_description,
        attempts_log=log,
        syntax_retries_used=syntax_retries,
        internal_iterations_used=internal_iterations,
    )
