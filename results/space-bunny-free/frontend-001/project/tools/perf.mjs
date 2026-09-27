// 性能采样：真实帧间隔、每帧绘制负载、静止后是否停绘、标签页隐藏后是否停绘。
// 用法：URL=http://localhost:4173/ node tools/perf.mjs
//
// 测量方法（数字必须与这组条件一起引用，否则没有意义）：
//   1) 连续 rAF 循环里由页面自己推进滚动（不是脚本逐步 scrollTo），
//      逐帧记录 performance.now() 的间隔。脚本不参与节拍，
//      所以帧间隔反映真实渲染吞吐，而不是脚本等待。
//   2) 停绘用「实际提交到 Canvas 的累计帧数」判定：对比一段时间前后的
//      framesRendered 增量。rAF 本身仍在跑，页面没有卡住。
//   3) 标签页隐藏用 CDP Page.setWebLifecycleState（frozen / hidden）模拟，
//      测量 document.hidden 下是否还提交帧。
import { chromium } from 'playwright'
import { cpus, totalmem } from 'node:os'

const url = process.env.URL ?? 'http://127.0.0.1:5173/'
const W = Number(process.env.W ?? 1366)
const H = Number(process.env.H ?? 893)
/** 连续滚动的目标时长（毫秒） */
const RUN_MS = Number(process.env.RUN_MS ?? 5000)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(async () => { await document.fonts.ready; return true })
await page.waitForTimeout(500)

/** 在页面里数一段时间内真正提交到 Canvas 的帧数（rAF 由页面自己驱动） */
const countFrames = (ms) => page.evaluate(async (d) => {
  const f0 = window.__scene.stats().framesRendered
  const t0 = performance.now()
  await new Promise((r) => {
    const tick = () => (performance.now() - t0 < d ? requestAnimationFrame(tick) : r(null))
    requestAnimationFrame(tick)
  })
  return window.__scene.stats().framesRendered - f0
}, ms)

// ---- 1) 连续滚动中的真实帧间隔 ----
const run = await page.evaluate(async (ms) => {
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
  const t0 = performance.now()
  const max = window.__scene.maxScroll()
  const stamps = []
  let faces = 0, labels = 0, n = 0
  let lo = Infinity, hi = 0
  while (performance.now() - t0 < ms) {
    const now = performance.now()
    // 页面自己推动滚动：rAF 循环本身即是节拍源
    window.scrollTo(0, Math.min(1, (now - t0) / ms) * max)
    await raf()
    stamps.push(performance.now())
    const s = window.__scene.stats()
    faces += s.faces; labels += s.labels; n++
    lo = Math.min(lo, s.camScale); hi = Math.max(hi, s.camScale)
  }
  return { stamps, meanFaces: faces / n, meanLabels: labels / n, camLo: lo, camHi: hi }
}, RUN_MS)

const gaps = []
for (let i = 1; i < run.stamps.length; i++) gaps.push(run.stamps[i] - run.stamps[i - 1])
const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
const sorted = [...gaps].sort((a, b) => a - b)
const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]

// ---- 2) 静止后是否停绘（停在第 01 章，无流动元素）----
// 等待时间要盖过速度衰减：velocity 用指数逼近，不会瞬时归零。
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(2000)
const idleFrames = await countFrames(1500)

// ---- 2b) 静止后是否停绘（停在第 07 章：Harness 执行信号是时间的函数，应继续画）----
await page.evaluate(() => window.scrollTo(0, 0.80 * window.__scene.maxScroll()))
await page.waitForTimeout(2000)
const flowingFrames = await countFrames(1500)

// ---- 3) 标签页隐藏后是否停绘 ----
// headless Chromium 的 Page.setWebLifecycleState 在本机报 Unidentified lifecycle state，
// document.hidden 始终为 false，所以这条**无法**在 headless 下测。
// 尝试一次；失败就如实标记为未验证，不拿 0 帧冒充通过。
const cdp = await page.context().newCDPSession(page)
let hiddenFrames = null
let hiddenWorks = false
try {
  await cdp.send('Page.setWebLifecycleState', { state: 'hidden' })
  hiddenWorks = await page.evaluate(() => document.hidden)
  if (hiddenWorks) hiddenFrames = await countFrames(1200)
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
} catch {
  hiddenWorks = false
}

const dpr = await page.evaluate(() => devicePixelRatio)

console.log('')
console.log('== 性能采样 ==')
console.log('采样条件（结论必须与这组条件一起引用）：')
console.log('  渲染后端    headless Chromium，SwiftShader 软件渲染，无真实 GPU')
console.log(`  viewport    ${W}×${H}，deviceScaleFactor 1，DPR ${dpr}`)
console.log(`  机器        ${cpus().length} 逻辑核，${(totalmem() / 1e9).toFixed(1)} GB，Node ${process.version}`)
console.log('')
console.log(`连续滚动 ${RUN_MS} ms（页面 rAF 自驱，脚本不节拍）:`)
console.log(`  帧数 ${run.stamps.length}，平均帧间隔 ${meanGap.toFixed(2)} ms → ${(1000 / meanGap).toFixed(1)} fps`)
console.log(`  帧间隔 p50 ${pct(0.5).toFixed(2)} / p90 ${pct(0.9).toFixed(2)} / p99 ${pct(0.99).toFixed(2)} ms`)
console.log(`  抖动（p99−p50）${(pct(0.99) - pct(0.5)).toFixed(2)} ms`)
console.log(`  每帧绘制面数均值 ${run.meanFaces.toFixed(0)}，画布标注均值 ${run.meanLabels.toFixed(1)}`)
console.log(`  相机缩放 ${run.camLo.toFixed(1)}–${run.camHi.toFixed(1)} px/世界单位`)
console.log('')
console.log(`静止后 1.5 s 内实际提交到 Canvas 的帧数:`)
console.log(`  第 01 章（画面已终态）      ${idleFrames} 帧 ${idleFrames === 0 ? '→ 已停绘' : '→ 仍在绘制'}`)
console.log(`  第 07 章（Harness 信号流动）${flowingFrames} 帧 ${flowingFrames > 0 ? '→ 继续绘制（预期）' : '→ 意外停绘'}`)
console.log(hiddenWorks
  ? `  标签页 hidden              ${hiddenFrames} 帧 ${hiddenFrames === 0 ? '→ 已停绘' : '→ 仍在绘制'}`
  : '  标签页 hidden              未验证 —— headless Chromium 不支持 CDP 模拟后台，document.hidden 恒为 false')
console.log('')
console.log('注：rAF 循环本身在上述所有情形下都还在跑（页面没有卡死），')
console.log('    停绘指的是不再向 Canvas 提交绘制帧。')

await cdp.detach().catch(() => {})
await browser.close()
