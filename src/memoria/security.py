from __future__ import annotations

import re
from typing import Any

_SECRET_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----", re.IGNORECASE),
    re.compile(r"(?i)[\"']?(?:\[)?\b(?:api[_-]?key|password|passwd|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)(?:\])?[\"']?\s*[:=]\s*[\"']?[^\s\"']{4,}"),
    re.compile(r"(?i)\b(?:authorization\s*:\s*)?(?:\[?(?:bearer|basic)\]?)\s+[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
)

_REDACTION = "[REDACTED SECRET-LIKE CONTENT]"


def contains_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in _SECRET_PATTERNS)


def require_safe_text(**fields: str | None) -> None:
    for name, value in fields.items():
        if value is not None and contains_secret(value):
            raise ValueError(f"{name} resembles a secret; store a vault reference, not the secret")


def redact_text(text: str) -> str:
    redacted = text
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub(_REDACTION, redacted)
    return redacted


def redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_value(item) for item in value)
    if isinstance(value, dict):
        return {key: redact_value(item) for key, item in value.items()}
    return value
