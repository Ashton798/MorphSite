from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for width,height,label in [(1440,1000,'desktop'),(390,844,'mobile')]:
  page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce');errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://localhost:3000');page.wait_for_load_state('networkidle')
  expect(page.locator('.ambient-particles')).to_be_visible()
  page.locator('#work').scroll_into_view_if_needed()
  for image in page.locator('.creation-visual img').all():image.evaluate('(image)=>image.decode()')
  page.screenshot(path=f'test-results/home-art-{label}.png',full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
  page.locator('#remake').scroll_into_view_if_needed()
  page.locator('.remake-prompt').click()
  expect(page.locator('.remake-stage')).to_have_attribute('data-remade','true')
  assert not errors,errors
  print('PASS',label,'images, particles, responsive layout and remake interaction')
  page.close()
 browser.close()
