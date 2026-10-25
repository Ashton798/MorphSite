"""Immersive visual/interaction regression. No external AI or paid calls.
Usage: python tests/browser_immersive.py --base-url http://127.0.0.1:3000
"""
import argparse
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:3000")
args = parser.parse_args()
BASE = args.base_url.rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "test-results" / "immersive"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    errors = []
    def instrument(page):
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    def offline(context):
        context.route("**/api/brand/status", lambda route: route.fulfill(json={"enabled": False, "imageEnabled": False, "model": "offline"}))
    context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, reduced_motion="no-preference")
    offline(context)
    page = context.new_page()
    page.set_default_navigation_timeout(60000)
    instrument(page)
    page.goto(BASE, wait_until="networkidle", timeout=60000)
    scene = page.locator(".immersive-hero")
    canvas = page.locator(".particle-canvas")
    expect(scene).to_have_attribute("data-scene-status", "ready")
    page.wait_for_function("Number(document.querySelector('.particle-canvas').dataset.time) > .2")
    assert page.locator("canvas").count() == 1
    assert int(canvas.get_attribute("data-particles")) >= 6000
    assert float(canvas.get_attribute("data-dpr")) <= 1.6
    assert page.locator(".immersive-sticky").bounding_box()["height"] >= 900
    start_time = float(canvas.get_attribute("data-time"))
    page.wait_for_timeout(250)
    assert float(canvas.get_attribute("data-time")) > start_time
    page.screenshot(path=str(OUT / "hero-desktop.png"))
    page.mouse.move(120, 250)
    page.wait_for_timeout(350)
    pointer_before = canvas.get_attribute("data-pointer")
    page.mouse.move(1200, 450)
    page.wait_for_timeout(450)
    assert pointer_before != canvas.get_attribute("data-pointer")
    print("PASS single live WebGL scene / GPU particles / pointer / capped DPR", flush=True)

    # Pause stops time, but scroll remains usable. All target forms are reached.
    page.get_by_role("button", name="暂停场景动画", exact=True).click()
    page.wait_for_timeout(150)
    paused_time = canvas.get_attribute("data-time")
    page.wait_for_timeout(300)
    assert paused_time == canvas.get_attribute("data-time")
    page.get_by_role("button", name="播放场景动画", exact=True).click()
    for index, name in enumerate(["universe", "website", "poster", "video"]):
        page.locator(".hero-morph-rail button").nth(index).click()
        expect(scene).to_have_attribute("data-active-form", name)
        page.wait_for_function("target => Math.abs(Number(document.querySelector('.particle-canvas').dataset.progress) - target) < .04", arg=index)
        page.screenshot(path=str(OUT / f"morph-{name}.png"))
        # A live rendered frame must exist, not a CSS replacement.
        assert canvas.is_visible() and canvas.evaluate("e => e.width > 300 && e.height > 300")
    print("PASS continuous Universe / Website / Poster / Video morph and pause", flush=True)

    page.locator("#remake").scroll_into_view_if_needed()
    # Offscreen rendering sleeps after IntersectionObserver catches up.
    page.wait_for_timeout(300)
    sleeping_time = canvas.get_attribute("data-time")
    page.wait_for_timeout(300)
    assert sleeping_time == canvas.get_attribute("data-time")
    remake = page.locator(".remake-canvas")
    before_title = remake.locator("h2").text_content()
    before_image = remake.locator("img").get_attribute("src")
    expect(remake).to_have_attribute("data-theme", "soft-minimal")
    page.get_by_role("button", name="“Make it more futuristic.”", exact=True).click()
    expect(remake).to_have_attribute("data-theme", "bold-future")
    assert remake.locator("h2").text_content() == before_title
    assert remake.locator("img").get_attribute("src") == before_image
    page.screenshot(path=str(OUT / "remake-future.png"))
    page.get_by_role("button", name="Restore original", exact=True).click()
    expect(remake).to_have_attribute("data-theme", "soft-minimal")
    print("PASS offscreen suspension / real BrandSpec demo / restore", flush=True)

    # Check controls themselves are onscreen; overflow:clip cannot hide a failure.
    for width, height in [(320, 780), (375, 812), (390, 844), (414, 896), (768, 1024), (1280, 800)]:
        page.set_viewport_size({"width": width, "height": height})
        page.goto(BASE, wait_until="networkidle")
        expect(scene).to_have_attribute("data-scene-status", "ready")
        for selector in ["#home-title", "#home-prompt", ".home-composer", ".create-button", ".hero-morph-rail"]:
            box = page.locator(selector).bounding_box()
            assert box["x"] >= -1 and box["x"] + box["width"] <= width + 1, (width, selector, box)
        button = page.locator(".create-button").bounding_box()
        for selector in [".motion-control", ".sound-toggle", ".hero-morph-rail button:last-child"]:
            assert page.locator(selector).evaluate("e => { const r=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }"), (width, "overlapped control", selector)
        assert button["y"] >= 0 and button["y"] + button["height"] <= height, (width, button)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth")
        if width == 390:
            assert int(canvas.get_attribute("data-particles")) <= 12000
            assert float(canvas.get_attribute("data-dpr")) <= 1.25
            page.get_by_role("button", name="打开导航", exact=True).click()
            expect(page.get_by_role("link", name="How It Works", exact=True)).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.get_by_role("button", name="打开导航", exact=True)).to_have_attribute("aria-expanded", "false")
            page.screenshot(path=str(OUT / "hero-mobile.png"))
    page.get_by_role("button", name="Generate", exact=True).click()
    expect(page.locator(".form-error")).to_be_visible()
    expect(page.locator("#home-prompt")).to_be_focused()
    page.get_by_role("button", name="周末咖啡节", exact=False).click()
    expect(page.locator("#home-prompt")).to_have_value("为周末咖啡节设计一个有个性的品牌世界。")
    print("PASS 320–1280px visible controls / first-fold CTA / menu / validation", flush=True)

    # Transport compatibility: explicitly mocked server responses, not an AI claim.
    ai_context = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    ai_page = ai_context.new_page()
    ai_page.set_default_navigation_timeout(60000)
    instrument(ai_page)
    offline(ai_context)
    ai_page.goto(BASE + "/studio?demo=1", wait_until="networkidle")
    expect(ai_page.locator(".website-frame")).to_be_visible()
    baseline = ai_page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1')).draft.spec")
    ai_context.unroute("**/api/brand/status")
    ai_context.route("**/api/brand/status", lambda route: route.fulfill(json={"enabled": True, "imageEnabled": False, "model": "test-transport"}))
    requests = []
    def generate(route):
        requests.append(route.request.post_data_json)
        spec = json.loads(json.dumps(baseline))
        spec["campaign"]["prompt"] = requests[-1]["prompt"]
        spec["campaign"]["status"] = "ready"
        time.sleep(.25)
        payload = {"spec": spec, "summary": "Transport fixture; not real AI output."}
        route.fulfill(content_type="application/x-ndjson", body=json.dumps({"type": "result", "data": payload}) + "\n")
    ai_context.route("**/api/brand/generate*", generate)
    ai_page.goto(BASE, wait_until="networkidle")
    ai_page.locator("#home-prompt").fill("一个独立书店，举办夜读活动")
    ai_page.get_by_role("button", name="Generate", exact=True).click()
    expect(ai_page.locator(".website-frame")).to_be_visible(timeout=15000)
    assert requests[0]["prompt"] == "一个独立书店，举办夜读活动"
    assert ai_page.locator("canvas").count() == 0
    def edit(route):
        body = route.request.post_data_json
        body["spec"]["website"]["title"] = "夜读书店"
        body["spec"]["website"]["sections"][0]["title"] = "夜读书店"
        body["spec"]["poster"]["title"] = "夜读书店"
        route.fulfill(json={"spec": body["spec"], "message": "Transport edit fixture", "changed": True})
    ai_context.route("**/api/brand/edit", edit)
    ai_page.locator("#studio-prompt").fill("把标题改成夜读书店")
    ai_page.get_by_role("button", name="应用修改", exact=True).click()
    expect(ai_page.locator(".hero h2")).to_have_text("夜读书店")
    ai_page.get_by_role("button", name="撤销修改", exact=True).click()
    expect(ai_page.locator(".hero h2")).to_have_text(baseline["website"]["title"])
    expect(ai_page.get_by_role("button", name="发布 · 尚未接入", exact=True)).to_be_disabled()
    print("PASS AI transport handoff / edits / undo (mocked, no provider spend)", flush=True)

    reduced_context = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    reduced_page = reduced_context.new_page(); instrument(reduced_page)
    reduced_page.goto(BASE, wait_until="networkidle")
    expect(reduced_page.locator(".immersive-hero")).to_have_attribute("data-scene-status", "ready")
    expect(reduced_page.get_by_role("button", name="已启用减少动态效果", exact=True)).to_be_disabled()
    reduced_page.wait_for_timeout(100)
    t = reduced_page.locator("canvas").get_attribute("data-time")
    reduced_page.wait_for_timeout(300)
    assert reduced_page.locator("canvas").get_attribute("data-time") == t
    reduced_page.locator(".hero-morph-rail button").nth(1).click()
    reduced_page.wait_for_function("Number(document.querySelector('canvas').dataset.progress) === 1")
    print("PASS reduced-motion static time and discrete scroll states", flush=True)

    fallback_context = browser.new_context(viewport={"width": 390, "height": 844})
    fallback_context.add_init_script("""const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
        return original.call(this, type, ...args);
      };""")
    offline(fallback_context)
    fallback_page = fallback_context.new_page(); instrument(fallback_page)
    fallback_page.goto(BASE, wait_until="networkidle")
    expect(fallback_page.locator(".immersive-hero")).to_have_attribute("data-scene-status", "fallback")
    expect(fallback_page.locator(".scene-fallback-note")).to_be_visible()
    expect(fallback_page.locator(".hero-morph-rail")).not_to_be_visible()
    assert fallback_page.locator(".immersive-hero").bounding_box()["height"] <= 845
    fallback_page.locator("#home-prompt").fill("No WebGL, still a working studio")
    fallback_page.get_by_role("button", name="Generate", exact=True).click()
    expect(fallback_page.locator(".website-frame")).to_be_visible()
    print("PASS WebGL unavailable: static fallback and functional input", flush=True)
    reduced_page.evaluate("document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    expect(reduced_page.locator('.immersive-hero')).to_have_attribute('data-scene-status', 'fallback')
    print("PASS lost WebGL context switches to static fallback", flush=True)
    assert not errors, errors
    print("PASS zero console / hydration / shader errors", flush=True)
    browser.close()
