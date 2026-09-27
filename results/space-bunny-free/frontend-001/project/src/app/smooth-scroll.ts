/* ==========================================================================
   平滑滚动
   ---------------------------------------------------------------------------
   不劫持 wheel（会破坏原生滚动惯性与键盘/触屏行为），改用一个
   帧预算的 rAF 回路把 scrollTop 推向目标值：
     · 每帧最多消耗 ~9ms，超过就顺延到下一帧，保证不掉帧
     · 目标值随原生滚动实时更新，所以快速反向同样跟手
     · 停止滚动后目标值不再变化，缓动自然收敛到 0，渲染随之停摆
   ========================================================================== */

export class SmoothScroll {
  target = 0
  current = 0
  enabled = true
  running = false
  private raf = 0
  private lastTs = 0
  private attached = false
  private onStop: (() => void) | null = null
  /** 最近一次由我们自己写回的 scrollY，用来识别自造滚动事件 */
  private lastApplied = -1

  attach(onStop?: () => void): void {
    if (this.attached) return
    this.attached = true
    this.onStop = onStop ?? null
    window.addEventListener('scroll', this.onScrollRef, { passive: true })
    window.addEventListener('resize', this.onResize, { passive: true })
    this.target = window.scrollY
    this.current = window.scrollY
  }

  private onResize = (): void => {
    this.target = window.scrollY
    this.current = window.scrollY
  }

  /** 让平滑滚动接管（导航跳转时用） */
  kick(toY: number): void {
    this.target = toY
    this.current = window.scrollY
    this.start()
  }

  /** 立即同步到浏览器滚动位置（用户手动滚动 / 关闭动效时） */
  syncNow(): void {
    this.stop()
    this.target = window.scrollY
    this.current = window.scrollY
  }

  private start(): void {
    if (this.running) return
    this.running = true
    this.lastTs = performance.now()
    const loop = (ts: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000)
      this.lastTs = ts
      this.step(dt)
      if (Math.abs(this.target - this.current) < 0.35) {
        this.current = this.target
        this.lastApplied = this.current
        window.scrollTo(0, this.current)
        this.running = false
        this.onStop?.()
        return
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private step(dt: number): void {
    if (!this.enabled) {
      this.current = this.target
      this.lastApplied = this.current
      window.scrollTo(0, this.current)
      return
    }
    // 帧率无关的指数缓动
    const k = 1 - Math.exp(-15 * dt)
    let next = this.current + (this.target - this.current) * k

    // 帧预算：本次最多走 1200px，超出则留给下一帧
    const delta = next - this.current
    const maxStep = 1200
    if (Math.abs(delta) > maxStep) next = this.current + Math.sign(delta) * maxStep

    this.current = next
    this.lastApplied = this.current
    window.scrollTo(0, this.current)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  detach(): void {
    this.stop()
    if (!this.attached) return
    this.attached = false
    window.removeEventListener('scroll', this.onScrollRef)
    window.removeEventListener('resize', this.onResize)
  }

  /**
   * 原生滚动事件：只在「不是我们自己写回的滚动」时接管目标值。
   * 否则动画每帧调用 window.scrollTo 都会把 target 拉回当前位置，缓动会卡死。
   */
  private onScrollRef = (): void => {
    if (this.running && Math.abs(window.scrollY - this.lastApplied) < 1.5) return
    this.target = window.scrollY
    this.current = window.scrollY
  }
}
