import unittest
from unittest.mock import AsyncMock, patch
from app.config import settings
from app.providers.next_video_provider import NextVideoProvider

class NextVideoTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_motion_and_native_audio_contract(self):
        with patch.object(settings,'openai_next_api_key','test'),patch.object(settings,'openai_next_base_url','https://api.example.com/v1'),patch.object(settings,'openai_next_video_model','doubao-seedance-2-5-260628'):
            provider=NextVideoProvider()
            provider.request=AsyncMock(return_value={'id':'remote-123'})
            task=await provider.create_task('pink rose')
            self.assertEqual(task.task_id,'remote-123')
            args=provider.request.call_args.args
            self.assertEqual(args[1],'/v1/videos')
            self.assertEqual(args[2]['duration'],5)
            self.assertTrue(args[2]['generate_audio'])
            self.assertIn('real camera orbit',args[2]['prompt'])
            self.assertNotIn('Bearer',args[2]['prompt'])

    async def test_status_preserves_task_and_native_video_url(self):
        with patch.object(settings,'openai_next_api_key','test'),patch.object(settings,'openai_next_base_url','https://api.example.com'),patch.object(settings,'openai_next_video_model','test-video'):
            provider=NextVideoProvider()
            provider.request=AsyncMock(return_value={'status':'completed','video_url':'https://cdn.example.com/video.mp4'})
            task=await provider.fetch_task('remote-123')
            self.assertEqual(task.status,'SUCCEEDED')
            self.assertEqual(task.result_url,'https://cdn.example.com/video.mp4')
