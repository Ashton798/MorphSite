"""Run the existing FastAPI backend with the same Gemini settings as Next.js."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "integrations" / "hackathon-mvp" / "backend"
sys.path.insert(0, str(BACKEND))
from dotenv import dotenv_values

# Existing backend .env remains authoritative when explicitly set.
root_env = {**dotenv_values(ROOT / ".env"), **dotenv_values(ROOT / ".env.local")}
backend_env = dotenv_values(BACKEND / ".env")
mapping = {
    "GOOGLE_API_KEY": root_env.get("GEMINI_API_KEY") or root_env.get("GOOGLE_API_KEY", ""),
    "GOOGLE_TEXT_MODEL": root_env.get("GEMINI_TEXT_MODEL", "gemini-2.5-flash"),
    "GOOGLE_IMAGE_MODEL": root_env.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
    "GOOGLE_TTS_MODEL": root_env.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts"),
    "GOOGLE_TEXT_ENABLED": root_env.get("GEMINI_TEXT_ENABLED", "false"),
    "GOOGLE_TEXT_COST_APPROVED": root_env.get("GEMINI_TEXT_COST_APPROVED", "false"),
    "GOOGLE_IMAGE_ENABLED": root_env.get("GEMINI_IMAGE_ENABLED", "false"),
    "GOOGLE_IMAGE_COST_APPROVED": root_env.get("GEMINI_IMAGE_COST_APPROVED", "false"),
    "GOOGLE_TTS_ENABLED": root_env.get("GEMINI_TTS_ENABLED", "false"),
    "GOOGLE_TTS_COST_APPROVED": root_env.get("GEMINI_TTS_COST_APPROVED", "false"),
}
for key, value in mapping.items():
    if key not in backend_env and key not in os.environ and value:
        os.environ[key] = str(value)
# User has not authorized a paid video request.
os.environ.setdefault("GOOGLE_VIDEO_ENABLED", "false")
os.environ.setdefault("GOOGLE_VIDEO_COST_APPROVED", "false")
os.chdir(BACKEND)
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("MARKETING_PORT", "8002")))
