"""Create one 5-second promotional clip with real TTS, verify video and audio."""
import json, sys, asyncio, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'integrations/hackathon-mvp/backend'))
from app.providers.bailian_provider import BailianTTSProvider
from app.services.ffmpeg_service import FFmpegService
from app.services.storage_service import storage_service
async def main():
    source=storage_service.output_file('f10a'*8,'bailian.png')
    video=storage_service.output_file('a0d1'*8,'video.mp4')
    audio=storage_service.output_file('a0d1'*8,'voice.wav')
    await BailianTTSProvider().generate_audio('一朵玫瑰，点亮生活。', audio)
    engine=FFmpegService()
    await engine.compose_promo_video([source],source,'一朵玫瑰，点亮生活',video)
    await engine.add_voiceover(video,audio)
    result=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
    streams=result['streams']
    assert any(x['codec_type']=='audio' for x in streams)
    duration=float(result['format']['duration'])
    assert 4.5<=duration<=5.5,duration
    subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    summary={'url':storage_service.public_url(video),'duration':duration,'audio':True,'bytes':video.stat().st_size}
    (ROOT/'test-results/sound-live.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary))
asyncio.run(main())
