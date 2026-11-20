// Isolated local demo data only; no real account or push requests.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const engine = process.env.THEME_QA_BROWSER || 'chromium'
const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.DEMO_URL || 'http://127.0.0.1:4183'
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), 'local demo only')
const out = 'outputs/calendar-notifications'
await mkdir(out, { recursive: true })
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' })
const errors = [], external = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', route => {
  if (route.request().url().startsWith(base + '/')) return route.continue()
  external.push(route.request().url())
  return route.abort()
})
const group = () => page.getByRole('group', { name: /곧 마감 알림|Due soon alerts/ })
const reminder = name => group().getByRole('button', { name, exact: true })
async function storedReminders() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('sasa-demo-data-v1'))['users/local-demo/settings/app'].notify.soonBefore)
}
async function go(path) {
  await page.goto(base + path)
  await page.locator('.nav').waitFor()
  await page.locator(path === '/calendar' ? '.month .day' : '.reminder-custom').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
}
try {
  await go('/settings')
  assert.match(await page.title(), /\[DEV\]/)
  await page.evaluate(() => {
    const key = 'sasa-demo-data-v1', data = JSON.parse(localStorage.getItem(key))
    data['users/local-demo/settings/app'].notify = { morningHour: 7, eveningHour: 21, soonBefore: 3 }
    const task = data['users/local-demo/tasks/demo-0']
    for (let i = 0; i < 3; i++) data[`users/local-demo/tasks/extra-${i}`] = { ...task, title: `추가 과제 ${i}`, focusDate: null }
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload()
  assert.equal(await reminder('3시간 전').getAttribute('aria-pressed'), 'true', 'legacy setting')
  await reminder('1시간 전').click()
  await reminder('12시간 전').click()
  assert.deepEqual(await storedReminders(), [1, 3, 12])
  await page.reload()
  for (const hours of [1, 3, 12]) assert.equal(await reminder(`${hours}시간 전`).getAttribute('aria-pressed'), 'true')
  await reminder('3시간 전').click()
  assert.deepEqual(await storedReminders(), [1, 12])
  await reminder('끔').click()
  await page.reload()
  assert.deepEqual(await storedReminders(), [])
  assert.equal(await reminder('끔').getAttribute('aria-pressed'), 'true')
  await reminder('1시간 전').focus()
  await page.keyboard.press('Space')
  assert.deepEqual(await storedReminders(), [1], 'keyboard selection')
  await reminder('3시간 전').click()
  await reminder('12시간 전').click()
  assert.equal(await page.getByLabel('아침 알림 시각').inputValue(), '7')
  assert.equal(await page.getByLabel('저녁 알림 시각').inputValue(), '21')

  const amount = page.getByLabel('알림 간격 직접 입력', { exact: true })
  const unit = page.getByLabel('알림 간격 단위', { exact: true })
  const add = page.locator('.reminder-custom').getByRole('button', { name: '추가', exact: true })
  await unit.selectOption('1')
  assert.equal(await amount.getAttribute('min'), '10')
  assert.equal(await amount.getAttribute('step'), '10')
  for (const invalid of ['5', '15']) {
    await amount.fill(invalid)
    await add.click()
    assert.match(await page.locator('#reminder-error').innerText(), /10의 배수/)
  }
  await amount.fill('30')
  await amount.press('Enter')
  await amount.fill('2')
  await unit.selectOption('1440')
  await add.click()
  assert.deepEqual(await storedReminders(), [0.5, 1, 3, 12, 48])
  await page.reload()
  for (const label of ['30분 전', '2일 전']) assert.equal(await reminder(label).getAttribute('aria-pressed'), 'true')
  await amount.fill('0')
  await add.click()
  assert.equal(await amount.getAttribute('aria-invalid'), 'true')
  await amount.fill('366')
  await unit.selectOption('1440')
  await add.click()
  assert.match(await page.locator('#reminder-error').innerText(), /365일/)
  await amount.fill('48')
  await unit.selectOption('60')
  await add.click()
  assert.match(await page.locator('#reminder-error').innerText(), /이미 설정/)
  assert.deepEqual(await storedReminders(), [0.5, 1, 3, 12, 48])
  await amount.fill('')
  await reminder('30분 전').click()
  assert.deepEqual(await storedReminders(), [1, 3, 12, 48])
  await amount.fill('30')
  await unit.selectOption('1')
  await add.click()

  for (const themeStyle of ['classic', 'neumorphism', 'neo-brutalism', 'glassmorphism']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.evaluate(({ themeStyle, theme }) => {
          const key = 'sasa-demo-data-v1', data = JSON.parse(localStorage.getItem(key))
          Object.assign(data['users/local-demo/settings/app'], { themeStyle, theme })
          localStorage.setItem(key, JSON.stringify(data))
        }, { themeStyle, theme })
        for (const path of ['/calendar', '/settings']) {
          await go(path)
          const label = `${engine} ${themeStyle} ${theme} ${width} ${path}`
          assert.equal(await page.locator('.screenbody').evaluate(el => el.scrollWidth > el.clientWidth), false, label)
          if (path === '/calendar') {
            const dimensions = await page.locator('.dots2 i').evaluateAll(markers => markers.map(marker => {
              const box = marker.getBoundingClientRect(), day = marker.closest('.day').getBoundingClientRect()
              return { width: box.width, height: box.height, fits: box.left >= day.left && box.right <= day.right && box.top >= day.top && box.bottom <= day.bottom }
            }))
            assert(dimensions.length > 0, label)
            assert(dimensions.every(d => d.width === 15 && d.height === 15 && d.fits), label)
            assert.equal(await page.locator('.day.today .dots2 i').count(), 4, 'four markers still fit')
          } else {
            await group().scrollIntoViewIfNeeded()
            assert.equal(await group().getByRole('button', { pressed: true }).count(), 5, label)
            const fits = await group().getByRole('button').evaluateAll(buttons => buttons.every(button => {
              const box = button.getBoundingClientRect(), row = button.closest('.row').getBoundingClientRect()
              return box.height >= 44 && button.scrollWidth <= button.clientWidth && box.left >= row.left && box.right <= row.right
            }))
            assert(fits, label)
          }
          if (themeStyle === 'glassmorphism' && width === 390 || themeStyle === 'classic' && theme === 'light' && width === 320) {
            await page.screenshot({ path: `${out}/${engine}-${themeStyle}-${theme}-${width}-${path.slice(1)}.png` })
          }
        }
      }
    }
  }
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  assert.equal(await reminder('12h before').getAttribute('aria-pressed'), 'true')
  assert.equal(await reminder('30m before').getAttribute('aria-pressed'), 'true')
  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByLabel('Custom reminder interval', { exact: true }).fill('1')
  await page.getByLabel('Reminder interval unit').selectOption('1')
  await page.locator('.reminder-custom').getByRole('button', { name: 'Add', exact: true }).click()
  assert.equal(await reminder('1m before').getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('.screenbody').evaluate(el => el.scrollWidth > el.clientWidth), false)
  await reminder('Off').click()
  await page.reload()
  assert.deepEqual(await storedReminders(), [])
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  console.log(`PASS (${engine}): custom minute/day reminders, validation, duplicates, persistence, removal, keyboard, English, 48 layouts, no overflow or external requests`)
} finally { await browser.close() }
