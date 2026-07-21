"""Voice input layer (paper section 2.1.2): 'LLMs lack the ability to
process audio directly; therefore, a real-time Python-based speech
recognition library is used to convert all audio inputs into text.'

Accepts raw audio bytes (e.g. from st.audio_input or a file uploader)
and returns transcribed text. Uses the free SpeechRecognition/Google
Web Speech API by default; if an OpenAI key is available, can instead
use the Whisper API for higher accuracy.
"""
from __future__ import annotations

import io
import os
import tempfile
from typing import Optional

from utils.logger import logger as _default_logger

try:
    import speech_recognition as sr
except ImportError:  # pragma: no cover
    sr = None


def transcribe_audio_bytes(audio_bytes: bytes, use_whisper_api: bool = False,
                            openai_client=None, logger=None) -> str:
    """Transcribe raw audio bytes (wav/webm/ogg) to text."""
    logger = logger or _default_logger
    if use_whisper_api and openai_client is not None:
        return _transcribe_with_whisper(audio_bytes, openai_client, logger)
    return _transcribe_with_speech_recognition(audio_bytes, logger)


def _transcribe_with_speech_recognition(audio_bytes: bytes, logger=_default_logger) -> str:
    if sr is None:
        raise RuntimeError(
            "SpeechRecognition is not installed. Run: pip install SpeechRecognition"
        )
    recognizer = sr.Recognizer()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        with sr.AudioFile(tmp_path) as source:
            audio = recognizer.record(source)
        text = recognizer.recognize_google(audio)
        logger.log(f"Voice input transcribed: '{text}'")
        return text
    except sr.UnknownValueError:
        logger.log("Voice input: could not understand audio.")
        return ""
    except sr.RequestError as e:
        logger.log(f"Voice input: recognition service error: {e}")
        return ""
    finally:
        os.unlink(tmp_path)


def _transcribe_with_whisper(audio_bytes: bytes, openai_client, logger=_default_logger) -> str:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        with open(tmp_path, "rb") as f:
            transcript = openai_client.audio.transcriptions.create(
                model="whisper-1", file=f
            )
        text = transcript.text
        logger.log(f"Voice input transcribed (Whisper): '{text}'")
        return text
    finally:
        os.unlink(tmp_path)
