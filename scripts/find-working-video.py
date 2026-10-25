"""Try bounded gateway video candidates; stop and persist on first accepted task."""
import json,base64,time
from pathlib import Path
import httpx
from dotenv import dotenv_values
c=dotenv_values('.env.local');base=c['AI_BASE_URL'].rstrip('/').removesuffix('/v1');headers={'Authorization':'Bearer '+c['AI_API_KEY']}
record=Path('test-results/working-video-task.json');results_path=Path('test-results/video-candidate-results.json')
if record.exists():
 print('Existing accepted task; use poll-working-video.py');raise SystemExit()
uri='data:image/png;base64,'+base64.b64encode(Path('test-results/next-image-edit.png').read_bytes()).decode()
prompt='Five second premium cinematic product launch film of the exact pink rose in reference. Extreme macro tracking over dewdrops, real camera orbit around overlapping petals with strong natural parallax, then pull back to reveal the whole rose on an ivory studio stage. Moving rim light, subtle natural petal motion, photographic detail. Preserve product identity. Real dynamic footage, no slideshow, no static image zoom. Original electronic sound design and gentle tonal chime. No speech, no text.'
results=json.loads(results_path.read_text()) if results_path.exists() else []
import sys
model=sys.argv[1]
start=time.monotonic()
body={'model':model,'prompt':prompt,'seconds':'5','size':'1280x720','duration':'5','resolution':'720p','generate_audio':True,'content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':uri},'role':'first_frame'}]}
try:
 r=httpx.post(base+'/v1/videos',headers=headers,json=body,timeout=50)
 b=r.json();task_id=b.get('id') or b.get('task_id') or (b.get('data',{}).get('id') if isinstance(b.get('data'),dict) else None)
 status={'model':model,'http':r.status_code,'seconds':round(time.monotonic()-start,1),'response':b}
 if r.status_code<300 and task_id:
  record.write_text(json.dumps({'model':model,'task_id':task_id,'response':b}),encoding='utf-8')
 results.append(status);results_path.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'model':model,'http':r.status_code,'task_id':task_id,'response':b},ensure_ascii=True)[:2300])
except httpx.HTTPError as e:print(model,type(e).__name__,'not retried')
