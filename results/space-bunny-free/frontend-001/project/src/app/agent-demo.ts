/* ==========================================================================
   Agent 窗口演示控制器
   ---------------------------------------------------------------------------
   明确的本地演示：不调用任何真实模型，不访问任何外部 API。
   「重放任务」真实推进四步状态 → 驱动框架里的执行信号 → 产出结果。
   · 停止：立即定格当前步骤，可再次运行
   · 重新运行不产生重复执行：run 期间再次触发 run 会被忽略
   · 运行中禁用下载，完成后启用
   · 「下载简报」生成真实可打开的 Markdown 文件（Blob + <a download>）
   ========================================================================== */

import { DEMO } from '../content/chapters'

export type StepState = 'pending' | 'running' | 'done'

export type RunState = 'idle' | 'running' | 'stopped' | 'done'

export type DemoSnapshot = {
  run: RunState
  steps: StepState[]
  /** 正在执行的步骤索引（-1 表示没有） */
  active: number
  /** 执行进度 0..1：驱动框架里的流动信号与进度条 */
  progress: number
  /** 结果是否可下载 */
  downloadable: boolean
  /** 已完成的完整运行次数（用于验证「重新运行不产生重复执行」） */
  completions: number
}

const STEP_MS = 1150

export class AgentDemo {
  private startedAt = 0
  private state: DemoSnapshot = {
    run: 'idle',
    steps: DEMO.steps.map(() => 'pending' as StepState),
    active: -1,
    progress: 0,
    downloadable: false,
    completions: 0,
  }
  private listeners = new Set<(s: DemoSnapshot) => void>()
  /** 本次运行的令牌：重新运行时递增，旧循环的回调会被丢弃 */
  private runToken = 0

  on(fn: (s: DemoSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn({ ...this.state, steps: [...this.state.steps] })
  }

  get snapshot(): DemoSnapshot {
    return this.state
  }

  /** 是否有任务在跑 */
  get isRunning(): boolean {
    return this.state.run === 'running'
  }

  /**
   * 开始 / 重新运行。
   * 幂等：已经在跑时直接返回 false，不排第二个循环。
   */
  start(now: number): boolean {
    if (this.state.run === 'running') return false
    this.runToken++
    const token = this.runToken
    this.state = {
      ...this.state,
      run: 'running',
      steps: this.state.steps.map(() => 'pending' as StepState),
      active: 0,
      progress: 0,
      downloadable: false,
    }
    this.state.steps[0] = 'running'
    this.startedAt = now
    this.emit()
    this.schedule(now, token)
    return true
  }

  /** 停止：定格在当前步骤 */
  stop(): void {
    if (this.state.run !== 'running') return
    this.runToken++
    const active = this.state.active
    this.state = {
      ...this.state,
      run: 'stopped',
      // 当前步骤保持 running（表示「被打断在这里」），其余回到 pending
      steps: this.state.steps.map((step, i) => (i < active + 1 ? step : 'pending')),
      progress: this.state.progress,
    }
    this.emit()
  }

  reset(): void {
    this.runToken++
    this.state = {
      run: 'idle',
      steps: DEMO.steps.map(() => 'pending' as StepState),
      active: -1,
      progress: 0,
      downloadable: false,
      completions: this.state.completions,
    }
    this.emit()
  }

  private schedule(_now: number, token: number): void {
    window.setTimeout(() => this.tick(token), 16)
  }

  private tick(token: number): void {
    if (token !== this.runToken) return // 旧循环已被取代
    const now = performance.now()
    const s = this.state
    if (s.run !== 'running') return

    const total = STEP_MS * DEMO.steps.length
    const t = (now - this.startedAt) / total
    const progress = Math.min(1, Math.max(0, t))
    const nextActive = Math.min(DEMO.steps.length - 1, Math.floor(progress * DEMO.steps.length))

    const steps = s.steps.map((_prev, i) => {
      if (i < nextActive) return 'done' as StepState
      if (i === nextActive) return progress >= 1 ? ('done' as StepState) : ('running' as StepState)
      return 'pending' as StepState
    })

    if (progress >= 1) {
      this.state = {
        ...s,
        run: 'done',
        steps: DEMO.steps.map(() => 'done' as StepState),
        active: -1,
        progress: 1,
        downloadable: true,
        completions: s.completions + 1,
      }
      this.emit()
      return
    }

    this.state = { ...s, steps, active: nextActive, progress }
    this.emit()
    this.schedule(now, token)
  }
}

// ---------------------------------------------------------------------------
// 简报 Markdown：真实可打开的文件
// ---------------------------------------------------------------------------

export function buildBriefMarkdown(): string {
  const r = DEMO.required_result
  const lines: string[] = []
  lines.push(`# ${r.title}`)
  lines.push('')
  lines.push(`- 任务编号：\`${DEMO.task_id}\``)
  lines.push(`- 任务：${DEMO.request}`)
  lines.push(`- 来源资料：${DEMO.attachments.map((a) => `\`${a.filename}\``).join('、')}`)
  lines.push('')
  lines.push('## 进展')
  lines.push('')
  lines.push(r.progress)
  lines.push('')
  lines.push('## 待办')
  lines.push('')
  for (const s of r.next_steps) lines.push(`- [ ] ${s}`)
  lines.push('')
  lines.push('## 资料原文')
  lines.push('')
  for (const a of DEMO.attachments) {
    lines.push(`### ${a.filename}`)
    lines.push('')
    lines.push(a.content)
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push('本文件由前端本地演示生成，未调用任何真实模型或外部接口。')
  lines.push('')
  return lines.join('\n')
}

export function downloadBrief(): void {
  const md = buildBriefMarkdown()
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '项目进展简报.md'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 立刻 revoke 在部分浏览器会中断下载，延后释放
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
