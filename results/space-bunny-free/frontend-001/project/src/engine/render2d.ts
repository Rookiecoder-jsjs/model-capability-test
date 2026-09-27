/* ==========================================================================
   等距 2.5D 渲染器
   ---------------------------------------------------------------------------
   选择 Canvas 2D 而非 WebGL：没有着色器编译、没有 context lost、
   字体与 DOM 层共用同一套度量，加载后不会二次重排。
   深度由画家算法 + 逐面背面剔除保证（所有几何都是凸长方体），
   正交投影下长方体边之间不会互相穿插，排序稳定，反向滚动不会闪烁。

   代价：没有逐像素深度缓冲，被包住的零件会被真实遮住（这正是要求里
   「装配后允许被真实实体遮挡」要的行为）。
   ========================================================================== */

import type { Camera, Mat4, Vec3 } from './math'

export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz'
export const FACES: Face[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz']

const V = (x: number, y: number, z: number) => ({ x, y, z })

/** 立方体 8 个角，单位尺寸，索引 0..7 */
export const CORNERS: Vec3[] = [
  V(-0.5, -0.5, 0.5), V(0.5, -0.5, 0.5), V(0.5, 0.5, 0.5), V(-0.5, 0.5, 0.5),
  V(-0.5, -0.5, -0.5), V(0.5, -0.5, -0.5), V(0.5, 0.5, -0.5), V(-0.5, 0.5, -0.5),
]

/** 每个面用的 4 个角（从面外侧看逆时针） */
export const FACE_CORNERS: Record<Face, [number, number, number, number]> = {
  px: [1, 2, 6, 5],
  nx: [4, 7, 3, 0],
  py: [3, 7, 6, 2],
  ny: [0, 1, 5, 4],
  pz: [0, 3, 2, 1],
  nz: [5, 6, 7, 4],
}

/** 面外法线（单位立方体局部坐标） */
export const FACE_NORMAL: Record<Face, Vec3> = {
  px: V(1, 0, 0), nx: V(-1, 0, 0),
  py: V(0, 1, 0), ny: V(0, -1, 0),
  pz: V(0, 0, 1), nz: V(0, 0, -1),
}

export type BoxStyle = {
  /** 六个面的填充色 */
  faces: Partial<Record<Face, string>> & { default: string }
  /** 描边色，null = 不描边 */
  stroke?: string | null
  strokeWidth?: number
  alpha?: number
  /** 顶面额外高光条比例 0..0.5 */
  topSheen?: number
  /** 侧面渐变强度 0..1（从上到下压暗） */
  sideShade?: number
}

const DEFAULT_BOX: BoxStyle = { faces: { default: '#ccc' }, stroke: null }

export class Renderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  dpr = 1
  width = 0 // CSS 像素
  height = 0
  quality: 'low' | 'high' = 'high'
  /** 已绘制的面数（供性能采样） */
  facesDrawn = 0
  private camRef: Camera | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: false })
    if (!ctx) throw new Error('Canvas 2D 上下文不可用')
    this.ctx = ctx
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const maxDpr = 2
    this.dpr = Math.max(1, Math.min(maxDpr, dpr))
    const w = Math.max(1, Math.round(cssW * this.dpr))
    const h = Math.max(1, Math.round(cssH * this.dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    this.width = cssW
    this.height = cssH
  }

  begin(cam: Camera): void {
    const { ctx } = this
    this.facesDrawn = 0
    this.camRef = cam
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    // 纸面底色（与 CSS 变量一致，避免边缘出现半透明白边）
    ctx.fillStyle = '#f6f3ec'
    ctx.fillRect(0, 0, this.width, this.height)
  }

  end(): void {
    this.camRef = null
  }

  /**
   * 把后续绘制限制在一个 CSS 像素矩形内。
   * 用于「把主体裁进 Agent 窗口的运行区」：主体仍然是同一批对象、
   * 同一套矩阵，只是可见范围被窗口限定——不是另画一份。
   */
  clipTo(rect: { x: number; y: number; w: number; h: number } | null): void {
    const { ctx } = this
    if (!rect) {
      ctx.restore()
      ctx.save()
      return
    }
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
  }

  beginClip(): void {
    this.ctx.save()
  }

  /**
   * 在物体世界矩阵下绘制一个以物体原点为中心、边长为 (w,h,d) 的长方体。
   * 只画朝向相机的面（背面剔除）。
   *
   * 正交投影下「面是否可见」有精确判据：外法线 n 与视线方向 fwd 的点积 > 0。
   * 物体的位置不影响这个判据（正交视线的性质），所以物体飞出画面边缘时
   * 不会突然出现「少画一个面」的突变——这正是跨芯片到集群尺度要稳定的点。
   */
  box(m: Mat4, w: number, h: number, d: number, style: BoxStyle = DEFAULT_BOX, edgeBoost = 1): void {
    const { ctx, camRef } = this
    if (!camRef) return
    const st = style === DEFAULT_BOX ? DEFAULT_BOX : style
    const fill = st.faces.default
    const fwx = camRef.view[8], fwy = camRef.view[9], fwz = camRef.view[10]

    for (const f of FACES) {
      const n = FACE_NORMAL[f]
      // 变换法线（只含旋转 + 等比缩放）
      const nx = m[0] * n.x + m[4] * n.y + m[8] * n.z
      const ny = m[1] * n.x + m[5] * n.y + m[9] * n.z
      const nz = m[2] * n.x + m[6] * n.y + m[10] * n.z
      if (nx * fwx + ny * fwy + nz * fwz <= 1e-6) continue

      const idx = FACE_CORNERS[f]
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const c = CORNERS[idx[i]]
        const lx = c.x * w, ly = c.y * h, lz = c.z * d
        // 物体局部 → 世界
        const ax = m[0] * lx + m[4] * ly + m[8] * lz + m[12]
        const ay = m[1] * lx + m[5] * ly + m[9] * lz + m[13]
        const az = m[2] * lx + m[6] * ly + m[10] * lz + m[14]
        // 世界 → 画布
        const sx = (camRef.view[0] * ax + camRef.view[4] * ay + camRef.view[8] * az + camRef.view[12]) * camRef.scale + camRef.ox
        const sy = -((camRef.view[1] * ax + camRef.view[5] * ay + camRef.view[9] * az + camRef.view[13]) * camRef.scale) + camRef.oy
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      }
      ctx.closePath()

      let fc = st.faces[f] ?? fill
      if (f === 'py' && st.topSheen) fc = lighten(fc, st.topSheen)
      if ((f === 'nz' || f === 'px' || f === 'nx') && st.sideShade) fc = lighten(fc, -st.sideShade)
      ctx.globalAlpha = st.alpha ?? 1
      ctx.fillStyle = fc
      ctx.fill()

      if (st.stroke) {
        // 线宽随物体屏幕尺寸补偿：1.6 CSS px 起底，乘 edgeBoost
        const approxPx = Math.max(w, h, d) * camRef.scale
        const lw = clampNum(0.9 * (approxPx / 60) * edgeBoost + 0.5, 0.55, 2.6)
        ctx.lineWidth = lw
        ctx.strokeStyle = st.stroke
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      this.facesDrawn++
    }
  }

  /**
   * 在物体局部坐标里画矩形贴片（用于电路板走线、金手指、风扇叶片、指示灯等）。
   * 贴片会被投到指定面所在的平面上。
   */
  patch(
    m: Mat4,
    face: Face,
    u0: number, v0: number, u1: number, v1: number,
    color: string,
    alphaV = 1,
  ): void {
    const { ctx, camRef } = this
    if (!camRef) return
    const n = FACE_NORMAL[face]
    const nx = m[0] * n.x + m[4] * n.y + m[8] * n.z
    const ny = m[1] * n.x + m[5] * n.y + m[9] * n.z
    const nz = m[2] * n.x + m[6] * n.y + m[10] * n.z
    const fwx = camRef.view[8], fwy = camRef.view[9], fwz = camRef.view[10]
    if (nx * fwx + ny * fwy + nz * fwz <= 1e-6) return

    // 面局部基：u 沿面内的第一个切向，v 沿第二个
    const { u, v, o } = faceBasis(face)
    ctx.beginPath()
    const pts = [
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
    ]
    for (let i = 0; i < 4; i++) {
      const [a, b] = pts[i]
      const lx = o.x + u.x * a + v.x * b
      const ly = o.y + u.y * a + v.y * b
      const lz = o.z + u.z * a + v.z * b
      const ax = m[0] * lx + m[4] * ly + m[8] * lz + m[12]
      const ay = m[1] * lx + m[5] * ly + m[9] * lz + m[13]
      const az = m[2] * lx + m[6] * ly + m[10] * lz + m[14]
      const sx = (camRef.view[0] * ax + camRef.view[4] * ay + camRef.view[8] * az + camRef.view[12]) * camRef.scale + camRef.ox
      const sy = -((camRef.view[1] * ax + camRef.view[5] * ay + camRef.view[9] * az + camRef.view[13]) * camRef.scale) + camRef.oy
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.closePath()
    ctx.globalAlpha = alphaV
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1
  }

  /** 沿物体局部坐标画一条线段（金手指线路、层间连接、轨迹） */
  line3(
    m: Mat4,
    a: Vec3, b: Vec3,
    color: string, width: number, alphaV = 1, dash: number[] | null = null,
  ): void {
    const { ctx, camRef } = this
    if (!camRef) return
    const p1 = localToCanvas(m, camRef, a)
    const p2 = localToCanvas(m, camRef, b)
    ctx.save()
    ctx.globalAlpha = alphaV
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    if (dash) ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    ctx.restore()
  }

  /** 在屏幕空间（CSS 像素）画线 */
  lineScreen(a: { x: number; y: number }, b: { x: number; y: number }, color: string, width: number, alphaV = 1, dash: number[] | null = null): void {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alphaV
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    if (dash) ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.restore()
  }

  circleScreen(x: number, y: number, r: number, fill: string | null, stroke: string | null, lw = 1, alphaV = 1): void {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alphaV
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2)
    if (fill) { ctx.fillStyle = fill; ctx.fill() }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke() }
    ctx.restore()
  }
}

// --------------------------------------------------------------------------

export function localToCanvas(m: Mat4, cam: Camera, p: Vec3): { x: number; y: number } {
  const ax = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]
  const ay = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]
  const az = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
  return {
    x: (cam.view[0] * ax + cam.view[4] * ay + cam.view[8] * az + cam.view[12]) * cam.scale + cam.ox,
    y: -((cam.view[1] * ax + cam.view[5] * ay + cam.view[9] * az + cam.view[13]) * cam.scale) + cam.oy,
  }
}

export function worldToCanvas(cam: Camera, p: Vec3): { x: number; y: number } {
  return {
    x: (cam.view[0] * p.x + cam.view[4] * p.y + cam.view[8] * p.z + cam.view[12]) * cam.scale + cam.ox,
    y: -((cam.view[1] * p.x + cam.view[5] * p.y + cam.view[9] * p.z + cam.view[13]) * cam.scale) + cam.oy,
  }
}

function faceBasis(face: Face): { u: Vec3; v: Vec3; o: Vec3 } {
  switch (face) {
    case 'py': return { u: V(0, 0, 1), v: V(1, 0, 0), o: V(0, 0.5, 0) }
    case 'ny': return { u: V(1, 0, 0), v: V(0, 0, 1), o: V(0, -0.5, 0) }
    case 'px': return { u: V(0, 0, -1), v: V(0, 1, 0), o: V(0.5, 0, 0) }
    case 'nx': return { u: V(0, 0, 1), v: V(0, 1, 0), o: V(-0.5, 0, 0) }
    case 'pz': return { u: V(1, 0, 0), v: V(0, 1, 0), o: V(0, 0, 0.5) }
    case 'nz': return { u: V(-1, 0, 0), v: V(0, 1, 0), o: V(0, 0, -0.5) }
  }
}

/** 十六进制色明暗调整 */
function lighten(hex: string, amt: number): string {
  if (!hex.startsWith('#')) return hex
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => clampNum(Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)), 0, 255)
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

const clampNum = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
