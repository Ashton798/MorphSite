"""Website SaaS template acceptance. No paid AI calls; status and all mutation endpoints are intercepted.
Usage: python tests/browser_saas.py --base-url http://127.0.0.1:3101
"""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import re

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:3101")
BASE = parser.parse_args().base_url.rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "test-results" / "saas"
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.route("**/api/brand/status", lambda route: route.fulfill(json={"enabled": False, "imageEnabled": False, "model": "offline"}))
    context.route("**/api/brand/generate**", lambda route: route.fulfill(status=503, json={"ok": False, "error": "Disabled by test"}))
    context.route("**/api/brand/edit**", lambda route: route.fulfill(status=503, json={"ok": False, "error": "Disabled by test"}))
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("response", lambda response: errors.append(f"chunk {response.status} {response.url}") if "/_next/static/" in response.url and response.status >= 400 else None)

    def goto(path):
        response = page.goto(BASE + path, wait_until="networkidle", timeout=60000)
        assert response.status == 200

    goto("/studio")
    hero = page.locator(".saas-video-hero")
    expect(hero).to_be_visible()
    expect(hero.locator("h2 span").nth(0)).to_have_text("Accelerate Your")
    expect(hero.locator("h2 span").nth(1)).to_have_text("Revenue Growth Now")
    expect(hero.locator(".saas-hero-sub")).to_have_text("Drive your funnel forward with clever workflows, analytics, and seamless lead management.")
    expect(page.get_by_role("button", name="撤销修改", exact=True)).to_be_disabled()
    assert page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1')).draft.spec") is None
    assert "Geist Sans" in hero.evaluate("e=>getComputedStyle(e).fontFamily")
    assert hero.locator(".liquid-glass").first.evaluate("e=>getComputedStyle(e).backdropFilter") == "blur(4px)"
    assert all(value.strip() == "exclude" for value in hero.locator(".liquid-glass").first.evaluate("e=>getComputedStyle(e,'::before').maskComposite").split(","))
    expect(hero.locator(".saas-proof-brand")).to_have_count(12)
    print("PASS default APEX template + exact copy + scoped fonts/glass + no draft mutation")

    page.wait_for_function("document.querySelector('.saas-hero-video').readyState >= 2 && !document.querySelector('.saas-hero-video').paused", timeout=60000)
    first = hero.locator("video").evaluate("v=>v.currentTime")
    transform = hero.locator(".saas-marquee-track").evaluate("e=>getComputedStyle(e).transform")
    page.wait_for_timeout(700)
    assert hero.locator("video").evaluate("v=>v.currentTime") > first
    assert hero.locator(".saas-marquee-track").evaluate("e=>getComputedStyle(e).transform") != transform
    assert hero.locator("video").evaluate("v=>v.muted && v.loop && v.autoplay && v.playsInline")
    assert hero.locator("video").evaluate("v=>getComputedStyle(v).pointerEvents") == "none"
    # The two equal groups make the exact -50% translation a seamless loop.
    groups = hero.locator(".saas-marquee-group")
    assert abs(groups.nth(0).bounding_box()["width"] - groups.nth(1).bounding_box()["width"]) < .1
    page.screenshot(path=str(OUT / "studio-default.png"))
    hero.screenshot(path=str(OUT / "hero-default.png"))
    page.get_by_role("button", name="暂停模板背景与品牌滚动", exact=True).click()
    expect(hero.locator("video")).to_have_js_property("paused", True)
    assert hero.locator(".saas-marquee-track").evaluate("e=>getComputedStyle(e).animationPlayState") == "paused"
    page.get_by_role("button", name="播放模板背景与品牌滚动", exact=True).click()
    print("PASS actual remote MP4 autoplay/loop/mute + marquee loop geometry + pause control")

    # Placeholder buttons never claim to register an account or leave Studio.
    page.get_by_role("link", name="Start Free Right Now", exact=True).click()
    expect(hero.locator('[role="status"]')).to_contain_text("尚未接入注册")
    assert page.url == BASE + "/studio"

    for width in [320, 390, 768, 1280]:
        page.set_viewport_size({"width": width, "height": 1000})
        hero.scroll_into_view_if_needed()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        assert page.locator(".preview-document").evaluate("e=>e.scrollWidth <= e.clientWidth + 1"), width
        assert hero.evaluate("e=>e.scrollWidth <= e.clientWidth + 1"), width
        if width == 390:
            hero.screenshot(path=str(OUT / "hero-mobile.png"))
    print("PASS 320 / 390 / 768 / 1280 container and page responsiveness")

    page.set_viewport_size({"width": 1440, "height": 1000})
    page.locator(".demo-brand-button").click()
    expect(page.locator(".website-frame")).to_have_attribute("data-theme", "noir-luxury")
    expect(hero.locator("h2")).to_have_text("Coffee for the in-between hours.")
    expect(hero.locator(".saas-hero-logo strong")).to_have_text("VOID")
    expect(hero.locator(".saas-button-primary")).to_have_text("Find your ritual")
    assert page.locator(".site-section").count() == 6
    original = page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1')).draft.spec")
    page.get_by_label("品牌创意指令", exact=True).fill("把标题改成全新的品牌标题")
    page.get_by_label("品牌创意指令", exact=True).press("Enter")
    expect(hero.locator("h2")).to_have_text("全新的品牌标题")
    page.get_by_role("button", name="撤销修改", exact=True).click()
    expect(hero.locator("h2")).to_have_text(original["website"]["title"])
    assert page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1')).draft.spec") == original
    for theme in ["soft-minimal", "bold-future"]:
        page.get_by_label("品牌主题", exact=True).select_option(theme)
        expect(page.locator(".saas-video-hero")).to_have_count(0)
        expect(page.locator(".hero-product")).to_be_visible()
        expect(page.locator(".website-frame")).to_have_attribute("data-theme", theme)
    page.get_by_label("品牌主题", exact=True).select_option("noir-luxury")
    expect(hero).to_be_visible()
    page.get_by_role("button", name="移动端预览", exact=True).click()
    assert page.locator(".preview-document").bounding_box()["width"] == 390
    assert page.locator(".saas-hero-nav").evaluate("e=>getComputedStyle(e).flexWrap") == "wrap"
    page.get_by_role("button", name="桌面端预览", exact=True).click()
    print("PASS real BrandSpec bindings + title edit/undo + theme isolation + 390px preview")

    for tab, label in [("Poster", "海报基础预览"), ("Video", "视频分镜预览")]:
        page.get_by_role("button", name=tab, exact=True).click()
        expect(page.get_by_label(label, exact=True)).to_be_visible()
        expect(page.locator(".saas-video-hero")).to_have_count(0)
        expect(page.locator("video")).to_have_count(0)
    goto("/")
    expect(page.locator("#home-title")).to_be_visible()
    expect(page.locator(".saas-video-hero")).to_have_count(0)
    print("PASS Poster / Video / homepage unchanged; background video unmounted on tab change")

    context.route("**/__morphsite_video_failure__.mp4", lambda route: route.fulfill(status=200, content_type="video/mp4", body=b"not a decodable video"))
    context.route("**/hf_20260309_042944_*.mp4", lambda route: route.fulfill(status=200, content_type="video/mp4", body=b"not a decodable video"))
    page.evaluate("sessionStorage.clear()")
    goto("/studio")
    # Force an actual media error after the previous successful cache entry.
    page.evaluate("""() => {
      const video = document.querySelector('.saas-hero-video');
      video.src = '/__morphsite_video_failure__.mp4';
      video.load();
    }""")
    expect(hero).to_have_attribute("data-video-state", "fallback", timeout=15000)
    assert hero.locator(".saas-video-fallback").evaluate("e=>getComputedStyle(e).backgroundImage") != "none"
    assert hero.locator("video").evaluate("e=>getComputedStyle(e).visibility") == "hidden"
    expect(hero.locator("h2")).to_be_visible()
    hero.screenshot(path=str(OUT / "hero-fallback.png"))
    page.emulate_media(reduced_motion="reduce")
    expect(page.get_by_role("button", name="模板已启用减少动态效果", exact=True)).to_be_disabled()
    assert hero.locator(".saas-marquee-track").evaluate("e=>getComputedStyle(e).animationName") == "none"
    assert hero.locator("video").evaluate("e=>e.paused")
    print("PASS video-error gradient fallback + reduced-motion video/marquee pause")
    assert not errors, errors
    print("PASS zero browser errors or missing static chunks")
    browser.close()
