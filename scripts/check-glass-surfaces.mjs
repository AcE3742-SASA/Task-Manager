// Run against preview:demo. Fresh local-only data; never touches a real account.
import assert from 'node:assert/strict'
const engine = process.env.THEME_QA_BROWSER || 'chromium'
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) })
const context = await browser.newContext({ viewport: { width: 320, height: 844 } })
const page = await context.newPage()
const base = process.env.DEMO_URL || 'http://127.0.0.1:4183'
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort())

async function go(path) {
  await page.goto(base + path)
  await page.waitForSelector('.nav')
  await page.evaluate(() => document.fonts.ready)
  // WebKit cancels a pending lazy import when the next full navigation starts.
  if (await page.evaluate(() => document.documentElement.dataset.themeStyle === 'glassmorphism' && !matchMedia('(prefers-reduced-transparency: reduce)').matches)) {
    await page.waitForSelector('.appbar [data-liquid-glass] feImage[href^="data:"]', { state: 'attached' })
  }
  assert.equal(await page.locator('.screenbody').evaluate(e => e.scrollWidth > e.clientWidth), false, `${path}: horizontal overflow`)
}
async function appearance(themeStyle, theme) {
  await page.evaluate(({ themeStyle, theme }) => {
    const key = 'sasa-demo-data-v1', data = JSON.parse(localStorage.getItem(key))
    Object.assign(data['users/local-demo/settings/app'], { themeStyle, theme })
    localStorage.setItem(key, JSON.stringify(data))
  }, { themeStyle, theme })
  await go('/')
  await page.waitForFunction(style => document.documentElement.dataset.themeStyle === style, themeStyle)
}
async function checkTaskColors() {
  const failures = await page.locator('.task').evaluateAll(rows => {
    const data = JSON.parse(localStorage.getItem('sasa-demo-data-v1'))
    const tasks = Object.entries(data).filter(([k]) => k.includes('/tasks/')).map(([, v]) => v)
    return rows.flatMap(row => {
      const task = tasks.find(t => t.title === row.querySelector('.txt b').textContent)
      const subject = data['users/local-demo/subjects/' + task.subjectId]
      const badge = row.querySelector('.subject-badge'), style = getComputedStyle(badge)
      const probe = document.createElement('span'); probe.style.color = subject.color; document.body.append(probe)
      const expected = getComputedStyle(probe).color; probe.remove()
      return style.backgroundColor !== expected || style.opacity !== '1'
        || getComputedStyle(badge.querySelector('svg')).stroke !== style.color ? [task.title] : []
    })
  })
  assert.deepEqual(failures, [], 'subject color must survive urgent, complete and every theme')
}
async function checkMonth() {
  const [year, month] = (await page.locator('.calhead b').textContent()).split('.').map(Number)
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  assert.deepEqual(await page.locator('.month .day').allTextContents(), Array.from({ length: count }, (_, i) => String(i + 1)), 'only the displayed month is selectable')
  const weekStartsOn = await page.evaluate(() => JSON.parse(localStorage.getItem('sasa-demo-data-v1'))['users/local-demo/settings/app'].weekStartsOn)
  const column = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() - weekStartsOn + 7) % 7
  const first = await page.locator('.month .day').first().boundingBox()
  const heading = await page.locator('.month .wd').nth(column).boundingBox()
  assert(Math.abs(first.x - heading.x) < 1, 'the first day must keep its weekday column')
}

try {
  await go('/')
  for (const style of ['classic', 'neumorphism', 'neo-brutalism', 'glassmorphism']) {
    for (const mode of ['light', 'dark']) {
      await appearance(style, mode)
      await checkTaskColors()
      assert.notEqual(await page.locator('.nav a.on').evaluate(e => getComputedStyle(e).backgroundColor), await page.locator('.nav a.mid').evaluate(e => getComputedStyle(e).backgroundColor), 'NEW must be distinct from the selected tab')
      await go('/task/demo-0')
      assert.equal(await page.locator('.chip .subject-badge').count(), 3)
      assert.equal(await page.locator('.chip.on .subject-badge').count(), 1)
      await go('/subjects')
      assert.equal(await page.locator('.row .subject-badge').count(), 3)
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await appearance('glassmorphism', 'light')
  await page.waitForSelector('.dock [data-liquid-glass]', { state: 'attached' })
  await page.locator('.dockbar').click()
  assert.equal(await page.locator('.docklist').count(), 0)
  assert.equal(await page.locator('.dockbar').evaluate(e => getComputedStyle(e).borderBottomWidth), '0px')
  await page.locator('.dockbar').click()
  await page.locator('.dtask .dbox').click()
  await page.waitForSelector('.dtask.done')
  await page.locator('.dtask .dbox').click()
  await page.waitForSelector('.dtask:not(.done)')
  await page.locator('.dockbar').click()

  await go('/calendar')
  assert.equal(await page.locator('.cal [data-liquid-glass]').count(), 0, 'calendar has no outer glass frame')
  await checkMonth()
  for (const direction of [0, 1, 1, 0]) {
    await page.locator('.calhead .step').nth(direction).click()
    await checkMonth()
  }
  for (const tab of await page.locator('.nav a:is(.on, .mid)').all()) {
    assert(await tab.evaluate(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).borderRadius === '0px' && getComputedStyle(e, '::before').content === 'none'), 'navigation highlight fills its cell')
  }
  const reflection = page.locator('.appbar > .liquid-surface')
  const before = await reflection.evaluate(e => getComputedStyle(e, '::after').backgroundImage)
  await page.mouse.move(320, 35)
  assert.equal(await reflection.evaluate(e => getComputedStyle(e, '::after').backgroundImage), before, 'reflection does not follow the pointer')
  const day = page.locator('.month .day').nth(6)
  await day.click()
  assert.equal(await day.getAttribute('aria-pressed'), 'true')
  await day.dblclick()
  await page.waitForURL('**/new?due=*')
  const pickedDate = new URL(page.url()).searchParams.get('due')
  assert.equal((await page.locator('input[type="datetime-local"]').inputValue()).slice(0, 10), pickedDate)

  await go('/calendar')
  await page.locator('.seg button').nth(1).click()
  const touchDay = page.locator('.week .d').nth(2)
  for (let i = 0; i < 2; i++) await touchDay.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, button: 0, bubbles: true })
  await page.waitForURL('**/new?due=*')

  await go('/task/demo-0')
  await page.waitForSelector('.liquid-input [data-liquid-glass]', { state: 'attached' })
  await page.locator('input.inp').first().fill('유리 입력창 수정 검증')
  await page.locator('.chip').filter({ hasText: '인공지능' }).click()
  await page.locator('input[type="datetime-local"]').fill('2026-10-02T19:30')
  await page.locator('textarea').fill('한글 English 123 — 입력·선택·저장')
  assert.equal(await page.locator('textarea').evaluate(e => getComputedStyle(e).filter), 'none')
  await page.locator('.bigbtn').click()
  await page.waitForURL(base + '/')
  await page.reload()
  await page.locator('.task .hit').filter({ hasText: '유리 입력창 수정 검증' }).click()
  assert.equal(await page.locator('textarea').inputValue(), '한글 English 123 — 입력·선택·저장')
  assert.equal(await page.locator('input[type="datetime-local"]').inputValue(), '2026-10-02T19:30')
  assert.match(await page.locator('.chip.on:has(.subject-badge)').textContent(), /인공지능/)

  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
    await page.waitForFunction(() => !document.querySelector('[data-liquid-glass]'))
    assert.equal(await page.locator('input.inp').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(255, 255, 255)')
    await go('/calendar')
    assert.equal(await page.locator('[data-liquid-glass]').count(), 0)
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
    await page.waitForSelector('.appbar [data-liquid-glass]', { state: 'attached' })
  }
  assert.deepEqual(errors, [])
  console.log(`${engine}: PASS — subject colors in 8 appearances, calendar mouse/touch, glass form edit/save/reload, dock completion/collapse${engine === 'chromium' ? ', reduced transparency' : ''}`)
} finally { await browser.close() }
