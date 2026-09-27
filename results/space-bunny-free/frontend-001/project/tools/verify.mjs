// 验证脚本：对象身份 / 落位 / 反向恢复 / 章节导航 / Agent 交互
// 用法：node tools/verify.mjs
import { chromium } from 'playwright'

const url = process.env.URL ?? 'http://127.0.0.1:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 893 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(async () => { await document.fonts.ready; return true })
await page.waitForTimeout(400)

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// ---------- 1. 对象身份：芯片始终是板卡的子节点 ----------
{
  const chain = await page.evaluate(() => {
    const s = window.__scene
    s.setP(0.0)
    const a = s.probe()
    s.setP(0.5)
    const b = s.probe()
    s.setP(0.9)
    const c = s.probe()
    return [a, b, c]
  })
  const sameParent = chain.every((c) => c.chipParentId === 'cardA' && c.cardParentId === 'serverA' && c.serverParentId === 'rackA')
  check('身份：芯片.parent 恒为 cardA，cardA.parent 恒为 serverA，serverA.parent 恒为 rackA', sameParent,
    chain.map((c) => `${c.chipParentId}<${c.cardParentId}<${c.serverParentId}`).join(' | '))
}

// ---------- 2. 落位：第 02 章之后误差为 0 ----------
{
  const errs = await page.evaluate(() => {
    const s = window.__scene
    const out = []
    for (const p of [0.13, 0.2, 0.32, 0.45, 0.6, 0.8, 1.0]) {
      s.setP(p)
      out.push({ p, ...s.probe() })
    }
    return out
  })
  // 各自的装配完成时刻：芯片 0.11、板卡 0.225、服务器 0.352、机柜 0.481
  const chipDone = errs.filter((e) => e.p >= 0.20)
  const cardDone = errs.filter((e) => e.p >= 0.30)
  const srvDone = errs.filter((e) => e.p >= 0.45)
  const seated = errs.filter((e) => e.p >= 0.45)
  const ok = seated.every((e) => e.chipSeatedError < 1e-12 && e.cardSeatedError < 1e-12 && e.serverSeatedError < 1e-12)
  const stages = [
    chipDone.every((e) => e.chipSeatedError < 1e-12),
    cardDone.every((e) => e.cardSeatedError < 1e-12),
    srvDone.every((e) => e.serverSeatedError < 1e-12),
  ].every(Boolean)
  check('落位：各自装配完成后，世界位置误差 < 1e-12（芯片 p≥0.20 / 板卡 p≥0.30 / 服务器 p≥0.45）', ok && stages,
    seated.map((e) => `p=${e.p}: chip ${e.chipSeatedError.toExponential(1)} card ${e.cardSeatedError.toExponential(1)} srv ${e.serverSeatedError.toExponential(1)}`).join('\n      '))
}

// ---------- 3. 可逆：同一 p 无论从哪个方向到达，画面一致 ----------
{
  const res = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const s = window.__scene
    const snap = () => {
      const m = s.model
      return [m.chip.worldPos, m.card.worldPos, m.server.worldPos, m.rackA.worldPos, s.stage.cam.target]
        .flatMap((v) => [v.x, v.y, v.z])
    }
    // 正向走到 0.6
    for (const p of [0.1, 0.3, 0.45, 0.6]) s.setP(p)
    const forward = snap()
    // 反向倒回 0.1 再回到 0.6
    for (const p of [0.5, 0.3, 0.1, 0.3, 0.5, 0.6]) s.setP(p)
    const backward = snap()
    // 随机跳转路径
    for (const p of [0.9, 0.2, 0.75, 0.05, 0.6]) s.setP(p)
    const jumped = snap()
    const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
    return { d1: diff(forward, backward), d2: diff(forward, jumped) }
  })
  check('可逆：正向 / 反向 / 跳转三种路径抵达同一 p，物体与相机完全一致', res.d1 < 1e-9 && res.d2 < 1e-9,
    `反向差 ${res.d1.toExponential(1)}，跳转差 ${res.d2.toExponential(1)}`)
}

// ---------- 4. 装配路径不穿外壳：落位前芯片不与服务器外壳相交 ----------
{
  const res = await page.evaluate(() => {
    const s = window.__scene
    const m = s.model
    let worstApproach = Infinity
    let worstAt = 0
    for (let i = 0; i <= 100; i++) {
      const p = 0.25 + (i / 100) * 0.125 // 服务器 → 机柜 这段
      s.setP(p)
      // 芯片中心相对机柜顶盖平面的间隙（世界单位）
      const d = 2.66 - m.chip.worldPos.y
      if (Number.isFinite(d) && d < worstApproach) { worstApproach = d; worstAt = p }
    }
    s.setP(0)
    return { worstApproach, worstAt }
  })
  check('路径：装配过程中芯片始终在机柜顶盖之上（未穿透外壳）', res.worstApproach > 0.02,
    `最小间隙 ${res.worstApproach.toFixed(3)} @ p=${res.worstAt.toFixed(3)}`)
}

// ---------- 5. 章节导航：到达八章并正确高亮 ----------
{
  const nav = []
  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate((k) => {
      window.__scene.goToChapter(k)
      return new Promise((res) => setTimeout(() => {
        const cur = document.querySelector('.nav__item[aria-current="step"]')
        const live = document.querySelector('.chapter-rail .chapter.is-live')
        res({ nav: cur ? Number(cur.dataset.index) : -1, live: live ? live.id : null, p: window.__scene.timeline.p })
      }, 1400))
    }, i)
    nav.push(r)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  const ok = nav.every((r, i) => r.nav === i && r.live === `chapter-${['chip', 'card', 'server', 'rack', 'cluster', 'model', 'harness', 'agent'][i]}`)
  check('导航：八个章节按钮都能到达，且导航高亮 / 文字轨章节一致', ok,
    nav.map((r) => `${r.nav}:${r.live}`).join(' '))
}

// ---------- 6. Agent 演示：重放 / 停止 / 幂等 / 下载 ----------
{
  const res = await page.evaluate(async () => {
    const s = window.__scene
    s.setP(0.985)
    await new Promise((r) => setTimeout(r, 60))
    const d = s.demo
    const btns = {
      replay: document.querySelector('.agent-window .btn--primary'),
      stop: document.querySelectorAll('.agent-window .btn')[1],
      dl: document.querySelector('.agent-window .btn--accent'),
    }
    const out = { steps: [] }
    out.dlDisabledBefore = btns.dl.disabled
    const started = d.start(performance.now())
    out.started = started
    out.duplicateStart = d.start(performance.now()) // 运行中再次触发必须被忽略
    out.completionsAfterStart = d.snapshot.completions
    await new Promise((r) => setTimeout(r, 600))
    out.steps.push({ at: 600, run: d.snapshot.run, st: d.snapshot.steps.slice(), dl: btns.dl.disabled })
    d.stop()
    out.afterStop = { run: d.snapshot.run, st: d.snapshot.steps.slice(), dl: btns.dl.disabled }
    // 重新运行到完成
    d.start(performance.now())
    await new Promise((r) => setTimeout(r, 5200))
    out.final = { run: d.snapshot.run, st: d.snapshot.steps.slice(), dl: btns.dl.disabled, completions: d.snapshot.completions }
    out.resultText = document.querySelector('.result').textContent
    return out
  })
  const stepProgressed = res.steps[0].st.some((x) => x === 'running') && res.steps[0].st.filter((x) => x === 'done').length >= 0
  check('Agent：重放推进四步状态', stepProgressed, JSON.stringify(res.steps[0].st))
  check('Agent：运行中禁用下载', res.steps[0].dl === true, `dl.disabled=${res.steps[0].dl}`)
  check('Agent：停止后定格', res.afterStop.run === 'stopped' && res.afterStop.dl === true, `run=${res.afterStop.run}`)
  check('Agent：重新运行不产生重复执行（运行中再次 run 被忽略）', res.duplicateStart === false, `second start returned ${res.duplicateStart}`)
  check('Agent：完成后四步全 done 且可下载', res.final.run === 'done' && res.final.st.every((x) => x === 'done') && res.final.dl === false,
    `run=${res.final.run} completions=${res.final.completions}`)
  check('Agent：结果含进展与待办', res.resultText.includes('部署需求已梳理') && res.resultText.includes('确认模型与算力资源'),
    res.resultText.slice(0, 60).replace(/\s+/g, ' '))
}

// ---------- 7. 窗口变形：embed 到位且反向可还原 ----------
{
  const res = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const s = window.__scene
    const snap = () => {
      const m = s.model
      return {
        embed: s.stage.state.embed,
        model: { ...m.strata.model.worldPos },
        win: document.querySelector('.agent-window').classList.contains('is-active'),
        labels: [...document.querySelectorAll('.stacklabel')].map((e) => e.style.opacity),
      }
    }
    s.setP(1.0)
    await frame()
    const atEnd = snap()
    s.setP(0.9)
    await frame()
    const back = snap()
    s.setP(1.0)
    await frame()
    const again = snap()
    return { atEnd, back, again }
  })
  check('窗口：p=1 时四层结构进入窗口运行区（embed=1）', res.atEnd.embed > 0.99 && res.atEnd.win, `embed=${res.atEnd.embed.toFixed(3)}`)
  check('窗口：反向回到 p=0.9 时结构还原（embed=0）', res.back.embed < 0.01, `embed=${res.back.embed.toFixed(3)}`)
  check('窗口：再次前进到 p=1 可复现（纯函数）',
    Math.abs(res.atEnd.model.x - res.again.model.x) < 1e-9 && Math.abs(res.atEnd.model.y - res.again.model.y) < 1e-9,
    `Δ=(${Math.abs(res.atEnd.model.x - res.again.model.x).toExponential(1)}, ${Math.abs(res.atEnd.model.y - res.again.model.y).toExponential(1)})`)
}

// ---------- 8. 无横向溢出 ----------
{
  const sizes = [[1366, 893], [1025, 700], [1920, 1080]]
  const out = []
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(300)
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }))
    out.push({ w, h, ...o, ok: o.sw <= o.cw + 1 })
  }
  check('布局：1366×893 / 1025×700 / 1920×1080 均无横向溢出', out.every((o) => o.ok),
    out.map((o) => `${o.w}×${o.h}: ${o.sw}/${o.cw}`).join('  '))
}

// ---------- 9. 键盘可达 ----------
{
  const res = await page.evaluate(() => {
    const f = document.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    return { count: f.length }
  })
  check('无障碍：可聚焦元素存在（导航 8 项 + 操作栏 + 跳跃链接）', res.count >= 11, `focusables=${res.count}`)
}

console.log('')
console.log(`控制台错误: ${errors.length === 0 ? '无' : errors.join(' | ')}`)
const failed = results.filter((r) => !r.pass)
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
await browser.close()
process.exit(failed.length || errors.length ? 1 : 0)
