/* ==========================================================================
   DOM 构建
   ---------------------------------------------------------------------------
   所有动态界面都在这里生成。结构本身是语义化的（nav / article / section /
   list / button），关闭 JavaScript 时由 <noscript> 提供八章的可读文案。
   ========================================================================== */

import { CHAPTERS, SERVICES, DEMO } from '../content/chapters'
import { DIAGRAMS } from './diagrams'

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else el.setAttribute(k, v)
  }
  for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return el
}

// ---------------------------------------------------------------------------
// 顶栏与导航
// ---------------------------------------------------------------------------

export function buildTopbar(): {
  el: HTMLElement
  nav: HTMLElement
  progress: HTMLElement
} {
  const nav = h('nav', { class: 'nav', 'aria-label': '阶段导航' })
  CHAPTERS.forEach((c, i) => {
    const b = h('button', {
      class: 'nav__item',
      type: 'button',
      'data-index': String(i),
      'data-chapter': c.id,
    })
    b.append(h('span', { class: 'nav__num', text: String(i + 1).padStart(2, '0') }))
    b.append(document.createTextNode(c.nav))
    nav.append(b)
  })

  const brand = h('div', { class: 'brand' }, [
    h('span', { class: 'brand__mark', text: '从芯片到 Agent' }),
    h('span', { class: 'brand__sub tech', text: 'Chip → Agent' }),
  ])

  const progress = h('div', {
    class: 'progress',
    role: 'progressbar',
    'aria-label': '阅读进度',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
  }, [h('div', { class: 'progress__bar' })])

  const inner = h('div', { class: 'topbar__inner' }, [brand, nav])
  const el = h('header', { class: 'topbar' }, [inner, progress])
  return { el, nav, progress }
}

// ---------------------------------------------------------------------------
// 章节
// ---------------------------------------------------------------------------

function blockHead(labelCn: string, labelEn: string): HTMLElement {
  return h('div', { class: 'block__head' }, [
    h('span', { class: 'label-cn', text: labelCn }),
    h('span', { class: 'label tech', text: labelEn }),
    h('hr', { class: 'rule' }),
  ])
}

export function buildChapter(c: typeof CHAPTERS[number], i: number): HTMLElement {
  const title = h('h2', { class: 'chapter__title t-h1', id: `ch-${c.id}` })
  c.title.forEach((line) => {
    title.append(h('span', { text: line }))
  })

  const kicker = h('div', { class: 'chapter__kicker' }, [
    h('span', { class: 'label-cn', text: c.kicker }),
    h('span', { class: 'label tech', text: c.kickerEn }),
    h('hr', { class: 'rule' }),
  ])

  const rail = h('div', { class: 'chapter__rail' }, [
    h('div', { class: 'chapter__head' }, [
      kicker,
      title,
      h('p', { class: 'chapter__lead t-lead', text: c.lead }),
    ]),
  ])

  // 静态示意图（小屏 / 阅读模式 / 文字放大）
  const dg = DIAGRAMS[c.id]
  if (dg) {
    rail.append(
      h('figure', { class: 'diagram diagram--live' }, [dg.node(), h('figcaption', { text: dg.caption })]),
    )
  }

  // 能力项
  const caps = h('ul', { class: 'caps' })
  c.caps.items.forEach((t) => caps.append(h('li', { text: t })))
  rail.append(h('div', { class: 'block' }, [blockHead('能力项', 'Capabilities'), caps]))

  // 交付内容
  const del = h('ul', { class: 'deliver' })
  c.deliver.forEach((t, k) => {
    del.append(h('li', {}, [h('span', { class: 'mono', text: `D${k + 1}` }), h('span', { text: t })]))
  })
  rail.append(h('div', { class: 'block' }, [blockHead('交付内容', 'Deliverables'), del]))

  if (c.callout) {
    rail.append(h('p', { class: 'callout', text: c.callout }))
  }

  // 滚动提示：属于文字轨，不参与无障碍树
  if (i < CHAPTERS.length - 1) {
    rail.append(
      h('div', { class: 'scroll-hint', 'aria-hidden': 'true' }, [
        h('span', { text: i === 0 ? '向下滚动' : '继续向下' }),
        h('span', { class: 'scroll-hint__arrow' }),
      ]),
    )
  }

  const section = h('article', {
    class: 'chapter',
    id: `chapter-${c.id}`,
    'data-index': String(i),
    'aria-labelledby': `ch-${c.id}`,
  }, [rail])
  return section
}

// ---------------------------------------------------------------------------
// Agent 窗口
// ---------------------------------------------------------------------------

export type AgentWindowRefs = {
  el: HTMLElement
  runarea: HTMLElement
  steps: HTMLElement
  progressFill: HTMLElement
  progressPct: HTMLElement
  progressTrack: HTMLElement
  result: HTMLElement
  btnReplay: HTMLButtonElement
  btnStop: HTMLButtonElement
  btnDownload: HTMLButtonElement
  status: HTMLElement
  statusText: HTMLElement
  stackLabels: Record<'model' | 'harness' | 'agent', HTMLElement>
  frame: HTMLElement
}

export function buildAgentWindow(): AgentWindowRefs {
  // 资料 / 任务
  const requestBox = h('div', { class: 'request', text: DEMO.request })
  const attaches = DEMO.attachments.map((a) =>
    h('div', { class: 'attach' }, [
      h('div', { class: 'attach__name' }, [
        h('span', { text: '▤' }),
        h('span', { text: a.filename }),
      ]),
      h('div', { class: 'attach__body', text: a.content }),
    ]),
  )
  const paneTask = h('div', { class: 'pane', 'data-pane': 'task' }, [
    h('div', { class: 'pane__head' }, [
      h('span', { class: 'label-cn', text: '资料 / 任务' }),
      h('span', { class: 'label tech', text: 'Input' }),
      h('hr', { class: 'rule' }),
    ]),
    h('div', {}, [h('div', { class: 'label', text: '请求' }), requestBox]),
    h('div', {}, [h('div', { class: 'label', text: `附件 · ${DEMO.attachments.length}` }), ...attaches]),
  ])

  // 运行区（四层结构落在这里）
  const frame = h('div', { class: 'runarea__frame' })
  const runarea = h('div', { class: 'runarea' }, [
    h('div', { class: 'pane__head', style: 'padding: 0 0 8px;' }, [
      h('span', { class: 'label-cn', text: '原四层结构' }),
      h('span', { class: 'label tech', text: 'Runtime stack' }),
      h('hr', { class: 'rule' }),
    ]),
    frame,
    h('p', {
      class: 'runarea__hint',
      text: '集群层 / 模型层 / Harness 层 / Agent 层 —— 由同一时间轴送入本窗口。反向滚动可还原。',
    }),
  ])

  const stackLabels = {
    model: h('div', { class: 'stacklabel' }, [h('b', { text: '模型层' }), h('span', { text: 'Serving' })]),
    harness: h('div', { class: 'stacklabel' }, [h('b', { text: 'Harness 层' }), h('span', { text: 'Framework' })]),
    agent: h('div', { class: 'stacklabel' }, [h('b', { text: 'Agent 层' }), h('span', { text: 'App' })]),
  }
  Object.values(stackLabels).forEach((el) => frame.append(el))

  // 执行步骤
  const stepsList = h('ol', { class: 'steps' })
  DEMO.steps.forEach((s, i) => {
    stepsList.append(
      h('li', { class: 'step', 'data-state': 'pending', 'data-index': String(i) }, [
        h('span', { class: 'step__dot', text: String(i + 1) }),
        h('span', { class: 'step__name', text: s }),
        h('span', { class: 'step__state', text: '待执行' }),
      ]),
    )
  })

  const progressFill = h('div', { class: 'progressline__fill' })
  const progressPct = h('span', { class: 'progressline__pct tech', text: '0%' })
  const progressTrack = h('div', {
    class: 'progressline__track',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
    'aria-label': '任务执行进度',
  }, [progressFill])

  const paneSteps = h('div', { class: 'pane', 'data-pane': 'steps' }, [
    h('div', { class: 'pane__head' }, [
      h('span', { class: 'label-cn', text: '执行步骤' }),
      h('span', { class: 'label tech', text: 'Steps' }),
      h('hr', { class: 'rule' }),
    ]),
    stepsList,
    h('div', { class: 'progressline' }, [progressTrack, progressPct]),
  ])

  // 结果
  const result = h('div', { class: 'result', 'data-state': 'empty' })
  const paneResult = h('div', { class: 'pane', 'data-pane': 'result' }, [
    h('div', { class: 'pane__head' }, [
      h('span', { class: 'label-cn', text: '结果' }),
      h('span', { class: 'label tech', text: 'Result' }),
      h('hr', { class: 'rule' }),
    ]),
    result,
  ])

  // 操作栏
  const btnReplay = h('button', { class: 'btn btn--primary', type: 'button' }, [
    document.createTextNode('重放任务'),
  ]) as HTMLButtonElement
  const btnStop = h('button', { class: 'btn', type: 'button' }, [document.createTextNode('停止')]) as HTMLButtonElement
  const btnDownload = h('button', { class: 'btn btn--accent', type: 'button' }, [
    document.createTextNode('下载简报'),
  ]) as HTMLButtonElement
  btnReplay.setAttribute('aria-describedby', 'demo-note')
  btnDownload.setAttribute('aria-describedby', 'demo-note')

  const statusText = h('span', { text: '待运行' })
  const statusDot = h('span', { class: 'status__dot', 'data-run': 'idle' })
  const status = h('div', { class: 'actionbar__status' }, [
    statusDot,
    statusText,
  ])

  const actionbar = h('div', { class: 'actionbar' }, [
    btnReplay, btnStop, btnDownload,
    h('p', {
      id: 'demo-note',
      class: 'visually-hidden',
      text: '本地演示：不调用真实模型或外部 API。运行中不能下载，重放不会重复执行。',
    }),
    h('div', { class: 'actionbar__status' }, [status]),
  ])

  const el = h('section', {
    class: 'agent-window',
    'aria-label': 'Agent 演示窗口',
  }, [
    h('div', { class: 'agent-window__head' }, [
      h('span', { class: 'agent-window__title', text: 'Agent 应用 · 本地演示' }),
      h('span', { class: 'agent-window__task', text: DEMO.task_id }),
      h('span', { class: 'demo-badge', text: '本地演示 · 无外部调用' }),
    ]),
    h('div', { class: 'agent-window__body' }, [paneTask, runarea, paneSteps, paneResult]),
    actionbar,
  ])

  return {
    el, runarea, steps: stepsList, progressFill, progressPct, progressTrack,
    result, btnReplay, btnStop, btnDownload, status, statusText, stackLabels, frame,
  }
}

// ---------------------------------------------------------------------------
// 服务总结
// ---------------------------------------------------------------------------

export function buildSummary(): HTMLElement {
  const grid = h('div', { class: 'summary__grid' })
  for (const s of SERVICES) {
    grid.append(
      h('article', { class: 'service' }, [
        h('div', { class: 'service__n', text: s.n }),
        h('h3', { class: 'service__title', text: s.title }),
        h('div', { class: 'service__en tech', text: s.en }),
        h('p', { class: 'service__body', text: s.body }),
        h('p', { class: 'service__deliver' }, [
          h('span', { class: 'label', text: '交付　' }),
          h('span', { text: s.deliver }),
        ]),
      ]),
    )
  }

  return h('section', { class: 'summary', id: 'services' }, [
    h('div', { class: 'summary__inner' }, [
      h('div', { class: 'summary__head' }, [
        h('div', { class: 'label', text: '服务' }),
        h('h2', { class: 't-h1', style: 'margin-top:12px;' }, [
          h('span', { text: '三件事，' }),
          h('br'),
          h('span', { text: '从算力到可用的应用' }),
        ]),
        h('p', {
          class: 't-lead',
          style: 'margin-top:20px;',
          text: '我们提供的服务覆盖下面三段。它们串起来是一条完整链路：没有算力谈不上部署，没有执行框架谈不上应用。',
        }),
      ]),
      grid,
      h('div', { class: 'footer' }, [
        h('p', {
          text: '本页为工程演示：主体是一镜到底的连续装配动画，Agent 窗口内为本地演示，不调用真实模型或外部接口。',
        }),
        h('p', { class: 'tech', text: 'Built with Vite + TypeScript · Canvas 2D isometric renderer' }),
      ]),
    ]),
  ])
}

export { h }
