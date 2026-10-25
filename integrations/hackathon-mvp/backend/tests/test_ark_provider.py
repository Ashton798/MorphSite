"""No-network Ark protocol tests; no real generation or credentials."""
import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from PIL import Image
from app.config import settings
from app.providers.ark_provider import ArkProvider
from app.providers.bailian_provider import BailianProviderError

class ArkTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_model_is_explicit(self):
        with patch.object(settings, 'ark_image_model', ''):
            with self.assertRaises(BailianProviderError): ArkProvider('image')

    async def test_reference_image_and_real_png_output(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(settings, 'ark_api_key', 'test'), patch.object(settings, 'ark_image_model', 'test-image'):
            source, output = Path(temp)/'source.png', Path(temp)/'output.png'
            Image.new('RGB', (8,8), 'pink').save(source)
            provider = ArkProvider('image')
            provider.request = AsyncMock(return_value={'data':[{'b64_json':base64.b64encode(source.read_bytes()).decode()}]})
            await provider.generate_image('preserve product', output, source)
            self.assertTrue(output.read_bytes().startswith(b'\x89PNG'))
            self.assertTrue(provider.request.call_args.args[2]['image'].startswith('data:image/png;base64,'))

    async def test_video_protocol_keeps_original_task(self):
        with patch.object(settings, 'ark_api_key', 'test'), patch.object(settings, 'ark_video_model', 'test-video'):
            provider = ArkProvider('video')
            provider.request = AsyncMock(side_effect=[{'id':'remote-task'}, {'status':'succeeded','content':{'video_url':'https://example.volces.com/movie.mp4'}}])
            task = await provider.create_task('product')
            completed = await provider.fetch_task(task.task_id)
            self.assertEqual(completed.status,'SUCCEEDED')
            self.assertEqual(provider.request.call_args.args[1], '/contents/generations/tasks/remote-task')
