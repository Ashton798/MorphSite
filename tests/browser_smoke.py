"""Browser acceptance tests. Run against an already running MorphSite server.
Usage: python tests/browser_smoke.py --base-url http://127.0.0.1:3000
Requirements: pip install playwright; python -m playwright install chromium
"""
import argparse
import json
import re
import struct
import zlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:3000")
args = parser.parse_args()
BASE = args.base_url.rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "test-results"
OUT.mkdir(exist_ok=True)

# A valid raster product image, generated locally (no external test fixture).
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
raw = b"".join(b"\x00" + bytes([90, 140, 220]) * 32 for _ in range(32))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 32, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
fixture = {"name": "product.png", "mimeType": "image/png", "buffer": png}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    # Keep this suite deterministic even against a live, AI-enabled dev server.
    context.route("**/api/brand/status", lambda route: route.fulfill(json={"enabled": False, "imageEnabled": False, "model": "offline"}))
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def goto(path):
        response = page.goto(BASE + path, wait_until="networkidle", timeout=60000)
        assert response.status == 200

    def snapshot(name):
        page.screenshot(path=str(OUT / name), full_page=True)

    def saved_spec():
        return page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1')).draft.spec")

    goto("/")
    expect(page.locator("#home-title")).to_be_visible()
    # Kept as an accessible name for existing demo scripts and keyboard users.
    expect(page.get_by_role("button", name="Generate", exact=True)).to_be_visible()
    snapshot("home-desktop.png")
    page.get_by_label("一句话描述你的品牌", exact=True).fill("一家独立咖啡店，做一场周末咖啡节")
    page.get_by_label("上传产品图片", exact=True).set_input_files(fixture)
    expect(page.get_by_alt_text("待生成的产品图片")).to_be_visible()
    # Kept as an accessible name for existing AI transport scripts and keyboard users.
    page.get_by_role("button", name="Generate", exact=True).click()
    expect(page.locator(".website-frame")).to_be_visible()
    expect(page.locator(".showcase .brand-image")).to_have_attribute("src", re.compile(r"^data:image/"))
    assert saved_spec()["campaign"]["prompt"] == "一家独立咖啡店，做一场周末咖啡节"
    print("PASS home prompt + image handoff")

    # Use a fresh tab context for the true empty state.
    context.clear_cookies()
    page.evaluate("sessionStorage.clear()")
    goto("/studio")
    expect(page.locator('.saas-video-hero')).to_be_visible()
    expect(page.locator('.saas-template-caption')).to_contain_text('尚未生成作品')
    expect(page.get_by_role("button", name="撤销修改", exact=True)).to_be_disabled()
    page.locator(".demo-brand-button").click()
    expect(page.locator(".website-frame")).to_be_visible()
    assert page.locator(".site-section").count() == 6
    original = saved_spec()
    snapshot("studio-noir-desktop.png")
    print("PASS empty state + demo generation")

    # Exercise actual text submission, not only the shortcut buttons.
    prompt = page.get_by_label("品牌创意指令", exact=True)
    prompt.fill("改成粉色")
    page.get_by_role("button", name="应用修改", exact=True).click()
    expect(page.locator(".website-frame")).to_have_attribute("data-theme", "soft-minimal")
    assert page.locator(".website-frame").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(255, 246, 244)"
    pink = saved_spec()
    for key in ["brand", "campaign", "assets", "website", "poster", "video"]:
        assert pink[key] == original[key]
    prompt.fill("把标题改成周末咖啡节")
    prompt.press("Enter")
    expect(page.locator(".hero h2")).to_have_text("周末咖啡节")
    page.get_by_role("button", name="撤销修改", exact=True).click()
    expect(page.locator(".hero h2")).to_have_text(original["website"]["title"])
    assert saved_spec() == pink
    print("PASS pink tokens + title update + lossless undo")

    page.get_by_label("品牌主题", exact=True).select_option("bold-future")
    expect(page.locator(".website-frame")).to_have_attribute("data-theme", "bold-future")
    page.get_by_label("品牌主题", exact=True).select_option("noir-luxury")
    expect(page.locator(".website-frame")).to_have_attribute("data-theme", "noir-luxury")
    page.get_by_role("button", name="移动端预览", exact=True).click()
    expect(page.locator(".preview-document.mobile")).to_be_visible()
    expect(page.locator(".preview-document.mobile")).to_have_css("width", "390px")
    assert page.locator(".preview-document.mobile").bounding_box()["width"] <= 390
    assert page.locator(".site-section.hero").evaluate("e => getComputedStyle(e).gridTemplateColumns.split(' ').length") == 1
    snapshot("studio-mobile-preview.png")
    page.get_by_role("button", name="桌面端预览", exact=True).click()
    expect(page.locator(".preview-document.desktop")).to_be_visible()
    page.wait_for_function("document.querySelector('.preview-document.desktop')?.getBoundingClientRect().width > 600")
    assert page.locator(".preview-document.desktop").bounding_box()["width"] > 600
    print("PASS three themes + real responsive preview")

    before_upload = saved_spec()
    page.get_by_label("上传产品图片", exact=True).set_input_files(fixture)
    expect(page.locator(".showcase .brand-image")).to_have_attribute("src", re.compile(r"^data:image/"))
    with_image = saved_spec()
    assert with_image["assets"]["gallery"][0] == with_image["assets"]["heroImage"]
    page.get_by_role("button", name="Poster", exact=True).click()
    expect(page.get_by_label("海报基础预览", exact=True)).to_be_visible()
    expect(page.locator(".poster-visual img")).to_have_attribute("src", with_image["assets"]["heroImage"])
    page.get_by_label("品牌主题", exact=True).select_option("soft-minimal")
    expect(page.locator(".poster-preview")).to_have_attribute("data-theme", "soft-minimal")
    snapshot("poster-pink.png")
    page.get_by_role("button", name="Video", exact=True).click()
    expect(page.get_by_label("视频分镜预览", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="渲染视频 · 尚未接入", exact=True)).to_be_disabled()
    page.locator(".scene-row").nth(1).click()
    expect(page.locator(".storyboard-screen h3")).to_have_text("The pour")
    snapshot("storyboard.png")
    page.get_by_role("button", name="撤销修改", exact=True).click()  # theme
    page.get_by_role("button", name="撤销修改", exact=True).click()  # upload
    assert saved_spec() == before_upload
    print("PASS upload across outputs + undo + storyboard selection")

    page.get_by_role("button", name="Website", exact=True).click()
    page.get_by_label("上传产品图片", exact=True).set_input_files({"name": "evil.svg", "mimeType": "image/svg+xml", "buffer": b"<svg/>"})
    expect(page.locator(".workspace-alert")).to_contain_text("不支持 SVG")
    page.get_by_role("button", name="知道了", exact=True).click()
    page.get_by_label("上传产品图片", exact=True).set_input_files({"name": "broken.png", "mimeType": "image/png", "buffer": b"not an image"})
    expect(page.locator(".workspace-alert")).to_contain_text("无法解码")
    page.get_by_role("button", name="知道了", exact=True).click()
    before_unknown = saved_spec()
    prompt.fill("给我生成真正的电影")
    prompt.press("Enter")
    expect(page.get_by_role("log")).to_contain_text("暂不理解")
    assert saved_spec() == before_unknown
    print("PASS invalid upload + unsupported prompt feedback")

    with page.expect_download() as download_info:
        page.get_by_role("button", name="导出 BrandSpec JSON", exact=True).click()
    download = download_info.value
    export_path = OUT / "exported-brand-spec.json"
    download.save_as(str(export_path))
    assert json.loads(export_path.read_text(encoding="utf-8")) == saved_spec()
    page.reload(wait_until="networkidle")
    expect(page.locator(".website-frame")).to_be_visible()
    assert saved_spec() == before_unknown
    expect(page.get_by_role("button", name="撤销修改", exact=True)).to_be_disabled()
    print("PASS JSON export + refresh persistence")

    for width in [320, 375, 390, 414, 768, 1280]:
        page.set_viewport_size({"width": width, "height": 900})
        for path in ["/", "/studio"]:
            goto(path)
            if path == "/studio":
                expect(page.locator(".website-frame")).to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"document overflow {width} {path}"
            assert page.evaluate("document.body.scrollWidth <= innerWidth"), f"body overflow {width} {path}"
            if path == "/studio":
                assert page.locator(".preview-document").evaluate("e => e.scrollWidth <= e.clientWidth + 1"), f"preview overflow {width}"
            if width == 390:
                snapshot("home-mobile.png" if path == "/" else "studio-mobile.png")
    print("PASS responsive widths: 320, 375, 390, 414, 768, 1280")
    # Check the primary action fits an actual small laptop, not only a tall screenshot.
    page.set_viewport_size({"width": 1280, "height": 800})
    goto("/")
    action_box = page.get_by_role("button", name="Generate", exact=True).bounding_box()
    assert action_box["y"] + action_box["height"] <= 800, "primary CTA below laptop fold"
    # Reduced motion is not the only path: exercise the finite art animation too.
    page.emulate_media(reduced_motion="no-preference")
    page.set_viewport_size({"width": 320, "height": 900})
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    assert page.evaluate("document.body.scrollWidth <= innerWidth"), "animated art overflows"
    page.locator("#work").scroll_into_view_if_needed()
    expect(page.locator("#work h2")).to_be_visible()
    print("PASS laptop CTA + non-reduced motion")
    assert not errors, errors
    print("PASS zero browser errors")
    browser.close()
