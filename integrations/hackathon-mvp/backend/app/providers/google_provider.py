"""Compatibility exports for the former REST provider module.

New code should import from ``google_genai_provider``.  These names stay
available so deployments and tests importing the old module do not break.
"""
from .google_genai_provider import (
    GoogleGeminiCopywritingProvider,
    GoogleGeminiPosterProvider,
    GoogleGeminiTTSProvider,
    GoogleProviderError,
    GoogleVeoVideoProvider,
    gemini_chat,
)

__all__ = [
    "GoogleGeminiCopywritingProvider",
    "GoogleGeminiPosterProvider",
    "GoogleGeminiTTSProvider",
    "GoogleProviderError",
    "GoogleVeoVideoProvider",
    "gemini_chat",
]
