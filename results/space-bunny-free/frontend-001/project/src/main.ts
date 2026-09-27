/* ==========================================================================
   入口
   ---------------------------------------------------------------------------
   职责：
     · 构建 DOM（章节、导航、Agent 窗口、服务总结）
     · 建立唯一时间轴，把滚动映射为进度 p
     · 每帧：p → 场景（纯函数） → Canvas 绘制 + 标注定位
     · 管理静态阅读模式的切换、可见性暂停、字体就绪
   ========================================================================== */

import '@fontsource-variable/noto-sans-sc/wght.css'
import '@fontsource-variable/inter/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'

import { CHAPTERS } from './content/chapters'
import { buildTopbar, buildChapter, buildAgentWindow, buildSummary, h } from './app/dom'
import { Stage, type LabelAnchor, type StackBox } from './app/stage'
import { buildAssembly, probeIdentity } from './scene/assembly'
import { Timeline } from './app/timeline'
import { SmoothScroll } from './app/smooth-scroll'
import { AgentDemo, downloadBrief, type DemoSnapshot } from './app/agent-demo'
import { clamp, clamp01 } from './engine/math'

// ---------------------------------------------------------------------------
// 模式判定
// ---------------------------------------------------------------------------

const MOTION_QUERY = window.matchMedia('(prefers-reduced-motion: reduce)')

/** 静态阅读模式：小屏 / 矮视口 / 减少动态 / 无 Canvas 2D */
function shouldUseStatic(motionReduced: boolean): boolean {
  if (motionReduced) return true
  if (window.innerWidth <= 900) return true
  if (window.innerHeight <= 560) return true
  try {
    const probe = document.createElement('canvas')
    if (!probe.getContext('2d')) return true
  } catch {
    return true
  }
  return false
}

let staticMode = shouldUseStatic(MOTION_QUERY.matches)

// ---------------------------------------------------------------------------
// 构建
// ---------------------------------------------------------------------------

const app = document.getElementById('app')
if (!app) throw new Error('#app 不存在')

app.append(h('a', { class: 'skip-link', href: '#chapters' }, [document.createTextNode('跳到正文')]))

const { el: topbar, nav, progress } = buildTopbar()
app.append(topbar)

// 舞台层（Canvas + 标注）
const canvas = h('canvas', { class: 'stage-canvas', 'aria-hidden': 'true' })
const labelsEl = h('div', { class: 'labels', 'aria-hidden': 'true' })
const stageLayer = h('div', { class: 'stage-layer', 'aria-hidden': 'true' }, [canvas, labelsEl])
app.append(stageLayer)

// 静态模式提示（阅读模式 / 文字放大两种情况文案不同）
const staticNote = h('p', { class: 'static-note' })
app.append(staticNote)

function setStaticNote(kind: 'static' | 'text200' | null): void {
  staticNote.replaceChildren()
  if (!kind) return
  staticNote.append(
    h('strong', { text: kind === 'text200' ? '文字已放大。' : '静态阅读布局。' }),
    document.createTextNode(
      kind === 'text200'
        ? '检测到较大的文字缩放，连续装配动画已停用，避免文字与画面互相干扰。下方每章配有一张等距示意图，八章内容与 Agent 演示均可正常使用。'
        : '当前处于小屏、矮视口或减少动态效果条件，连续装配动画已停用；下方每章配有一张等距示意图，八章内容与 Agent 演示均可正常使用。',
    ),
  )
}
setStaticNote(staticMode ? 'static' : null)

// 章节：空间轨（只撑滚动长度）+ 文字轨（固定面板，逐章淡入淡出）
const chaptersEl = h('main', { class: 'chapters', id: 'chapters' })
const railEl = h('div', { class: 'chapter-rail' })
const chapterEls = CHAPTERS.map((c, i) => {
  const el = buildChapter(c, i)
  chaptersEl.append(el)
  railEl.append(el)
  return el
})
app.append(chaptersEl)
app.append(railEl)

// 服务总结
app.append(buildSummary())

// Agent 窗口
const win = buildAgentWindow()
document.body.append(win.el)

// 演示控制器
const demo = new AgentDemo()

// 场景与舞台
const model = buildAssembly()
const stage = new Stage(canvas, model)

// ---------------------------------------------------------------------------
// Canvas 标注元素（复用，避免每帧创建）
// ---------------------------------------------------------------------------

const labelEls = new Map<string, HTMLElement>()
const LABEL_DEFS: Record<string, [string, string]> = {
  chip: ['芯片 0', 'CHIP'], card: ['加速卡', 'BOARD'], server: ['服务器', 'SERVER'],
  rackA: ['机柜 A', 'RACK A'], peers: ['同集群机柜', 'PEER RACKS'],
  smodel: ['模型层', 'Serving'], sharness: ['Harness 层', 'Framework'], sagent: ['Agent 层', 'App'],
}
for (const key of Object.keys(LABEL_DEFS)) {
  const def = LABEL_DEFS[key]
  const el = h('div', { class: 'anno', 'data-key': key }, [
    h('span', { class: 'label__title', text: def[0] }),
    h('span', { class: 'label__sub', text: def[1] }),
  ])
  labelsEl.append(el)
  labelEls.set(key, el)
}

// ---------------------------------------------------------------------------
// 布局测量
// ---------------------------------------------------------------------------

let stageRect = { x: 0, y: 0, w: 100, h: 100 }

function measure(): void {
  const vw = window.innerWidth
  const vh = window.innerHeight
  stage.resize(vw, vh, window.devicePixelRatio || 1)

  const railW = staticMode ? 0 : clamp(vw * 0.34, 340, 520)
  const gutter = staticMode ? 0 : Math.max(16, Math.min(56, vw * 0.025))
  const topInset = staticMode ? 0 : 68

  stageRect = {
    x: railW + gutter,
    y: topInset,
    w: Math.max(180, vw - railW - gutter * 2),
    h: Math.max(180, vh - topInset - 32),
  }
  stage.stage = stageRect
}

/**
 * 章节排版：文字轨里内容超出可用高度时收字号，
 * 而不是裁切或溢出——用列宽/行高解决冲突，不是盖底板。
 */
function layoutChapters(): void {
  const flow = staticMode || document.documentElement.classList.contains('text-200')
  const avail = window.innerHeight - 68 - 44
  for (const el of chapterEls) {
    const hint = el.querySelector<HTMLElement>('.scroll-hint')
    if (hint) hint.style.display = flow ? 'none' : ''
    el.classList.toggle('is-dense', el.offsetHeight > avail * 0.94)
  }
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

let exec = 0
let lastTs = performance.now()
let dtFrame = 0
let visibilityPaused = document.hidden
let labelCount = 0
/** 实际提交到 Canvas 的帧数（性能采样脚本用，见 tools/perf.mjs） */
let framesRendered = 0
/** 距离「画面可能变化」还有多远；静止时归零，用于停绘 */
let quiet = 0

/**
 * 标注定位：DOM 与 Canvas 共用同一套相机矩阵，所以标注永远贴在它所属的物体上。
 * 冲突用「不画」解决——标注不压到左侧文字栏、不顶出视口。
 */
function applyLabels(labels: LabelAnchor[], stack: StackBox | null): void {
  const em = stage.state?.embed ?? 0
  const safeLeft = stageRect.x - 6
  for (const l of labels) {
    const el = labelEls.get(l.key)
    if (!el) continue
    const off =
      em > 0.30 ||
      l.a <= 0.03 ||
      l.x < safeLeft ||
      l.x > window.innerWidth - 190 ||
      l.y < 74 ||
      l.y > window.innerHeight - 20
    if (off) {
      el.style.opacity = '0'
      continue
    }
    el.style.opacity = String(l.a)
    el.style.transform = `translate3d(${Math.round(l.x + 14)}px, ${Math.round(l.y - 14)}px, 0)`
    el.classList.toggle('anno--strong', !!l.strong)
  }
  labelCount = labels.filter((l) => l.a > 0.03).length

  // 窗口内的层标签：跟随所属层，窗口内滚动时仍对齐
  const frameBox = win.frame.getBoundingClientRect()
  for (const key of ['model', 'harness', 'agent'] as const) {
    const el = win.stackLabels[key]
    if (!stack || em < 0.04) {
      el.style.opacity = '0'
      continue
    }
    const c = stack.layers[key]
    el.style.opacity = String(clamp01((em - 0.04) / 0.3))
    el.style.transform = `translate3d(${Math.round(c.x - frameBox.left + 10)}px, ${Math.round(c.y - frameBox.top - 11)}px, 0)`
  }
}

function renderNow(): void {
  // exec 是时间的函数而非 p 的函数：Harness 内部的执行信号有自己的时钟，
  // 所以在第 07 章来回滚不会让执行流乱跳。
  if ((stage.state?.w[6] ?? 0) > 0.02) exec = (exec + dtFrame * 0.22) % 1

  // 运行区矩形：只按窗口是否激活来决定。
  // 不看 stage.state.embed —— 那是上一帧的值，会让「刚进入第 08 章」的第一帧
  // 少做一次变形，视觉上出现一帧的跳变。
  let windowRect: { x: number; y: number; w: number; h: number } | null = null
  if (win.el.classList.contains('is-active')) {
    const fr = win.frame.getBoundingClientRect()
    if (fr.width > 40 && fr.height > 30) {
      windowRect = { x: fr.left, y: fr.top, w: fr.width, h: fr.height }
      // 把 Canvas 裁进运行区：与镜头解耦的 CSS 裁剪，
      // 因此窗口内滚动、改变尺寸时主体都自然跟随。
      const vw = window.innerWidth
      const vh = window.innerHeight
      document.documentElement.style.setProperty(
        '--runarea-clip',
        `inset(${fr.top}px ${Math.max(0, vw - fr.right)}px ${Math.max(0, vh - fr.bottom)}px ${fr.left}px round var(--radius))`,
      )
    }
  }

  stage.render({
    p: timeline.p,
    exec,
    windowRect,
    onLabels: applyLabels,
  })
  framesRendered++
}

// ---------------------------------------------------------------------------
// 章节 UI
// ---------------------------------------------------------------------------

let currentChapter = -1

function updateChapterUI(p: number): void {
  const f = p * 8
  const idx = Math.min(7, Math.max(0, Math.floor(f)))
  const frac = f - idx

  const bar = progress.firstElementChild as HTMLElement
  bar.style.width = `${(p * 100).toFixed(2)}%`
  progress.setAttribute('aria-valuenow', String(Math.round(p * 100)))

  if (idx !== currentChapter) {
    currentChapter = idx
    for (const b of nav.querySelectorAll<HTMLButtonElement>('.nav__item')) {
      if (Number(b.dataset.index) === idx) b.setAttribute('aria-current', 'step')
      else b.removeAttribute('aria-current')
    }
    for (let i = 0; i < chapterEls.length; i++) {
      chapterEls[i].classList.toggle('is-live', i === idx)
      if (i === idx) chapterEls[i].removeAttribute('aria-hidden')
      else chapterEls[i].setAttribute('aria-hidden', 'true')
    }
  }

  // 章末 16%：正文组（能力项 / 交付内容）先收，下一章的标题再进
  const tail = frac > 0.84
  for (const el of chapterEls) {
    if (el.classList.contains('is-live')) el.classList.toggle('is-tail', tail)
  }

  const active = idx === 7
  win.el.classList.toggle('is-active', active)
  document.body.classList.toggle('win-active', active)
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

function frame(ts: number): void {
  requestAnimationFrame(frame)
  if (visibilityPaused) return

  dtFrame = Math.min(0.05, (ts - lastTs) / 1000)
  lastTs = ts

  updateChapterUI(timeline.p)

  // 静止后停绘。判据是「屏幕上还有没有会继续动的东西」：
  //   1) 滚动还在动、导航补间还在跑 —— 必须画；
  //   2) 第 07 章 Harness 层的执行信号是时间的函数，静止时仍在流动 —— 必须画；
  //   3) 其余情况画面已是终态，再画就是白烧 CPU。
  // 低于阈值后先补一帧，让最后一段位移落在屏幕上。
  const flowing = (stage.state?.w[6] ?? 0) > 0.02
  const moving = timeline.idle < 0.08 || timeline.velocity > 1e-4
  if (moving || flowing) quiet = 0.12
  else if (quiet > 0) quiet -= dtFrame

  if (staticMode || quiet <= 0) return
  renderNow()
}

// ---------------------------------------------------------------------------
// 事件
// ---------------------------------------------------------------------------

function goToChapter(i: number): void {
  const p = clamp01((i + 0.5) / 8)
  timeline.measure()
  const y = p * timeline.totalScroll
  if (MOTION_QUERY.matches) {
    window.scrollTo(0, y)
    smooth.syncNow()
    timeline.applyImmediate(p)
  } else {
    smooth.kick(y)
  }
}

nav.addEventListener('click', (e: Event) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.nav__item')
  if (!btn) return
  goToChapter(Number(btn.dataset.index))
})

win.btnReplay.addEventListener('click', () => {
  demo.start(performance.now()) // 幂等：运行中再次点击不会排第二个循环
})
win.btnStop.addEventListener('click', () => demo.stop())
win.btnDownload.addEventListener('click', () => {
  if (demo.snapshot.downloadable) downloadBrief()
})

const DEMO_RESULT = {
  title: '项目进展简报',
  progress: '部署需求已梳理；模型与算力配置待确认。',
  next_steps: ['确认模型与算力资源。', '补充评测任务。', '开始部署验证。'],
}

demo.on((s: DemoSnapshot) => {
  const items = win.steps.querySelectorAll<HTMLElement>('.step')
  items.forEach((el: HTMLElement, i: number) => {
    const st = s.steps[i]
    el.dataset.state = st
    const stateEl = el.querySelector<HTMLElement>('.step__state')
    if (stateEl) stateEl.textContent = st === 'done' ? '已完成' : st === 'running' ? '执行中' : '待执行'
  })

  const pct = Math.round(s.progress * 100)
  win.progressFill.style.width = `${pct}%`
  win.progressPct.textContent = `${pct}%`
  win.progressTrack.setAttribute('aria-valuenow', String(pct))

  if (s.downloadable) {
    const r = DEMO_RESULT
    win.result.dataset.state = 'done'
    win.result.replaceChildren(
      h('div', { class: 'result__title', text: r.title }),
      h('div', {}, [
        h('div', { class: 'result__label', text: '进展' }),
        h('p', { class: 'result__text', text: r.progress }),
      ]),
      h('div', {}, [
        h('div', { class: 'result__label', text: '待办' }),
        h('ul', { class: 'result__list' }, r.next_steps.map((t) => h('li', { text: t }))),
      ]),
    )
  } else if (s.run === 'running') {
    const done = s.steps.filter((x) => x === 'done').length
    win.result.dataset.state = 'empty'
    win.result.replaceChildren(
      h('div', { class: 'result__text', text: `执行中 · ${done} / ${s.steps.length} 步完成，完成后生成结果。` }),
    )
  } else if (s.run === 'stopped') {
    win.result.dataset.state = 'empty'
    win.result.replaceChildren(h('div', { class: 'result__text', text: '已停止。结果需在任务完成后生成。' }))
  }

  win.btnStop.disabled = s.run !== 'running'
  win.btnDownload.disabled = !s.downloadable
  win.btnReplay.textContent =
    s.run === 'running' ? '执行中…' : s.run === 'done' ? '重新运行' : s.run === 'stopped' ? '继续运行' : '重放任务'
  win.btnReplay.disabled = s.run === 'running'

  const dot = win.status.querySelector<HTMLElement>('.status__dot')
  if (dot) dot.dataset.run = s.run
  win.statusText.textContent =
    s.run === 'running' ? '执行中' : s.run === 'done' ? '已完成，可下载' : s.run === 'stopped' ? '已停止' : '待运行'
})

// ---------------------------------------------------------------------------
// 模式切换 / 视口变化
// ---------------------------------------------------------------------------

function applyMode(): void {
  staticMode = shouldUseStatic(MOTION_QUERY.matches)
  const zoomed = document.documentElement.classList.contains('text-200')
  document.documentElement.classList.toggle('static-mode', staticMode)
  setStaticNote(staticMode ? 'static' : zoomed ? 'text200' : null)
  timeline.setReducedMotion(MOTION_QUERY.matches)
  smooth.enabled = !MOTION_QUERY.matches
  if (staticMode) {
    stageLayer.style.display = 'none'
    win.el.classList.add('is-active')
    smooth.syncNow()
  } else {
    stageLayer.style.display = ''
  }
  measure()
  timeline.measure()
  layoutChapters()
  // 布局变了，画面必须重画：把停绘计时重新打开
  quiet = 0.12
  if (!staticMode) renderNow()
}

/** 文字缩放检测：浏览器字号变化会改变布局，需要重新测量 */
/**
 * 文字缩放检测：浏览器把「最小字号」或页面缩放调大时，根字号会变，
 * 布局随之改变。用一个不写死字号的探针元素量出这个变化。
 */
function watchTextZoom(): void {
  if (!document.body) return
  // 探针用 em 单位：它跟随继承来的字号，浏览器把最小字号调大时宽度随之变化。
  // 挂在 body 下，继承 body 的计算字号（body 没有显式 font-size 时跟随根字号）。
  const probe = h('span', {
    style: 'position:absolute;left:-9999px;top:0;visibility:hidden;line-height:1;font-size:1rem',
  })
  probe.textContent = '字'
  document.body.append(probe)
  let last = probe.getBoundingClientRect().width
  window.setInterval(() => {
    const w = probe.getBoundingClientRect().width
    if (Math.abs(w - last) > 0.4) {
      last = w
      // 16px 基准：宽度超过 19px 视为「明显放大」
      const zoomed = w > 19
      if (document.documentElement.classList.toggle('text-200', zoomed)) applyMode()
    }
  }, 500)
}

let resizeRaf = 0
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(applyMode)
}, { passive: true })

document.addEventListener('visibilitychange', () => {
  visibilityPaused = document.hidden
  // 回到前台：时间戳要重置，否则第一帧的 dt 会是整个后台时长
  if (!visibilityPaused) {
    lastTs = performance.now()
    quiet = 0.12
  }
})

MOTION_QUERY.addEventListener?.('change', applyMode)

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

const smooth = new SmoothScroll()
const timeline = new Timeline({ sectionHeight: 200, reducedMotion: MOTION_QUERY.matches })

applyMode()
smooth.attach()
timeline.start()
watchTextZoom()
requestAnimationFrame(frame)

if ('fonts' in document) {
  document.fonts.ready.then(() => {
    timeline.measure()
    measure()
    layoutChapters()
  })
}

// 调试与验证接口（截图脚本、几何校验、性能采样）
;(window as unknown as Record<string, unknown>).__scene = {
  model,
  stage,
  timeline,
  demo,
  goToChapter,
  probe: () => probeIdentity(model),
  /** 可滚动总距离：性能采样脚本按它把时间轴均分成 N 步 */
  maxScroll: () => timeline.totalScroll,
  setP: (p: number) => {
    timeline.applyImmediate(clamp01(p))
    smooth.syncNow()
    // 截图 / 校验脚本用：即使标签页被判定为隐藏也强制渲染一帧
    updateChapterUI(timeline.p)
    if (!staticMode) renderNow()
  },
  /** 在同一次渲染里读回层标签的屏幕位置（验证脚本用） */
  probeStack: () => {
    updateChapterUI(timeline.p)
    if (!staticMode) renderNow()
    const fr = win.frame.getBoundingClientRect()
    return {
      frame: { x: fr.left, y: fr.top, w: fr.width, h: fr.height },
      lastStack: stage.lastStack ? {
        layers: (['model', 'harness', 'agent'] as const).map((k) => ({ ...stage.lastStack!.layers[k] })),
        bounds: { left: stage.lastStack.left, top: stage.lastStack.top, width: stage.lastStack.width },
      } : null,
    }
  },
  stats: () => ({
    p: timeline.p,
    chapter: timeline.chapter,
    fps: timeline.fps,
    faces: stage.renderer.facesDrawn,
    labels: labelCount,
    embed: stage.state?.embed ?? 0,
    camScale: stage.cam.scale,
    staticMode,
    /** 实际提交到 Canvas 的累计帧数：与 rAF 请求数对比可验证停绘与后台暂停 */
    framesRendered,
    /** 停绘计时：> 0 表示仍在绘制，0 表示已静止 */
    quiet,
  }),
}
