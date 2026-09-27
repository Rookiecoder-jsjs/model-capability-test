// 逐章截图：把时间轴定位到每一章的中段，逐一截图。
// 用法：node tools/shots.mjs [outDir] [width] [height]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const outDir = process.argv[2] ?? '.shots'
const W = Number(process.argv[3] ?? 1366)
const H = Number(process.argv[4] ?? 893)
const url = process.env.URL ?? 'http://127.0.0.1:5173/'
const tag = process.env.TAG ?? ''

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(async () => { await document.fonts.ready; return true })
await page.waitForTimeout(400)

const chapters = ['芯片', '显卡', '服务器', '机柜', '集群', '大模型', 'Harness', 'Agent']
const report = []
for (let i = 0; i < 8; i++) {
  const p = (i + 0.55) / 8
  await page.evaluate((pp) => window.__scene.setP(pp), p)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForTimeout(200)
  const stats = await page.evaluate(() => window.__scene.stats())
  const probe = await page.evaluate(() => window.__scene.probe())
  const file = `${outDir}/${tag}ch${i + 1}-${chapters[i]}.png`
  await page.screenshot({ path: file })
  report.push({ ch: chapters[i], p, ...stats, probe })
}

console.log(JSON.stringify({ report, errors }, null, 1))
await browser.close()
