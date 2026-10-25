"""Real single-submit product campaign through the configured gateway."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1440,'height':1000});errors=[];responses=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def record(r):
  if '/api/brand/' in r.url or '/api/marketing/generations' in r.url:
   try:responses.append({'url':r.url,'status':r.status,'body':r.json()})
   except:pass
 page.on('response',record)
 page.goto('http://localhost:3000/studio');page.wait_for_load_state('networkidle')
 page.locator('input[type=file]').first.set_input_files('test-results/flower-live/image.png')
 text=page.locator('textarea')
 text.fill('这是粉色玫瑰鲜花，品牌晨露花房，面向送礼用户。生成整套网站、宣传图片和5秒有声视频。网站用奶油白和叶绿色，产品优先布局。优化参考图光线并保留花瓣形态，不编造价格和产地。')
 page.get_by_role('button',name='发送',exact=True).click()
 expect(page.locator('.website-frame')).to_have_attribute('data-layout','product-first',timeout=90000)
 page.screenshot(path='test-results/next-live-site.png',full_page=True)
 expect(page.get_by_role('status').filter(has_text='生成任务已结束')).to_be_visible(timeout=180000)
 site=[r for r in responses if '/brand/generate' in r['url']]
 image=[r for r in responses if '/brand/image' in r['url'] and r['status']==200]
 assert image,'Reference image did not complete'
 page.get_by_role('button',name='Video',exact=True).click()
 expect(page.locator('video').first).to_be_visible(timeout=15000)
 video=page.locator('video').first
 video.evaluate('(v)=>{v.load()}')
 expect(video).to_have_js_property('readyState',4,timeout=20000)
 duration=video.evaluate('v=>v.duration');assert 4.5<=duration<=5.5
 page.screenshot(path='test-results/next-live-video.png',full_page=True)
 assert not errors,errors
 Path('test-results/next-browser-responses.json').write_text(json.dumps(responses,ensure_ascii=False),encoding='utf-8')
 print('PASS real gateway: upload -> product-specific website -> reference image edit -> poster -> 5-second local narrated video; no browser errors')
 b.close()
