"""Generate one real flower image with a bounded timeout, save evidence."""
import asyncio, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'integrations/hackathon-mvp/backend'))
from app.config import Settings
from app.providers.bailian_provider import BailianImageProvider, BailianProviderError
from app.services.storage_service import storage_service
async def main():
    out = ROOT / 'test-results/flower-live'
    destination = storage_service.output_file('f10a' * 8, 'bailian.png')
    try:
        await BailianImageProvider(Settings()).generate_image('一朵粉色玫瑰，清晨露珠，奶油白背景，精品花店商业主视觉摄影，柔和自然光，无文字。', destination)
        result = {'status': 'succeeded', 'url': storage_service.public_url(destination), 'bytes': destination.stat().st_size}
    except BailianProviderError as e:
        result = {'status': 'failed', 'error': str(e), 'category': e.category}
    (out / 'image-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
asyncio.run(main())
