/* ==========================================================================
   滚动时间轴
   ---------------------------------------------------------------------------
   唯一真相：进度 p ∈ [0,1]。滚动只改 p；相机、每个物体的世界坐标、
   章节权重全部是 f(p)。所以：
     · 上滑必然沿原路径返回
     · 快速反向、停在中间，都只是重新求值同一个函数
     · 导航跳转 = 把 p 平滑推过去，主体不重建、不闪断
   另有一条独立的时钟只驱动 Harness 内部的执行信号（exec），
   它与滚动解耦，且 exec 是 t 的纯函数，所以「第 07 章来回滚」
   不会让执行流乱跳。
   ========================================================================== */

import { approach, clamp01 } from '../engine/math'

export type TimelineOptions = {
  /** 每个章节占的滚动高度（vh） */
  sectionHeight: number
  reducedMotion: boolean
  onChange?: (p: number) => void
}

export class Timeline {
  /** 渲染用进度（已平滑） */
  p = 0
  /** 滚动位置直接给出的进度（未平滑），用于计算差分速度 */
  rawP = 0
  /** 上一次的 p，用于判断滚动方向 */
  private prevRaw = 0
  /** 每秒滚动的进度变化（用于动效强度） */
  velocity = 0
  /** 距离上次有效滚动过去了多少秒 */
  idle = 99
  /** 导航跳转是否在进行 */
  private tween: { from: number; to: number; t: number; dur: number } | null = null
  private raf = 0
  private lastTs = 0
  private stopped = false
  reducedMotion: boolean
  private readonly opts: TimelineOptions
  private frames = 0
  private fpsAccum = 0
  private fpsWindow = 0
  /** 最近一次统计的帧率（仅在开启采样时有效） */
  fps = 0

  constructor(opts: TimelineOptions) {
    this.opts = opts
    this.reducedMotion = opts.reducedMotion
  }

  /**
   * 实际可滚动距离。取真实文档高度而不是常量：
   * p = 1 永远对应「页面最底」，章节在内容变多时不会被压缩。
   * 缓存并在 resize / 字体就绪后重算，避免每帧触发布局。
   */
  private scrollRange = 0

  get totalScroll(): number {
    if (this.scrollRange < 1) this.measure()
    return this.scrollRange
  }

  measure(): void {
    const doc = document.documentElement
    this.scrollRange = Math.max(1, doc.scrollHeight - window.innerHeight)
  }

  start(): void {
    this.measure()
    this.readScroll()
    this.p = this.rawP
    this.prevRaw = this.rawP
    this.lastTs = performance.now()
    const loop = (ts: number) => {
      if (this.stopped) return
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000)
      this.lastTs = ts
      this.tick(dt)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.stopped = true
    cancelAnimationFrame(this.raf)
  }

  private readScroll(): void {
    this.rawP = clamp01(window.scrollY / this.totalScroll)
  }

  /** 导航跳转：把 p 平滑推到目标，途中仍然按同一函数渲染主体 */
  scrollTo(targetP: number, durMs = 900): void {
    const to = clamp01(targetP)
    if (this.reducedMotion) {
      this.applyImmediate(to)
      return
    }
    this.tween = { from: this.p, to, t: 0, dur: durMs / 1000 }
  }

  /** 直接把 p 写到位（导航跳转、截图脚本、减少动态时使用） */
  applyImmediate(p: number): void {
    this.measure()
    const y = p * this.totalScroll
    window.scrollTo(0, y)
    this.p = p
    this.rawP = p
    this.prevRaw = p
    this.tween = null
    this.opts.onChange?.(p)
  }

  private tick(dt: number): void {
    this.readScroll()

    if (this.tween) {
      this.tween.t += dt
      const k = clamp01(this.tween.t / this.tween.dur)
      // easeInOutCubic：起步与收尾都慢，主体不会「弹」
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      this.p = this.tween.from + (this.tween.to - this.tween.from) * e
      window.scrollTo(0, this.p * this.totalScroll)
      if (k >= 1) this.tween = null
    } else if (this.reducedMotion) {
      this.p = this.rawP
    } else {
      // 目标位置直接跟随滚动（避免「追赶」造成的迟滞感），
      // 平滑只作用在相机这一层由渲染器处理。
      this.p = this.rawP
    }

    const dRaw = this.rawP - this.prevRaw
    const dv = dRaw / Math.max(1e-4, dt)
    this.prevRaw = this.rawP
    this.velocity = approach(this.velocity, Math.abs(dv), 12, dt)
    this.idle = Math.abs(dRaw) > 1e-6 || this.tween ? 0 : this.idle + dt

    // 帧率采样（默认不开启，避免无意义计算）
    this.frames++
    this.fpsAccum += dt
    if (this.fpsAccum >= 0.5) {
      this.fps = this.frames / this.fpsAccum
      this.frames = 0
      this.fpsAccum = 0
      this.fpsWindow++
    }

    this.opts.onChange?.(this.p)
  }

  /** 当前章节索引（0..7） */
  get chapter(): number {
    return Math.min(7, Math.floor(this.p * 8 + 0.0001))
  }

  /** 章节内进度 0..1 */
  get chapterProgress(): number {
    return (this.p * 8) % 1
  }

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v
  }
}
