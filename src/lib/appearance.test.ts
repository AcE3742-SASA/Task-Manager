import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { APPEARANCE_KEY, applyAppearance, cacheAppearance, DEFAULT_APPEARANCE, normalizeAppearance, readAppearance, resolveTheme, THEME_STYLES } from './appearance'
import { mergeSettings } from './settings'
import { parseBundle } from './transfer'

afterEach(() => vi.unstubAllGlobals())

describe('appearance persistence', () => {
  it('keeps old accounts Classic without losing their explicit color mode', () => {
    expect(mergeSettings({ theme: 'dark' })).toMatchObject({ theme: 'dark', themeStyle: 'classic' })
    expect(normalizeAppearance({ theme: 'broken', themeStyle: '__proto__' })).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance('glassmorphism')).toEqual(DEFAULT_APPEARANCE)
  })

  it.each(THEME_STYLES)('round trips %s through the cache and an exported bundle', (themeStyle) => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) })
    cacheAppearance({ theme: 'dark', themeStyle })
    expect(readAppearance()).toEqual({ theme: 'dark', themeStyle })
    const bundle = parseBundle(JSON.stringify({ app: 'sasa-task-manager', version: 1, settings: readAppearance(), subjects: [], tasks: [] }))
    expect(mergeSettings(bundle.settings)).toMatchObject({ theme: 'dark', themeStyle })
  })

  it('survives blocked storage and malformed JSON', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken' })
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE)
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('full') } })
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE)
    expect(() => cacheAppearance({ theme: 'light', themeStyle: 'neumorphism' })).not.toThrow()
  })
})

describe('DOM appearance and system changes', () => {
  function browser() {
    const root = { dataset: {} as Record<string, string> }
    const setAttribute = vi.fn()
    const mq = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('document', { documentElement: root, querySelector: () => ({ setAttribute }) })
    vi.stubGlobal('matchMedia', () => mq)
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => root.dataset.theme === 'dark' ? ' #101f2c ' : ' #eaf3f8 ' }))
    return { root, setAttribute, mq }
  }

  it('changes brightness without changing style, then removes its listener', () => {
    const { root, setAttribute, mq } = browser()
    const cleanup = applyAppearance({ theme: 'system', themeStyle: 'glassmorphism' })
    expect(root.dataset).toEqual({ theme: 'light', themeStyle: 'glassmorphism' })
    mq.matches = true
    const paint = mq.addEventListener.mock.calls[0][1] as () => void
    paint()
    expect(root.dataset).toEqual({ theme: 'dark', themeStyle: 'glassmorphism' })
    expect(setAttribute).toHaveBeenLastCalledWith('content', '#101f2c')
    cleanup()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', paint)
  })

  it('explicit brightness does not subscribe to system changes', () => {
    const { root, mq } = browser()
    mq.matches = true
    applyAppearance({ theme: 'light', themeStyle: 'neo-brutalism' })()
    expect(root.dataset.theme).toBe('light')
    expect(mq.addEventListener).not.toHaveBeenCalled()
    vi.stubGlobal('matchMedia', undefined)
    expect(resolveTheme('system')).toBe('light')
  })
})

describe('the actual pre-paint script', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]
  const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
  const papers = { classic: ['#fffdf8', '#272e29'], neumorphism: ['#e8edf2', '#293340'], 'neo-brutalism': ['#fffef9', '#303239'], glassmorphism: ['#eaf3f8', '#101f2c'] }

  it.each(THEME_STYLES)('restores %s before React and uses an opaque palette color', (themeStyle) => {
    for (const theme of ['light', 'dark', 'system'] as const) {
      const root = { dataset: {} as Record<string, string> }
      const meta = { content: '' }
      runInNewContext(script, {
        localStorage: { getItem: (key: string) => key === APPEARANCE_KEY ? JSON.stringify({ theme, themeStyle }) : null },
        matchMedia: () => ({ matches: true }),
        document: { documentElement: root, querySelector: () => meta },
      })
      expect(root.dataset).toEqual({ theme: theme === 'light' ? 'light' : 'dark', themeStyle })
      const expected = papers[themeStyle][theme === 'light' ? 0 : 1]
      expect(meta.content).toBe(expected)
      expect(tokens).toContain(`--paper: ${expected};`)
    }
  })

  it.each(['{broken', '{"theme":"bad","themeStyle":"bad"}', 'null'])('handles corrupt or obsolete cached values: %s', (stored) => {
    const root = { dataset: {} as Record<string, string> }
    runInNewContext(script, { localStorage: { getItem: () => stored }, matchMedia: () => ({ matches: false }), document: { documentElement: root, querySelector: () => ({}) } })
    expect(root.dataset).toEqual({ theme: 'light', themeStyle: 'classic' })
  })
})
