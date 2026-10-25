"""Verify actual generated flower assets in Studio without creating more paid tasks."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/flower-live'
BASE = 'http://localhost:3000'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/studio')
    page.wait_for_load_state('networkidle')
    spec = json.loads((OUT / 'spec.json').read_text(encoding='utf-8'))
    image = json.loads((OUT / 'image-result.json').read_text(encoding='utf-8'))['url'].replace('/api/files/', '/api/marketing/files/')
    task = page.request.get(BASE + '/api/brand/video?task=a6598a6bde91441986b0070a8d38c49a', timeout=60000).json()
    (OUT / 'video-result.json').write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding='utf-8')
    spec['assets']['heroImage'] = image
    media = [{'url': image, 'kind': 'image', 'model': 'wan2.7-image'}]
    if task.get('url'): media.append({'url': task['url'], 'kind': 'video', 'model': task['model']})
    saved = {'version': 1, 'draft': {'spec': spec, 'image': None, 'media': media}, 'messages': [{'role': 'user', 'text': '一朵鲜花，生成网站、图片和5秒宣传视频。'}, {'role': 'assistant', 'text': '鲜花网站与宣传图片已生成。' + ('5秒宣传视频已生成。' if task.get('url') else '视频模型处理中。')}]}
    # The key is read from the project source so evidence uses the same persistence path.
    import re
    source = (ROOT / 'lib/studio-state.ts').read_text(encoding='utf-8')
    key = re.search(r'export const STORAGE_KEY = "([^"]+)"', source).group(1)
    page.evaluate('''async ({key,saved}) => { sessionStorage.clear(); localStorage.clear(); for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name); sessionStorage.setItem(key, JSON.stringify(saved)); }''', {'key': key, 'saved': saved})
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('.project-meta strong')).to_have_text(spec['brand']['name'])
    page.screenshot(path=str(OUT / 'website.png'), full_page=True)
    page.get_by_role('button', name='Poster', exact=True).click()
    pic = page.locator('.generated-media-preview img')
    expect(pic).to_have_attribute('src', image)
    pic.evaluate('(img) => img.decode()')
    page.screenshot(path=str(OUT / 'image.png'), full_page=True)
    duration = None
    if task.get('url'):
        page.get_by_role('button', name='Video', exact=True).click()
        video = page.locator('.generated-media-preview video')
        expect(video).to_have_attribute('src', task['url'])
        video.evaluate('(v) => new Promise((resolve, reject) => { if(v.readyState >= 1) resolve(); else { v.onloadedmetadata=resolve; v.onerror=reject; } })')
        duration = video.evaluate('(v) => v.duration')
        assert 4.5 <= duration <= 6.5, duration
        page.screenshot(path=str(OUT / 'video.png'), full_page=True)
    assert not errors, errors
    result = {'brand': spec['brand']['name'], 'website': True, 'image_loaded': True, 'video_status': task.get('status'), 'video_duration_seconds': duration, 'page_errors': errors}
    (OUT / 'preview-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    browser.close()
