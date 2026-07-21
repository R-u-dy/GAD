"""LLM processing layer (paper section 2.1.2).

Wraps calls to GPT-4o (or, via OpenRouter, Gemini / OlympicCoder / other
models) and does the JSON parsing GAD relies on. Ships with a MOCK_MODE
so the rest of the pipeline can be built and tested before you have an
API key.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from utils.logger import logger as _default_logger
from core import prompts

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime
    OpenAI = None


MOCK_SCAD = (
    "// Mock response (MOCK_MODE=true / no API key configured)\n"
    "difference() {\n"
    "    cube([20, 20, 10], center=true);\n"
    "    translate([0, 0, 2]) cube([16, 16, 10], center=true);\n"
    "}\n"
)


def _extract_json(text: str) -> Dict[str, Any]:
    """LLMs occasionally wrap JSON in prose or code fences despite
    instructions. Try straight parsing first, then fall back to
    extracting the first {...} block."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    looks_truncated = not text.rstrip().endswith(("}", "```"))
    hint = (
        " (the response looks like it was cut off mid-JSON — this usually clears up on retry, "
        "or try a shorter/simpler description)"
        if looks_truncated
        else ""
    )
    raise ValueError(f"Could not parse JSON from LLM response{hint}: {text[:300]}")


class LLMClient:
    def __init__(
        self,
        model: str = "gpt-4o",
        openai_api_key: Optional[str] = None,
        openrouter_api_key: Optional[str] = None,
        openrouter_base_url: str = "https://openrouter.ai/api/v1",
        gemini_api_key: Optional[str] = None,
        gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/",
        mock_mode: Optional[bool] = None,
        logger=None,
    ) -> None:
        self.logger = logger or _default_logger
        self.model = model
        explicit_key_supplied = bool(openai_api_key or openrouter_api_key or gemini_api_key)

        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.openrouter_api_key = openrouter_api_key or os.getenv("OPENROUTER_API_KEY")
        self.openrouter_base_url = openrouter_base_url
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        self.gemini_base_url = gemini_base_url

        if mock_mode is None:
            if explicit_key_supplied:
                # A caller passed a key directly (e.g. a visitor's own
                # bring-your-own-key on a hosted deployment) — that
                # always wins, even if the server defaults to
                # MOCK_MODE=true as a safety net for keyless visitors.
                mock_mode = False
            else:
                env_mock = os.getenv("MOCK_MODE", "true").lower() == "true"
                mock_mode = env_mock or not (
                    self.openai_api_key or self.openrouter_api_key or self.gemini_api_key
                )
        self.mock_mode = mock_mode

        self._client = None
        self._provider_error = None
        if not self.mock_mode and OpenAI is not None:
            self._client = self._resolve_client(model)

        if self.mock_mode:
            self.logger.log("LLMClient running in MOCK MODE (no API key / MOCK_MODE=true).")

    def _resolve_client(self, model: str):
        """Pick the right provider for this specific model name, rather
        than silently falling back to whichever key happens to be
        configured — that produced confusing errors from the wrong
        provider (e.g. a GPT model name sent to Gemini's endpoint)."""
        is_gemini_model = model.startswith("gemini")
        is_openai_model = model.startswith(("gpt-", "o1", "o3", "o4", "text-", "chatgpt"))
        # Anything else (OpenRouter-style "vendor/model", custom local
        # model names, etc.) is provider-ambiguous, so it's fine to use
        # whatever key is configured for it.

        if is_gemini_model:
            if self.gemini_api_key:
                return OpenAI(api_key=self.gemini_api_key, base_url=self.gemini_base_url)
            self._provider_error = (
                f"Model '{model}' is a Gemini model, but GEMINI_API_KEY isn't set in .env."
            )
            return None

        if is_openai_model:
            if self.openai_api_key:
                return OpenAI(api_key=self.openai_api_key)
            self._provider_error = (
                f"Model '{model}' is an OpenAI model, but OPENAI_API_KEY isn't set in .env."
            )
            return None

        # Ambiguous model name — use whatever's configured, preferring
        # OpenRouter since it's the multi-provider option.
        if self.openrouter_api_key:
            return OpenAI(api_key=self.openrouter_api_key, base_url=self.openrouter_base_url)
        if self.openai_api_key:
            return OpenAI(api_key=self.openai_api_key)
        if self.gemini_api_key:
            return OpenAI(api_key=self.gemini_api_key, base_url=self.gemini_base_url)

        self._provider_error = (
            f"No API key is configured that can serve model '{model}'. "
            "Set OPENAI_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY in .env."
        )
        return None

    # ------------------------------------------------------------------
    def _chat(self, content: List[Dict[str, Any]]) -> str:
        """Send a single-turn user message (text + optional images) and
        return the raw text response."""
        if self.mock_mode:
            return self._mock_response(content)
        if self._client is None:
            raise ValueError(self._provider_error or "No LLM client configured.")

        kwargs: Dict[str, Any] = dict(
            model=self.model,
            messages=[{"role": "user", "content": content}],
            max_tokens=8000,
        )
        if self.model.startswith("gemini"):
            # Gemini models default to a high "thinking" effort on the API,
            # which burns a large chunk of max_tokens on internal reasoning
            # before writing any output — that's what was causing truncated
            # JSON. Low effort leaves the budget for the actual response.
            # (Documented at ai.google.dev/gemini-api/docs/openai)
            kwargs["extra_body"] = {"reasoning_effort": "low"}

        response = self._client.chat.completions.create(**kwargs)
        choice = response.choices[0]
        if choice.finish_reason == "length":
            self.logger.log(
                "Warning: response was cut off at the token limit — the model's reply may be "
                "incomplete JSON. If this keeps happening, try a shorter/simpler description."
            )
        return choice.message.content or ""

    def _mock_response(self, content: List[Dict[str, Any]]) -> str:
        text_blob = " ".join(
            c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"
        ).lower()
        if "is the model that you made good enough" in text_blob:
            return json.dumps({"response": "Yes"})
        if "suggest a descriptive name" in text_blob:
            return "mock_model"
        return json.dumps({"description": "Mock generated model", "code": MOCK_SCAD})

    # ------------------------------------------------------------------
    @staticmethod
    def _text_block(text: str) -> Dict[str, Any]:
        return {"type": "text", "text": text}

    @staticmethod
    def _image_block(base64_png: str) -> Dict[str, Any]:
        return {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{base64_png}"},
        }

    # ------------------------------------------------------------------
    def generate_scad(
        self, description: str, combined_libraries: str = "", images_b64: Optional[List[str]] = None,
        detail_level: str = "standard",
    ) -> Dict[str, str]:
        """Main-loop request: description (+ optional images) -> SCAD code."""
        prompt = prompts.first_request_prompt(description, combined_libraries, detail_level)
        content: List[Dict[str, Any]] = [self._text_block(prompt)]
        for img in images_b64 or []:
            content.append(self._image_block(img))

        self.logger.log(f"Requesting SCAD generation from {self.model} (detail: {detail_level})...")
        raw = self._chat(content)
        data = _extract_json(raw)
        if "code" not in data:
            raise ValueError(f"LLM response missing 'code' field: {raw[:300]}")
        return {"description": data.get("description", description), "code": data["code"]}

    def fix_syntax_error(
        self, description: str, current_scad: str, error_message: str, combined_libraries: str = ""
    ) -> str:
        prompt = prompts.syntax_fix_prompt(description, current_scad, error_message, combined_libraries)
        self.logger.log("Requesting syntax-error fix from LLM...")
        raw = self._chat([self._text_block(prompt)])
        data = _extract_json(raw)
        if "code" not in data:
            raise ValueError(f"LLM response missing 'code' field: {raw[:300]}")
        return data["code"]

    def self_evaluate(
        self,
        current_scad: str,
        description: str,
        view_name: str,
        projection_b64: str,
        combined_libraries: str = "",
        measured_dimensions: str = "",
    ) -> Dict[str, Any]:
        prompt = prompts.internal_feedback_prompt(
            current_scad, description, combined_libraries, view_name, measured_dimensions
        )
        content = [self._text_block(prompt), self._image_block(projection_b64)]
        self.logger.log(f"Self-evaluating {view_name} projection...")
        raw = self._chat(content)
        data = _extract_json(raw)
        if "response" not in data:
            raise ValueError(f"LLM response missing 'response' field: {raw[:300]}")
        return data

    def describe_image(self, images_b64: List[str]) -> str:
        prompt = prompts.image_naming_prompt()
        content: List[Dict[str, Any]] = [self._text_block(prompt)]
        for img in images_b64:
            content.append(self._image_block(img))
        raw = self._chat(content)
        name = raw.strip().strip('"')
        return re.sub(r"[^A-Za-z0-9_]", "_", name) or "unnamed_model"
