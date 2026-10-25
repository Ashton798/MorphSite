"""Verify image failure never blocks editing, publishing, QR, fallback or uploaded photos."""
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3123'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/api/marketing/**', lambda r: r.fulfill(status=503, json={'error': 'offline'}))
    page.goto(BASE + '/studio?demo=1')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='重新生成主视觉图片')).to_be_visible()
    saved = page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1'))")
    spec = saved['draft']['spec']
    spec['assets'].pop('heroImage', None)
    spec['assets']['gallery'] = []
    spec['theme']['id'] = 'soft-minimal'
    page.route('**/api/brand/generate?stream=1', lambda r: r.fulfill(
        content_type='application/x-ndjson', body=json.dumps({'type': 'result', 'data': {'ok': True, 'spec': spec, 'summary': '网站已生成', 'model': 'test', 'imagePrompt': 'coffee photograph'}}) + '\n'))
    image_requests = []
    def hold_image(route):
        image_requests.append(route)
    page.route('**/api/brand/image', hold_image)
    # Start a new website from an empty workspace.
    page.evaluate("sessionStorage.clear()")
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#studio-prompt').fill('生成咖啡网站')
    page.locator('#studio-prompt').press('Enter')
    expect(page.get_by_role('button', name='主视觉图片生成中…')).to_be_visible()
    expect(page.get_by_role('button', name='发布网站', exact=True)).to_be_enabled()
    expect(page.locator('.image-placeholder').first).to_be_visible()
    # Website editing remains usable while the independent image request is pending.
    edited = json.loads(json.dumps(spec))
    edited['website']['title'] = '并行修改成功'
    edited['website']['sections'][0]['title'] = '并行修改成功'
    page.route('**/api/brand/edit', lambda r: r.fulfill(json={'ok': True, 'spec': edited, 'message': '标题已更新', 'changed': True, 'model': 'test'}))
    page.locator('#studio-prompt').fill('把标题改成并行修改成功')
    page.locator('#studio-prompt').press('Enter')
    expect(page.get_by_role('heading', name='并行修改成功', exact=True)).to_be_visible()
    assert len(image_requests) == 1
    image_requests[0].fulfill(status=429, json={'ok': False, 'error': '当前图片模型免费层配额为 0（HTTP 429）；已使用渐变背景。'})
    expect(page.locator('.hero-task-controls [role=alert]')).to_contain_text('HTTP 429')
    page.get_by_role('button', name='发布网站', exact=True).click()
    expect(page.get_by_role('link', name='打开已发布网站')).to_be_visible()
    href = page.get_by_role('link', name='打开已发布网站').get_attribute('href')
    response = page.request.get(href)
    assert response.status == 200 and '并行修改成功' in response.text()
    qr = page.request.get(BASE + '/api/publish/qr', params={'url': href})
    assert qr.status == 200 and '<svg' in qr.text()
    # Retry only the image and retain the concurrently edited website title.
    page.unroute('**/api/brand/image', hold_image)
    page.route('**/api/brand/image', lambda r: r.fulfill(json={'ok': True, 'url': '/api/brand/media/' + 'd'*32 + '.png', 'model': 'test-image'}))
    page.get_by_role('button', name='重新生成主视觉图片').click()
    expect(page.locator('.hero-task-controls [role=alert]')).to_have_count(0)
    expect(page.get_by_role('heading', name='并行修改成功', exact=True)).to_be_visible()
    expect(page.locator('.brand-image').first).to_have_attribute('src', '/api/brand/media/' + 'd'*32 + '.png')
    # Uploaded photo is used directly with no further provider request.
    page.locator('input[type=file]').set_input_files({'name': 'product.png', 'mimeType': 'image/png', 'buffer': bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082')})
    expect(page.locator('.upload-thumbnail')).to_be_visible()
    page.get_by_role('button', name='重新生成主视觉图片').click()
    expect(page.locator('.hero-task-controls')).to_contain_text('使用上传照片')
    page.screenshot(path='test-results/hero-task-fixed.png', full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: website first, independent image task, gradient, concurrent edit, 429 reason, retry image only, upload, publish snapshot and QR')
