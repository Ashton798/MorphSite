"""Run exactly one bounded live Bailian probe per requested capability.

This script never prints credentials or raw upstream response bodies. Video task
creation is persisted before any later polling so reruns do not create a second
paid task accidentally.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "integrations" / "hackathon-mvp" / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import Settings  # noqa: E402
from app.providers.bailian_provider import (  # noqa: E402
    BailianImageProvider,
    BailianProviderError,
    BailianTTSProvider,
    BailianTextProvider,
    BailianVideoProvider,
)


OUTPUT = ROOT / "test-results" / "bailian-live"
TASK_FILE = OUTPUT / "video-task.json"


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


async def probe_text(config: Settings) -> dict:
    result = await BailianTextProvider(config).generate_json(
        "只返回一个 JSON 对象，不要 Markdown。",
        '返回 {"status":"ok","brand":"VOID COFFEE"}。',
        max_tokens=80,
        temperature=0.1,
    )
    return {
        "capability": "text",
        "status": "succeeded",
        "model": config.bailian_text_model,
        "valid_json": isinstance(result, dict),
        "fields": sorted(result.keys()),
    }


async def probe_image(config: Settings) -> dict:
    destination = OUTPUT / "void-coffee-wan.png"
    await BailianImageProvider(config).generate_image(
        "精品咖啡店商业宣传主视觉，VOID COFFEE，黑金配色，冰美式咖啡，真实产品摄影，留出中文标题排版空间，无人物",
        destination,
    )
    return {
        "capability": "image",
        "status": "succeeded",
        "model": config.bailian_image_model,
        "file": str(destination),
        "bytes": destination.stat().st_size,
    }


async def probe_tts(config: Settings) -> dict:
    destination = OUTPUT / "void-coffee-tts.wav"
    await BailianTTSProvider(config).generate_audio(
        "VOID COFFEE 周末咖啡节，开业冰美式第二杯半价。",
        destination,
    )
    return {
        "capability": "tts",
        "status": "succeeded",
        "model": config.bailian_tts_model,
        "file": str(destination),
        "bytes": destination.stat().st_size,
    }


async def probe_video(config: Settings) -> dict:
    provider = BailianVideoProvider(config)
    if TASK_FILE.exists():
        saved = json.loads(TASK_FILE.read_text(encoding="utf-8"))
        task_id = saved["task_id"]
        task = await provider.fetch_task(task_id)
        result = {
            "capability": "video",
            "status": task.status,
            "model": saved["model"],
            "task_id": task.task_id,
            "created_new_task": False,
        }
        if task.status == "SUCCEEDED" and task.result_url:
            destination = OUTPUT / "void-coffee-wan.mp4"
            await provider.save_result(task, destination)
            result.update({"file": str(destination), "bytes": destination.stat().st_size})
        return result

    first_frame = OUTPUT / "void-coffee-wan.png"
    task = await provider.create_task(
        "镜头缓慢推进，一杯冰美式在黑金灯光下产生细腻冷凝水，商业咖啡广告风格，画面稳定",
        first_frame if first_frame.exists() else None,
    )
    model = config.bailian_i2v_model if first_frame.exists() else config.bailian_t2v_model
    TASK_FILE.write_text(
        json.dumps({"task_id": task.task_id, "model": model}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "capability": "video",
        "status": task.status,
        "model": model,
        "task_id": task.task_id,
        "created_new_task": True,
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("capability", choices=("text", "image", "tts", "video"))
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    config = Settings()
    probes = {
        "text": probe_text,
        "image": probe_image,
        "tts": probe_tts,
        "video": probe_video,
    }
    try:
        emit(await probes[args.capability](config))
        return 0
    except BailianProviderError as exc:
        emit({
            "capability": args.capability,
            "status": "failed",
            "category": exc.category,
            "http_status": exc.status_code,
            "request_id": exc.request_id,
            "message": str(exc),
        })
        return 2
    except Exception as exc:
        emit({
            "capability": args.capability,
            "status": "failed",
            "category": "local_probe_error",
            "message": type(exc).__name__,
        })
        return 3


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
