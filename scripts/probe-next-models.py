"""Bounded real multimodal probes; never print credentials or response URLs."""
import concurrent.futures, json,time,base64
from pathlib import Path
import httpx
from dotenv import dotenv_values
c=dotenv_values('.env.local');base=c['AI_BASE_URL'].rstrip('/').removesuffix('/v1')
image=Path('public/assets/void-coffee-product.png')
if not image.exists():
    image=Path('test-results/flower-live/image.png')
uri='data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode()
def probe(model):
 start=time.monotonic()
 try:
  r=httpx.post(base+'/v1/chat/completions',headers={'Authorization':'Bearer '+c['AI_API_KEY']},json={'model':model,'messages':[{'role':'user','content':[{'type':'text','text':'Describe only the visible product and its colors. Return JSON with product and colors fields.'},{'type':'image_url','image_url':{'url':uri}}]}],'max_tokens':180},timeout=55)
  b=r.json();return {'model':model,'status':r.status_code,'seconds':round(time.monotonic()-start,1),'content':b.get('choices',[{}])[0].get('message',{}).get('content','')[:500]}
 except Exception as e:return {'model':model,'error':type(e).__name__}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 results=list(ex.map(probe,['gemini-2.5-flash','qwen3-vl-flash','doubao-seed-2-0-lite-260215']))
print(json.dumps(results,ensure_ascii=True,indent=2))
Path('test-results/next-vision-probes.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
