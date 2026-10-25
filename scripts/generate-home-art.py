"""Generate original homepage product photography with the configured image API."""
import concurrent.futures,base64,json
from pathlib import Path
import httpx
from dotenv import dotenv_values
c=dotenv_values('.env.local');base=c['AI_BASE_URL'].rstrip('/').removesuffix('/v1');out=Path('public/assets/showcase');out.mkdir(parents=True,exist_ok=True)
shots={
'coffee-editorial':'Luxury independent coffee campaign photograph. Sculptural matte ivory ceramic espresso cup with real rich crema beside a standing charcoal black coffee pouch with a small blank cream label, on warm dark olive stone. Directional morning sunlight, natural long shadows, analog editorial photography, delicate steam. Product grouped on right two thirds, dark olive negative space on left. Real photographic materials, no illustration, no letters, no text, landscape composition.',
'coffee-poster':'High end coffee campaign art photograph. A sculptural espresso cup in deep burgundy ceramic on a dusty rose pink stone plinth, coffee beans suspended in a carefully composed arc above the cup. Large clean pink negative space in upper half for typography. Soft side light, tactile ceramic and paper, refined fashion editorial still life, original artistic arrangement, no text no letters. Portrait composition.',
'coffee-cinematic':'Cinematic extreme macro product photograph of glossy espresso crema swirling inside a dark ceramic cup, dramatic thin warm gold rim light, real fine steam curling into charcoal black background, precise studio lighting, photographic liquid details and moving tiny droplets frozen in air. Premium product launch film still, warm bronze black palette, no text no letters. Wide landscape composition.'}
def generate(item):
 name,prompt=item
 r=httpx.post(base+'/v1/images/generations',headers={'Authorization':'Bearer '+c['AI_API_KEY']},json={'model':'gpt-image-1.5','prompt':prompt,'n':1,'size':'1024x1536' if name=='coffee-poster' else '1536x1024','response_format':'b64_json'},timeout=160)
 r.raise_for_status();item=r.json()['data'][0];data=base64.b64decode(item['b64_json']) if item.get('b64_json') else httpx.get(item['url'],timeout=60).content
 from PIL import Image
 import io
 with Image.open(io.BytesIO(data)) as im:im.convert('RGB').save(out/(name+'.webp'),'WEBP',quality=90)
 print(name,'saved',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(generate,shots.items()))
