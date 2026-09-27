/* ==========================================================================
   舞台：把相机、场景、标注、Agent 窗口绑在一起
   ---------------------------------------------------------------------------
   核心不变量：Canvas 主体与 DOM 文字使用完全同一套相机矩阵，
   所以标注永远贴在它所属的物体上；窗口内滚动时标注跟随，
   反向滚动时主体从窗口里还原成原来的层级。
   ========================================================================== */

import {
  createCamera, updateCamera, projectExtents, cameraBasis,
  lerp, v3, type Camera, type Vec3,
} from '../engine/math'
import { Renderer, worldToCanvas, localToCanvas } from '../engine/render2d'
import { P, alpha } from '../engine/palette'
import type { SceneObject } from '../engine/scene'
import { updateAssembly, detailFor, type AssemblyModel, type PhaseState } from '../scene/assembly'
import {
  drawChip, drawCard, drawServer, drawRack, drawStratumFrame,
  drawModelStratum, drawHarnessStratum, drawAgentStratum,
} from '../scene/objects'
import { STRATUM_HALF } from '../scene/assembly'

export type LabelLayer = 'assembly' | 'cluster' | 'model' | 'harness' | 'agent'

export type LabelAnchor = {
  key: string
  layer: LabelLayer
  title: string
  sub: string
  /** 世界坐标锚点（已换算成屏幕像素） */
  x: number
  y: number
  /** 0..1 显隐权重 */
  a: number
  strong: boolean
}

export type StackBox = {
  layers: Record<'model' | 'harness' | 'agent', { x: number; y: number }>
  left: number
  top: number
  width: number
  height: number
  /** 四层结构是否已完全进入窗口运行区 */
  embedded: boolean
}

export type Rect = { x: number; y: number; w: number; h: number }

export type RenderInput = {
  p: number
  exec: number
  /** Agent 窗口运行区（视口 CSS 像素坐标）；null = 不做窗口变形 */
  windowRect: Rect | null
  onLabels: (labels: LabelAnchor[], stack: StackBox | null) => void
}

export class Stage {
  readonly canvas: HTMLCanvasElement
  readonly renderer: Renderer
  readonly cam: Camera = createCamera()
  readonly model: AssemblyModel
  state!: PhaseState

  vw = 0
  vh = 0
  /** 舞台在视口内可用的矩形（CSS 像素） */
  stage: Rect = { x: 0, y: 0, w: 100, h: 100 }

  private labels: LabelAnchor[] = []
  private stack: StackBox | null = null
  /** 最近一次窗口变形的包围盒（供验证脚本在同一帧内读取） */
  lastStack: StackBox | null = null
  private detail = 1
  private quality: 'low' | 'high' = 'high'

  constructor(canvas: HTMLCanvasElement, model: AssemblyModel) {
    this.canvas = canvas
    this.renderer = new Renderer(canvas)
    this.model = model
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.vw = cssW
    this.vh = cssH
    this.renderer.resize(cssW, cssH, dpr)
  }

  setQuality(q: 'low' | 'high'): void {
    this.renderer.quality = q
    this.quality = q
  }

  render(input: RenderInput): void {
    const st = updateAssembly(this.model, input.p, input.exec)
    this.state = st

    // ---------------- 相机 ----------------
    const cam = this.cam
    cam.dolly = st.dolly
    const sw = Math.max(160, this.stage.w)
    const sh = Math.max(160, this.stage.h)
    const ox = this.stage.x + sw / 2
    const oy = this.stage.y + sh / 2

    // 主体投影包围盒
    const ext = projectExtents(cam, st.extents)
    // 最小世界尺寸：第一章只有一颗芯片参与构图，但周围还有等待装配的板卡 /
    // 服务器 / 机柜。给一个下限把它们一并框进画面，而不是让它们被裁在角落。
    // 上限由 maxScale 兜住，所以「一镜到底」在任何视口下比例都一致。
    const cw = Math.max(ext.w * 1.26, 2.4)
    const ch = Math.max(ext.h * 1.36, 1.8)
    const fit = (): void => {
      updateCamera(cam, sw, sh, ox, oy, cw, ch, 6, 300)
    }
    // 注视点 = 关键帧的意图焦点 + 构图中心的限幅修正。
    // 修正量被夹在包围盒尺寸的 22% 以内：足够跟随正在装配的部件，
    // 又不会把主体推到画外。
    // 注视点 = 构图重心（已落位权重 1、正在飞权重 0.45），
    // 所以主体永远在画面中央偏内，不会被装配过程推走。
    cam.target = v3(st.centroid.x, st.centroid.y, st.centroid.z)
    fit()

    const r = this.renderer
    r.begin(cam)
    // 细节档：主体在屏幕上越小，越多细碎几何是纯开销
    this.detail = detailFor(ext.h, cam.scale) * (this.quality === 'low' ? 0.5 : 1)

    const m = this.model
    const s = st

    // ---------------- 窗口变形（必须在绘制之前） ----------------
    // 四层结构要先被送进 Agent 窗口的运行区，绘制才会用变形后的矩阵，
    // 否则画出来的是变形前的位置（看不到）。
    this.stack = this.applyWindowMorph(st, input.windowRect)
    this.lastStack = this.stack

    // ---------------- 绘制（画家算法：远的先画） ----------------
    // 层在集群上方，深度更远 → 先画
    if (s.rise > 0.002) {
      for (const k of ['model', 'harness', 'agent'] as const) {
        drawStratumFrame(r, m.strata[k], 1, this.detail, k)
      }
      drawModelStratum(r, m.strata.model, 1, this.detail)
      drawHarnessStratum(r, m.strata.harness, 1, this.detail, input.exec)
      drawAgentStratum(r, m.strata.agent, 1, this.detail)
    }

    // 进入 Agent 窗口后，装配链已经在章节里讲完了；
    // 运行区只留四层结构，不画下面的机器，避免运行区里出现无关物体。
    if (s.embed < 0.5) {
      // 机柜：同伴先画（原机柜在最前）
      for (const peer of m.peers) drawRack(r, peer, 1, this.detail, false)
      drawRack(r, m.rackA, 1, this.detail, true)

      // 服务器 → 板卡 → 芯片：同一棵子树，遮挡真实发生
      drawServer(r, m.server, 1, this.detail)
      drawCard(r, m.card, 1, this.detail)
      drawChip(r, m.chip, 1, this.detail)

      // ---------------- 执行流 ----------------
      if (s.w[6] > 0.01 && input.exec > 0.001) {
        this.drawExecFlow(cam, input.exec)
      }
    }

    // ---------------- 标注（与主体共用相机） ----------------
    this.buildLabels(st, input.p, cam)
    r.end()
    input.onLabels(this.labels, this.stack)
  }

  // -------------------------------------------------------------------------

  /**
   * 执行流：一条连续折线，信号沿它流动（模型 ↔ 工具 ↔ 反馈）。
   * 不是跳动的图标 —— 每一帧信号都在路径上的连续位置。
   */
  private drawExecFlow(cam: Camera, exec: number): void {
    const r = this.renderer
    const o = this.model.strata.harness

    // 平面内的主回路
    const ring: [number, number, number][] = [
      [-2.25, 0.12, -0.70],   // 上下文
      [-0.95, 0.12, -0.20],
      [0, 0.12, 0],           // 中心执行场
      [0.95, 0.12, 0.20],
      [2.25, 0.12, -0.70],    // 状态
      [1.30, 0.12, 0.80],
      [0, 0.12, 0.62],
      [-1.30, 0.12, 0.80],
      [-2.25, 0.12, 0.80],    // 工具
    ]
    // 到模型层的下行支路
    const down: [number, number, number][] = [
      [-0.55, 0.12, 0.30],
      [-0.55, -1.10, 0.16],
      [-1.05, -2.34, 0],
    ]
    // 回到 Harness 的上行支路
    const back: [number, number, number][] = [
      [-1.30, -2.34, 0],
      [-0.58, -1.10, 0.22],
      [-0.52, 0.14, 0.40],
    ]

    // 基线轨迹（淡）
    for (let i = 0; i < ring.length - 1; i++) {
      r.line3(o.world, v3(ring[i][0], ring[i][1], ring[i][2]), v3(ring[i + 1][0], ring[i + 1][1], ring[i + 1][2]), P.green, 1.1, 0.22)
    }
    for (let i = 0; i < down.length - 1; i++) {
      r.line3(o.world, v3(down[i][0], down[i][1], down[i][2]), v3(down[i + 1][0], down[i + 1][1], down[i + 1][2]), P.green, 1.1, 0.18)
    }
    for (let i = 0; i < back.length - 1; i++) {
      r.line3(o.world, v3(back[i][0], back[i][1], back[i][2]), v3(back[i + 1][0], back[i + 1][1], back[i + 1][2]), P.green, 1.1, 0.18)
    }

    // 流动的信号：三枚拖尾，沿主回路循环
    const spanRing = ring.length - 1
    for (let k = 0; k < 3; k++) {
      const t = ((exec * 0.34 + k / 3) % 1) * spanRing
      emitSignal(r, cam, o, ring, t, 1 - k * 0.28)
    }
    // 支路信号交替
    const ph = (exec * 0.9) % 2
    emitSignal(r, cam, o, ph < 1 ? down : back, ph < 1 ? ph : ph - 1, 0.9)
  }

  // -------------------------------------------------------------------------

  /**
   * 四层结构进入 Agent 窗口。
   * 做法：对每一层求一个「目标世界坐标」，使它投影到运行区里对应的槽位；
   * 再用 embed 插值。目标是从窗口的屏幕矩形反解出来的，所以视觉位置连续；
   * 反向滚动时同一个函数反向求值，结构就从窗口里还原出来。
   */
  private applyWindowMorph(st: PhaseState, windowRect: Rect | null): StackBox | null {
    if (!windowRect) return null
    const em = st.embed
    if (em <= 0.001) return null

    const cam = this.cam
    const m = this.model
    const keys = ['model', 'harness', 'agent'] as const

    // 运行区目标矩形
    const rx = windowRect.x + windowRect.w * 0.08
    const ry = windowRect.y + windowRect.h * 0.08
    const rw = windowRect.w * 0.84
    const rh = windowRect.h * 0.52
    const cx = rx + rw / 2
    const t = em * em * (3 - 2 * em)

    // 缩到能在运行区里放下：平台宽 STRATUM_HALF.w * 2，运行区可用宽度 rw
    // 求每一层的「目标世界坐标」，使它投影到运行区的对应槽位。
    //
    // 正交投影：worldToCanvas 用的是视图矩阵 cam.view = [R | -R·eye]。
    // 我们要 world 点 W 满足
    //   right·(W - eye) = (sx - ox)/scale      （横向）
    //   up·(W - eye)    = (oy - sy)/scale      （纵向，屏幕 Y 翻转）
    // 深度 fwd·(W - eye) 自由，取一个固定值以保持三层透视一致。
    // 这里直接从 cam.view 读出 eye（与渲染用的是同一份矩阵），
    // 避免用可能滞后一帧的 cam.eye 造成半帧偏差。
    const basis = cameraBasis(cam)
    // 先求出「当前注视点」在屏幕上的真实位置（与渲染用同一个 worldToCanvas），
    // 再以它为原点做偏移。这样不依赖 ox/oy 的内部约定，
    // 也保证求解与渲染用的是同一套矩阵。
    // cluster 转到正俯视：进入窗口的结构不再沿用主舞台的偏航
    m.cluster.ry = 0
    m.root.updateWorld()

    // 注视点在屏幕上的真实位置（用与渲染相同的 worldToCanvas 取得）
    const anchor = worldToCanvas(cam, cam.target)
    const wantScale = (rw * 0.95) / (STRATUM_HALF.w * 2 * cam.scale)
    // 深度：直接取注视点深度，三层一致；正交投影下深度只影响前后次序，
    // 不影响屏幕上的横向位置，所以这一项只需要保证三者相同。
    const depth = 0

    keys.forEach((k, i) => {
      const o = m.strata[k]
      const dR = (cx - anchor.x) / cam.scale
      const dU = (anchor.y - (ry + ((i + 0.5) / 3) * rh)) / cam.scale
      const world = v3(
        cam.target.x + basis.right.x * dR + basis.up.x * dU + basis.fwd.x * depth,
        cam.target.y + basis.right.y * dR + basis.up.y * dU + basis.fwd.y * depth,
        cam.target.z + basis.right.z * dR + basis.up.z * dU + basis.fwd.z * depth,
      )
      // 关键：窗口运行区里，cluster 与层都用「正俯视」姿态。
      // 先把 cluster 的偏航清掉再换算，否则一个纯粹竖直的层间距
      // 会因 cluster 的 0.30 rad 偏航投影成斜的（屏幕上左右漂）。
      o.ry = 0
      o.rx = 0.10
      o.scale = wantScale
      const local = m.cluster.worldToLocal(world)
      o.targetPos = v3(local.x, local.y, local.z)
    })


    // 从「未变形」的位置插到目标：视觉位置连续，反向滚动即沿原路返回
    keys.forEach((k) => {
      const o = m.strata[k]
      o.pos = v3(
        lerp(o.homePos.x, o.targetPos.x, t),
        lerp(o.homePos.y, o.targetPos.y, t),
        lerp(o.homePos.z, o.targetPos.z, t),
      )
    })
    m.root.updateWorld()

    const layers = {} as StackBox['layers']
    let left = Infinity, top = Infinity, maxX = -Infinity, bottom = -Infinity
    for (const k of keys) {
      const o = m.strata[k]
      const c = worldToCanvas(cam, o.worldPos)
      layers[k] = c
      const hw = STRATUM_HALF.w * 2 * o.accumulatedScale()
      const l = worldToCanvas(cam, o.worldPosOf(v3(-hw / 2, 0, 0))).x
      const rightX = worldToCanvas(cam, o.worldPosOf(v3(hw / 2, 0, 0))).x
      left = Math.min(left, l)
      maxX = Math.max(maxX, rightX)
      top = Math.min(top, c.y - 4)
      bottom = Math.max(bottom, c.y + 4)
    }
    return {
      layers, left, top, width: maxX - left, height: bottom - top,
      embedded: em > 0.985,
    }
  }

  // -------------------------------------------------------------------------

  private buildLabels(st: PhaseState, p: number, cam: Camera): void {
    const L = this.labels
    L.length = 0
    const m = this.model
    const pz = 1 - st.embed
    void p

    const add = (
      key: string, layer: LabelLayer, title: string, sub: string,
      o: SceneObject, local: Vec3, a: number, strong = false,
    ): void => {
      if (a <= 0.03) return
      const w = o.worldPosOf(local)
      const s = worldToCanvas(cam, w)
      L.push({ key, layer, title, sub, x: s.x, y: s.y, a: Math.min(1, a), strong })
    }

    add('chip', 'assembly', '芯片 0', 'CHIP', m.chip, v3(0, 0.10, 0), st.w[0] * pz, true)
    add('card', 'assembly', '加速卡', 'BOARD', m.card, v3(0.34, 0.14, 0.20), st.w[1] * pz)
    add('server', 'assembly', '服务器', 'SERVER', m.server, v3(0.52, 0.26, 0.72), st.w[2] * pz)
    add('rackA', 'cluster', '机柜 A', 'RACK A', m.rackA, v3(0, 1.42, 0), Math.max(st.w[3] * pz, st.w[4] * pz))
    add('peers', 'cluster', '同集群机柜', 'PEER RACKS', m.cluster, v3(-1.7, 1.42, -0.7), st.w[4] * pz)

    const sa = Math.min(1, st.rise)
    add('smodel', 'model', '模型层', '推理服务', m.strata.model, v3(2.55, 0.24, 0.55), st.w[5] * pz * sa)
    add('sharness', 'harness', 'Harness 层', '上下文 · 工具 · 状态 · 执行控制', m.strata.harness, v3(2.85, 0.24, 0.55), st.w[6] * pz * sa)
    add('sagent', 'agent', 'Agent 层', '业务应用', m.strata.agent, v3(2.55, 0.24, 0.55), st.w[7] * pz * sa)
  }
}

// ---------------------------------------------------------------------------

/** 沿折线取位置并画一枚流动的信号 */
function emitSignal(
  r: Renderer, cam: Camera, o: SceneObject, path: [number, number, number][], t: number, a: number,
): void {
  const n = path.length - 1
  if (t <= 0 || t >= n) return
  const i = Math.min(n - 1, Math.floor(t))
  const f = t - i
  const a0 = path[i], b0 = path[i + 1]
  const local = v3(lerp(a0[0], b0[0], f), lerp(a0[1], b0[1], f), lerp(a0[2], b0[2], f))
  const s = localToCanvas(o.world, cam, local)
  r.circleScreen(s.x, s.y, 3.2, P.greenBright, null, 0, 0.95 * a)
  r.circleScreen(s.x, s.y, 6.4, null, alpha(P.greenBright, 0.55), 1, 0.65 * a)
}
