import json,base64,time
from pathlib import Path
import httpx
image='data:image/png;base64,'+base64.b64encode(Path('test-results/flower-live/image.png').read_bytes()).decode()
start=time.monotonic()
r=httpx.post('http://localhost:3000/api/brand/generate',json={'prompt':'这是我出售的粉色玫瑰鲜花。品牌叫晨露花房，面向送礼用户，做奶油白搭配叶绿色的产品优先网站。只写图片可见信息，不编造价格和产地。','image':image},timeout=100)
b=r.json();print('site',r.status_code,'seconds',round(time.monotonic()-start,1),'model',b.get('model'),'error',b.get('error'))
if not b.get('ok'):raise SystemExit(1)
spec=b['spec'];assert spec['assets']['heroImage']==image
Path('test-results/next-site-result.json').write_text(json.dumps(b,ensure_ascii=False),encoding='utf-8')
print('layout',spec['website']['layout'],'palette',spec['theme']['palette'])
r=httpx.post('http://localhost:3000/api/brand/edit',json={'spec':spec,'image':image,'prompt':'根据图片把产品展示段落改成具体描述粉色花瓣和绿色花茎，文案适合送礼用户。保留品牌和主标题。'},timeout=90)
b=r.json();print('edit',r.status_code,'changed',b.get('changed'),'error',b.get('error'));assert b.get('ok') and b.get('changed')
Path('test-results/next-site-edited.json').write_text(json.dumps(b,ensure_ascii=False),encoding='utf-8')
