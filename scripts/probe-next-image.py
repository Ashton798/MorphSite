import base64,json,time
from pathlib import Path
import httpx
from dotenv import dotenv_values
c=dotenv_values('.env.local');base=c['AI_BASE_URL'].rstrip('/').removesuffix('/v1');start=time.monotonic()
with open('test-results/flower-live/image.png','rb') as image:
 r=httpx.post(base+'/v1/images/edits',headers={'Authorization':'Bearer '+c['AI_API_KEY']},data={'model':'gpt-image-1.5','prompt':'Retouch this exact rose photograph for a premium florist website. Preserve the pink rose petals and green stem exactly. Improve lighting and detail, use a soft cream background. No text.','size':'1024x1024','n':'1'},files={'image':('product.png',image,'image/png')},timeout=145)
print('status',r.status_code,'seconds',round(time.monotonic()-start,1))
b=r.json();item=b.get('data',[{}])[0]
if item.get('b64_json'):Path('test-results/next-image-edit.png').write_bytes(base64.b64decode(item['b64_json']))
elif item.get('url'):
 data=httpx.get(item['url'],timeout=45).content;Path('test-results/next-image-edit.png').write_bytes(data)
else:print('error_code',b.get('error',{}).get('code'),'type',b.get('error',{}).get('type'))
