import json,subprocess
from pathlib import Path
import httpx
from dotenv import dotenv_values
c=dotenv_values('.env.local');base=c['AI_BASE_URL'].rstrip('/').removesuffix('/v1');headers={'Authorization':'Bearer '+c['AI_API_KEY']};record=json.loads(Path('test-results/working-video-task.json').read_text());task_id=record['task_id']
r=httpx.get(base+'/v1/videos/'+task_id,headers=headers,timeout=40);b=r.json();Path('test-results/working-video-status.json').write_text(json.dumps(b),encoding='utf-8');print('poll',r.status_code,json.dumps(b,ensure_ascii=True)[:2200])
if b.get('status') in ['completed','succeeded']:
 url=b.get('url') or b.get('video_url') or (b.get('content') or {}).get('video_url')
 r=httpx.get(url or base+'/v1/videos/'+task_id+'/content',headers={} if url else headers,timeout=50,follow_redirects=True)
 if r.status_code==200 and b'ftyp' in r.content[:32]:
  output=Path('test-results/working-video.mp4');output.write_bytes(r.content)
  p=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json',str(output)],capture_output=True,text=True);print(p.stdout);Path('test-results/working-video-probe.json').write_text(p.stdout)
 else:print('download',r.status_code,r.text[:200] if r.status_code!=200 else 'invalid mp4')
