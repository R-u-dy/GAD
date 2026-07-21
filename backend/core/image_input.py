"""Visual input layer (paper section 2.1.2): base64-encodes uploaded
reference images/blueprints for the vision-capable LLM call, and offers
auto-naming when the user uploads images with no text description.
"""
from __future__ import annotations

import base64
from typing import List


def encode_image_bytes(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")


def encode_uploaded_files(uploaded_files) -> List[str]:
    """Accepts a list of Streamlit UploadedFile objects and returns a
    list of base64-encoded strings."""
    encoded = []
    for f in uploaded_files or []:
        f.seek(0)
        encoded.append(encode_image_bytes(f.read()))
    return encoded
