"""Live AI acceptance test: real provider calls through the route handlers.

Usage:
  python tests/browser_ai.py --base-url http://127.0.0.1:3211
Requirements: pip install playwright; python -m playwright install chromium;
              a server started with MORPHSITE_AI=on and a real AI_API_KEY.
This spends provider credits (2 generations + 2 edits) and takes ~2 minutes.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:3000")
args = parser.parse_args()
BASE = args.base_url.rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "test-results"
OUT.mkdir(exist_ok=True)
BRIEF = "一家独立咖啡店，想做一场不一样的周末咖啡节"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def saved_spec():
        return page.evaluate("JSON.parse(sessionStorage.getItem('morphsite.workspace.v1')).draft.spec")

    # The workspace must report live AI, not the offline demo.
    page.goto(BASE + "/studio", wait_until="networkidle", timeout=60000)
    expect(page.locator(".mode-badge")).to_have_text("AI")
    expect(page.locator(".nav-demo")).to_contain_text("AI CONNECTED")
    print("PASS workspace detects live AI")

    # Home brief -> real generation -> rendered brand world.
    page.goto(BASE + "/", wait_until="networkidle", timeout=60000)
    page.get_by_label("一句话描述你的品牌", exact=True).fill(BRIEF)
    page.get_by_role("button", name="Generate", exact=True).click()
    expect(page.locator(".studio-sidebar")).to_be_visible()
    expect(page.locator(".chat-message.pending")).to_be_visible(timeout=15000)
    expect(page.locator(".website-frame")).to_be_visible(timeout=180000)
    expect(page.locator(".chat-message.pending")).to_have_count(0, timeout=180000)
    spec = saved_spec()
    assert spec["campaign"]["prompt"] == BRIEF, spec["campaign"]["prompt"]
    assert spec["brand"]["name"] != "VOID COFFEE", "fell back to the demo brand"
    assert len(spec["website"]["sections"]) == 6
    assert spec["website"]["sections"][0]["title"] == spec["website"]["title"]
    assert spec["assets"].get("heroImage", "").startswith(("https://", "data:image/")), spec["assets"].get("heroImage")
    print(f"PASS live generation: {spec['brand']['name']} / {spec['website']['title']} / {spec['theme']['id']}")
    page.screenshot(path=str(OUT / "ai-studio-website.png"), full_page=False)

    # A real edit keeps unrelated fields and stays undoable.
    before = spec
    page.get_by_label("品牌创意指令", exact=True).fill("改成粉色")
    page.get_by_role("button", name="应用修改", exact=True).click()
    expect(page.locator(".website-frame")).to_have_attribute("data-theme", "soft-minimal", timeout=180000)
    pink = saved_spec()
    for key in ["brand", "campaign", "assets", "website", "poster", "video"]:
        assert pink[key] == before[key], f"edit touched {key}"
    print("PASS live theme edit + untouched fields")

    page.get_by_label("品牌创意指令", exact=True).fill("故事区块改成：我们只做当季花材，每周三清晨从近郊花田直接运回。")
    page.get_by_role("button", name="应用修改", exact=True).click()
    page.wait_for_function("!document.querySelector('.chat-message.pending')", timeout=180000)
    edited = saved_spec()
    assert edited["website"]["sections"][2]["body"] != pink["website"]["sections"][2]["body"], "story body was not updated"
    assert edited["theme"]["id"] == "soft-minimal"
    page.get_by_role("button", name="撤销修改", exact=True).click()
    expect(page.locator(".website-frame")).to_have_attribute("data-theme", "soft-minimal")
    assert saved_spec() == pink
    print("PASS live content edit + lossless undo")

    # Unsupported requests must not consume undo history or change the document.
    before_unknown = saved_spec()
    page.get_by_label("品牌创意指令", exact=True).fill("帮我把它发布到互联网并收订阅费")
    page.get_by_role("button", name="应用修改", exact=True).click()
    page.wait_for_function("!document.querySelector('.chat-message.pending')", timeout=180000)
    expect(page.get_by_role("log")).to_contain_text("发布")
    assert saved_spec() == before_unknown
    print("PASS unsupported request is refused without touching the document")

    page.get_by_role("button", name="Poster", exact=True).click()
    expect(page.get_by_label("海报基础预览", exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / "ai-studio-poster.png"), full_page=False)
    assert not errors, errors
    print("PASS zero browser errors")
    browser.close()
