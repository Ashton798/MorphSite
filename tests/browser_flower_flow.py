"""Exercise the combined chat flow using existing real assets; no new paid generation."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/flower-live'
spec = json.loads((OUT / 'spec.json').read_text(encoding='utf-8'))
image = json.loads((OUT / 'image-result.json').read_text(encoding='utf-8'))['url'].replace('/api/files/', '/api/marketing/files/')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1440,'height':1000})
    requests, errors = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/api/brand/generate?stream=1', lambda r: r.fulfill(content_type='application/x-ndjson', body=json.dumps({'type':'result','data':{'ok':True,'spec':spec,'summary':'鲜花网站已生成'}})))
    page.route('**/api/brand/image', lambda r: r.fulfill(json={'ok':True,'url':image,'model':'wan2.7-image'}))
    def video(route):
        payload=route.request.post_data_json
        requests.append(payload)
        assert payload['image'].startswith('data:image/webp;base64,')
        assert len(payload['image']) < 2000000
        route.fulfill(json={'ok':True,'taskId':'a6598a6bde91441986b0070a8d38c49a','status':'pending','model':'wan2.7-i2v'})
    page.route('**/api/brand/video', video)
    # Test the task completion UI using the same real image URL as an opaque fixture.
    page.route('**/api/brand/video?task=*', lambda r: r.fulfill(json={'ok':True,'url':'/api/marketing/files/'+'b'*32+'_bailian.mp4','status':'succeeded','model':'wan2.7-i2v'}))
    page.goto('http://localhost:3000/studio')
    page.wait_for_load_state('networkidle')
    page.locator('#studio-prompt').fill('一朵鲜花，生成网站、图片和5秒宣传视频')
    page.locator('#studio-prompt').press('Enter')
    expect(page.get_by_role('button', name='Video', exact=True)).to_be_enabled(timeout=30000)
    page.get_by_role('button', name='Video', exact=True).click()
    expect(page.locator('.generated-media-preview video')).to_be_visible(timeout=30000)
    assert len(requests)==1
    page.get_by_role('button',name='Website',exact=True).click()
    expect(page.locator('.project-meta strong')).to_have_text(spec['brand']['name'])
    page.get_by_role('button',name='Poster',exact=True).click()
    expect(page.locator('.generated-media-preview img').last).to_have_attribute('src',image)
    page.locator('.generated-media-preview img').last.evaluate('(img)=>img.decode()')
    assert not errors, errors
    print('PASS combined chat: website -> image -> compressed first frame -> video task -> polling -> preview tabs')
    browser.close()
