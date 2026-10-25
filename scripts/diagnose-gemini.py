"""Bounded, opt-in Google probes. Never calls Veo, retries, or enables billing."""
import argparse
import json
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "integrations/hackathon-mvp/backend"
sys.path.insert(0, str(BACKEND))
from dotenv import dotenv_values
from google import genai
from google.genai import types

parser = argparse.ArgumentParser()
parser.add_argument("--probe", action="store_true", help="One request per configured text/vision/image/TTS model; no retries")
args = parser.parse_args()
env = {**dotenv_values(ROOT / ".env.production.local"), **dotenv_values(ROOT / ".env.local"), **dotenv_values(BACKEND / ".env"), **os.environ}
key = env.get("GOOGLE_API_KEY") or env.get("GEMINI_API_KEY")
models = {
    "text": env.get("GOOGLE_TEXT_MODEL") or env.get("GEMINI_TEXT_MODEL") or "gemini-2.5-flash",
    "vision": env.get("GEMINI_VISION_MODEL") or env.get("GEMINI_TEXT_MODEL") or "gemini-2.5-flash",
    "image": env.get("GOOGLE_IMAGE_MODEL") or env.get("GEMINI_IMAGE_MODEL") or "gemini-2.5-flash-image",
    "tts": env.get("GOOGLE_TTS_MODEL") or env.get("GEMINI_TTS_MODEL") or "gemini-2.5-flash-preview-tts",
    "video": env.get("GOOGLE_VIDEO_MODEL") or env.get("GEMINI_VIDEO_MODEL") or "veo-3.1-generate-preview",
}
report = {"at": datetime.now(timezone.utc).isoformat(), "models": models, "retries": 0, "veo_called": False, "results": {}}
def failure(exc):
    status = getattr(exc, "code", None)
    text = str(exc).lower()
    category = {400:"invalid_request",401:"authentication",403:"permission",404:"model",503:"unavailable",504:"timeout"}.get(status, "network_or_transport")
    if status == 429:
        category = "zero_quota" if "limit: 0" in text else "daily_quota" if "perday" in text or "per day" in text else "rate_limit" if "perminute" in text or "per minute" in text else "quota_unknown"
    return {"ok": False, "http_status": status, "category": category}
def save():
    destination=ROOT / "test-results/gemini-diagnostics.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))
    print("Saved: test-results/gemini-diagnostics.json")
if not key:
    report["error"]="missing_api_key"; save(); sys.exit(1)
client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=25000, retry_options=types.HttpRetryOptions(attempts=1)))
try:
    listed = list(client.models.list(config={"page_size": 100}).page)
    names={model.name.removeprefix("models/") for model in listed}
    report["listing"]={"ok":True,"count":len(names)}
except Exception as exc:
    report["listing"]=failure(exc)
    for kind in models:
        report["results"][kind]={"called":False,"reason":"Model listing failed; no blind generation requests"}
    save(); client.close(); sys.exit(2)
for kind, model in models.items():
    if kind=="video":
        report["results"][kind]={"called":False,"listed":model in names,"reason":"Paid video is locked pending permission, quota and cost approval"}
        continue
    if not args.probe:
        report["results"][kind]={"called":False,"listed":model in names}; continue
    if model not in names:
        report["results"][kind]={"called":False,"listed":False,"category":"not_listed","reason":"No request made; listing alone cannot prove nonexistent versus restricted"}
        continue
    try:
        if kind in ("text","vision"):
            content=[types.Part.from_text(text='Return exactly JSON: {"ok":true}')]
            if kind=="vision":
                import io
                from PIL import Image
                image=io.BytesIO(); Image.new("RGB",(32,32),(150,85,40)).save(image,format="PNG")
                content.append(types.Part.from_bytes(data=image.getvalue(),mime_type="image/png"))
            response=client.models.generate_content(model=model,contents=content,config=types.GenerateContentConfig(response_mime_type="application/json",max_output_tokens=512))
            ok=bool(response.text); detail={"has_text":ok}
        elif kind=="image":
            response=client.models.generate_content(model=model,contents="A coffee cup on a plain cream background. No text.",config=types.GenerateContentConfig(response_modalities=["IMAGE"],image_config=types.ImageConfig(aspect_ratio="16:9")))
            ok=any(getattr(part,"inline_data",None) for part in response.parts or []); detail={"has_image":ok}
        else:
            response=client.models.generate_content(model=model,contents="欢迎来到咖啡店。",config=types.GenerateContentConfig(response_modalities=["AUDIO"],speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")))))
            ok=any(getattr(part,"inline_data",None) for part in response.parts or []); detail={"has_audio":ok}
        report["results"][kind]={"called":True,"ok":ok,"http_status":200,**detail}
    except Exception as exc:
        report["results"][kind]={"called":True,**failure(exc)}
client.close(); save()
