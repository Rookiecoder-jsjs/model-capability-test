// 适配与可达性检查：三种桌面尺寸 + 小屏静态布局 + 200% 文字 + 减少动态
// 用法：node tools/responsive.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const url = process.env.URL ?? 'http://127.0.0.1:5173/'
const out = process.env.OUT ?? '.shots/responsive'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const results = []
const errors = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const newPage = async (w, h, opts = {}) => {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...opts })
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  return p
}

const grab = (p) => p.evaluate(() => {
  const doc = document.documentElement
  const rail = document.querySelector('.chapter-rail')
  const live = document.querySelector('.chapter-rail .chapter.is-live')
  return {
    overflowX: doc.scrollWidth - doc.clientWidth,
    staticMode: doc.classList.contains('static-mode'),
    text200: doc.classList.contains('text-200'),
    railVisible: rail ? getComputedStyle(rail).visibility : 'none',
    liveChapter: live ? live.id : null,
    canvasHidden: getComputedStyle(document.querySelector('.stage-layer')).display === 'none',
    diagramShown: [...document.querySelectorAll('.diagram--live')].some((d) => getComputedStyle(d).display !== 'none'),
  }
})

// ---------- 桌面三档 ----------
for (const [w, h] of [[1366, 893], [1025, 700], [1920, 1080]]) {
  const p = await newPage(w, h)
  const g = await grab(p)
  check(`桌面 ${w}×${h}：无横向溢出`, g.overflowX <= 0, `overflowX=${g.overflowX}`)
  check(`桌面 ${w}×${h}：动态主体可见`, !g.canvasHidden && !g.staticMode, `static=${g.staticMode}`)
  await p.screenshot({ path: `${out}/desktop-${w}x${h}.png` })
  // 第 08 章：Agent 窗口可用
  await p.evaluate(() => window.__scene.setP(0.99))
  await p.waitForTimeout(400)
  const win = await p.evaluate(() => {
    const el = document.querySelector('.agent-window')
    const bar = document.querySelector('.actionbar')
    const r = el.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    return { active: el.classList.contains('is-active'), w: Math.round(r.width), h: Math.round(r.height), barVisible: b.height > 20 && b.bottom <= window.innerHeight + 1 }
  })
  check(`桌面 ${w}×${h}：Agent 窗口完整可见且操作栏在视口内`, win.active && win.barVisible, `win ${win.w}×${win.h} bar=${win.barVisible}`)
  await p.close()
}

// ---------- 小屏静态阅读 ----------
{
  const p = await newPage(390, 844, { isMobile: true, hasTouch: true })
  const g = await grab(p)
  check('小屏 390×844：进入静态阅读布局（主体停用）', g.staticMode && g.canvasHidden, `static=${g.staticMode}`)
  check('小屏 390×844：无横向溢出', g.overflowX <= 0, `overflowX=${g.overflowX}`)
  check('小屏 390×844：显示每章的静态示意图', g.diagramShown, `diagram=${g.diagramShown}`)
  const chapters = await p.evaluate(() => document.querySelectorAll('.chapter-rail .chapter').length)
  check('小屏 390×844：八章文案都在 DOM 中', chapters === 8, `chapters=${chapters}`)
  await p.screenshot({ path: `${out}/mobile-390.png`, fullPage: false })
  // Agent 窗口在静态模式下仍可用
  const win = await p.evaluate(async () => {
    window.__scene.setP(0.99)
    await new Promise((r) => setTimeout(r, 300))
    const el = document.querySelector('.agent-window')
    el.scrollIntoView()
    await new Promise((r) => setTimeout(r, 200))
    return { active: el.classList.contains('is-active'), visible: getComputedStyle(el).display !== 'none' }
  })
  check('小屏 390×844：Agent 窗口静态可用', win.active && win.visible, JSON.stringify(win))
  await p.screenshot({ path: `${out}/mobile-agent.png` })
  await p.close()
}

// ---------- 200% 文字 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 893 }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await p.goto(url, { waitUntil: 'networkidle' })
  // 用根字号放大到 200%（等价于浏览器字号设置），
  // 注入在 body 存在之后，避免与页面初始化脚本抢顺序。
  await p.addStyleTag({ content: 'html { font-size: 32px !important; }' })
  await p.waitForTimeout(1200)
  const g = await grab(p)
  check('文字放大 200%：检测到 text-200 并停用动态主体', g.text200 && g.canvasHidden, `text200=${g.text200} hidden=${g.canvasHidden}`)
  check('文字放大 200%：无横向溢出', g.overflowX <= 0, `overflowX=${g.overflowX}`)
  check('文字放大 200%：八章文案可读', g.liveChapter !== null, `live=${g.liveChapter}`)
  await p.screenshot({ path: `${out}/text-200.png` })
  await ctx.close()
}

// ---------- 减少动态 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 893 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  const g = await grab(p)
  check('减少动态效果：进入静态阅读布局，八章仍可读', g.staticMode, `static=${g.staticMode}`)
  const chapters = await p.evaluate(() => document.querySelectorAll('.chapter-rail .chapter').length)
  check('减少动态效果：八章文案都在', chapters === 8, `chapters=${chapters}`)
  await p.screenshot({ path: `${out}/reduced-motion.png` })
  await ctx.close()
}

// ---------- 键盘可达 ----------
{
  const p = await newPage(1366, 893)
  await p.keyboard.press('Tab')
  const first = await p.evaluate(() => {
    const el = document.activeElement
    return { cls: el?.className, text: el?.textContent?.slice(0, 12) }
  })
  check('键盘：Tab 首个焦点是跳跃链接', /skip-link/.test(first.cls || ''), `${first.cls} ${first.text}`)
  // Tab 到导航按钮并回车
  await p.evaluate(() => document.querySelector('.nav__item[data-index="4"]').focus())
  await p.keyboard.press('Enter')
  await p.waitForTimeout(1600)
  const nav = await p.evaluate(() => ({
    p: window.__scene.timeline.p,
    live: document.querySelector('.chapter-rail .chapter.is-live')?.id,
  }))
  check('键盘：导航按钮可聚焦并回车跳转', nav.live === 'chapter-cluster', `live=${nav.live}`)
  const focusRing = await p.evaluate(() => {
    const b = document.querySelector('.nav__item[data-index="4"]')
    b.focus()
    const cs = getComputedStyle(b)
    return { outline: cs.outlineStyle, width: cs.outlineWidth }
  })
  check('键盘：焦点有可见轮廓', focusRing.outline !== 'none' && parseFloat(focusRing.width) > 0, JSON.stringify(focusRing))
  await p.close()
}

console.log('')
console.log(`控制台错误: ${errors.length === 0 ? '无' : errors.join(' | ')}`)
const failed = results.filter((r) => !r.pass)
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
await browser.close()
process.exit(failed.length || errors.length ? 1 : 0)
