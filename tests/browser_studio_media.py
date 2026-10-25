"""Exercise the original Studio chat with mocked provider responses (no paid calls)."""
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3123'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/brand/status', lambda route: route.fulfill(json={
        'ok': True, 'enabled': True, 'imageEnabled': True, 'videoEnabled': True,
        'model': 'test-chat', 'imageModel': 'test-image', 'videoModel': 'test-video', 'provider': 'gemini'}))
    page.route('**/api/marketing/**', lambda route: route.fulfill(status=503, json={'error': 'offline'}))
    image_url = '/api/brand/media/' + 'a' * 32 + '.png'
    video_url = '/api/brand/media/' + 'b' * 32 + '.mp4'
    page.route('**/api/brand/image', lambda route: route.fulfill(json={'ok': True, 'url': image_url, 'model': 'test-image'}))
    page.route('**/api/brand/video', lambda route: route.fulfill(json={'ok': True, 'url': video_url, 'model': 'test-video'}))
    page.goto(BASE + '/studio')
    page.wait_for_load_state('networkidle')
    page.locator('#studio-prompt').fill('为产品生成一张宣传图')
    expect(page.get_by_role('button', name='生成品牌', exact=True)).to_be_enabled()
    page.locator('#studio-prompt').press('Enter')
    expect(page.locator('.generated-media-preview img')).to_have_attribute('src', image_url)
    expect(page.get_by_role('link', name='下载宣传图')).to_be_visible()
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='Poster', exact=True).click()
    expect(page.locator('.generated-media-preview img')).to_be_visible()
    page.locator('#studio-prompt').fill('为产品生成宣传视频')
    page.locator('#studio-prompt').press('Enter')
    expect(page.locator('.generated-media-preview video')).to_have_attribute('src', video_url)
    expect(page.get_by_role('link', name='下载视频')).to_be_visible()
    page.get_by_role('button', name='撤销修改', exact=True).click()
    expect(page.locator('.generated-media-preview video')).to_have_count(0)
    page.get_by_role('button', name='Poster', exact=True).click()
    expect(page.locator('.generated-media-preview img')).to_be_visible()
    page.get_by_role('button', name='Website', exact=True).click()
    expect(page.locator('.generated-media-preview')).to_have_count(0)
    page.route('**/api/brand/video', lambda route: route.fulfill(status=503, json={'error': '视频模型未配置'}))
    page.locator('#studio-prompt').fill('生成视频')
    page.locator('#studio-prompt').press('Enter')
    expect(page.locator('.workspace-alert')).to_contain_text('视频模型未配置')
    page.get_by_role('button', name='Poster', exact=True).click()
    expect(page.locator('.generated-media-preview img')).to_be_visible()
    page.screenshot(path='test-results/studio-media-chat.png', full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: original chat, image/video tabs, downloads, restore, undo, failure preservation, no page errors')
