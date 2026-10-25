"""Create one real gateway video; preserve task ID before polling."""
import json,time,base64
from pathlib import Path
import httpx
from dotenv import dotenv_values
c=dotenv_values('.env.local');base=c['AI_BASE_URL'].rstrip('/').removesuffix('/v1');headers={'Authorization':'Bearer '+c['AI_API_KEY']}
record=Path('test-results/next-premium-video-task.json')
prompt='Premium cinematic product launch film. The exact pink rose in the reference is the hero product. Preserve its petal shape, pink color and green stem. 0-2s: extreme macro tracking shot around dew drops with a moving narrow rim light. 2-4s: camera physically orbits the rose, revealing real parallax between overlapping petals; subtle petal motion. 4-6s: pull back into a complete hero reveal on a warm ivory seamless studio stage, dramatic controlled light sweep and gentle floating particles. Sophisticated minimal art direction, precise motion-control camera, shallow depth of field, photographic material detail. Multiple meaningful shots with continuous product identity. No slideshow, no static photograph, no flat digital zoom, no logos or generated text. Audio: original restrained cinematic electronic sound design, low pulse, soft airy transition, resolving tonal chime. No speech.'
if not record.exists():
 uri='data:image/png;base64,'+base64.b64encode(Path('test-results/next-image-edit.png').read_bytes()).decode()
 r=httpx.post(base+'/v1/videos',headers=headers,json={'model':'doubao-seedance-2-5-260628','prompt':prompt,'content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':uri},'role':'first_frame'}],'duration':5,'resolution':'720p','generate_audio':True},timeout=55)
 print('create',r.status_code,r.text[:1800].encode('unicode_escape').decode());
 if r.status_code<300:record.write_text(json.dumps(r.json()),encoding='utf-8')
else:
 task=json.loads(record.read_text());task_id=task.get('id') or task.get('task_id');r=httpx.get(base+'/v1/videos/'+task_id,headers=headers,timeout=30);b=r.json();record.with_name('next-premium-video-status.json').write_text(json.dumps(b),encoding='utf-8');print('poll',r.status_code,r.text[:1800].encode('unicode_escape').decode())
