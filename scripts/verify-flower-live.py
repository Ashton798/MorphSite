"""One real flower campaign through the browser; saves evidence without credentials."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'test-results' / 'flower-live'
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors, responses = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def record(response):
        if '/api/brand/' in response.url:
            entry = {'url': response.url, 'status': response.status}
            if '/generate' not in response.url:
                try: entry['body'] = response.json()
                except Exception: pass
            responses.append(entry)
            (OUT / 'responses.json').write_text(json.dumps(responses, ensure_ascii=False, indent=2), encoding='utf-8')
    page.on('response', record)
    try:
        page.goto('http://localhost:3000/studio')
        page.wait_for_load_state('networkidle')
        page.locator('#studio-prompt').fill('一朵鲜花：粉色玫瑰，清晨露珠，奶油白与浅粉色，精品花店。生成网站、一张鲜花宣传图片和5秒宣传视频。')
        page.locator('#studio-prompt').press('Enter')
        page.wait_for_function('''() => document.querySelector('.generated-media-preview video') || (document.querySelector('.workspace-alert') && !document.querySelector('#studio-prompt').disabled)''', timeout=780000)
        page.screenshot(path=str(OUT / 'result.png'), full_page=True)
        videos = page.locator('.generated-media-preview video')
        result = {'video': videos.get_attribute('src') if videos.count() else None, 'errors': errors, 'alerts': page.locator('.workspace-alert').all_text_contents()}
        page.get_by_role('button', name='Website', exact=True).click()
        page.screenshot(path=str(OUT / 'website.png'), full_page=True)
        result['website_text'] = page.locator('.preview-wrap').inner_text()[:1500]
        (OUT / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as e:
        page.screenshot(path=str(OUT / 'failure.png'), full_page=True)
        (OUT / 'failure.json').write_text(json.dumps({'error': str(e), 'page_errors': errors}, ensure_ascii=False), encoding='utf-8')
        raise
    finally:
        browser.close()
