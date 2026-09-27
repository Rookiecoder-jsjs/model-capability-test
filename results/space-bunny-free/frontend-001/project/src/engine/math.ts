/* ==========================================================================
   3D 数学（列主序 4x4，与 Canvas2D setTransform 兼容）
   世界坐标约定：+X 右，+Y 上，+Z 朝向观察者。
   ========================================================================== */

export type Vec3 = { x: number; y: number; z: number }
export type Mat4 = Float64Array

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const vmul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const vlen = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)

export function vnorm(a: Vec3): Vec3 {
  const l = vlen(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** 归一化到 [0,1] 并夹紧；x 落在 [a,b] 之外直接给 0 或 1。 */
export function span(x: number, a: number, b: number): number {
  if (b === a) return x < a ? 0 : 1
  return clamp01((x - a) / (b - a))
}

/** 三段平滑：入段 ease-in-out，整体 0→1。 */
export function smooth(x: number, a: number, b: number): number {
  const t = span(x, a, b)
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

/** 指数趋近，帧率无关。 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

// --------------------------------------------------------------------------
// 4x4 矩阵（列主序：m[col * 4 + row]）
// --------------------------------------------------------------------------

export const mat4 = (): Mat4 =>
  new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** 原地写出 out = a * b。out 不得与 b 同一对象。 */
export function mat4mul(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3]
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  }
  return out
}

export function mat4fromTranslation(out: Mat4, t: Vec3): Mat4 {
  out.fill(0)
  out[0] = out[5] = out[10] = out[15] = 1
  out[12] = t.x
  out[13] = t.y
  out[14] = t.z
  return out
}

export function mat4fromRotX(out: Mat4, r: number): Mat4 {
  const c = Math.cos(r), s = Math.sin(r)
  out.fill(0)
  out[0] = 1; out[5] = c; out[6] = s; out[9] = -s; out[10] = c; out[15] = 1
  return out
}

export function mat4fromRotY(out: Mat4, r: number): Mat4 {
  const c = Math.cos(r), s = Math.sin(r)
  out.fill(0)
  out[0] = c; out[2] = -s; out[5] = 1; out[8] = s; out[10] = c; out[15] = 1
  return out
}

export function mat4fromRotZ(out: Mat4, r: number): Mat4 {
  const c = Math.cos(r), s = Math.sin(r)
  out.fill(0)
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c; out[10] = 1; out[15] = 1
  return out
}

const _mA = mat4()
const _mB = mat4()
const _mC = mat4()

/** 平移 + 绕 Y 旋转 + 绕 X 俯仰 + 等比缩放。物体放置最常用的组合。 */
export function mat4compose(out: Mat4, pos: Vec3, ry: number, rx = 0, scale = 1): Mat4 {
  mat4fromRotY(_mA, ry)
  if (rx !== 0) {
    mat4fromRotX(_mB, rx)
    mat4mul(_mC, _mB, _mA) // Rx * Ry
    _mA.set(_mC)
  }
  // 等比缩放只作用于前 3 列（旋转基向量），平移列不缩放
  for (let i = 0; i < 12; i++) _mA[i] *= scale
  _mA[3] = 0; _mA[7] = 0; _mA[11] = 0
  _mA[12] = pos.x
  _mA[13] = pos.y
  _mA[14] = pos.z
  _mA[15] = 1
  out.set(_mA)
  return out
}

/** 变换一个点（w = 1）。 */
export function mat4xformPoint(m: Mat4, p: Vec3, out: Vec3 = v3()): Vec3 {
  out.x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]
  out.y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]
  out.z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
  return out
}

/**
 * 通用 4x4 求逆（高斯-约当）。装配路径需要把「世界坐标的出发位」
 * 换算到父对象的局部坐标系——这是保证芯片在板卡尚未落位时也停在
 * 正确世界位置的关键。返回是否成功。
 */
export function mat4invert(out: Mat4, m: Mat4): boolean {
  const a = new Float64Array(32)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) a[r * 8 + c] = m[c * 4 + r]
  for (let r = 0; r < 4; r++) a[r * 8 + 4 + r] = 1
  for (let col = 0; col < 4; col++) {
    let piv = col
    for (let r = col + 1; r < 4; r++) if (Math.abs(a[r * 8 + col]) > Math.abs(a[piv * 8 + col])) piv = r
    if (Math.abs(a[piv * 8 + col]) < 1e-12) return false
    if (piv !== col) for (let k = 0; k < 8; k++) { const t = a[col * 8 + k]; a[col * 8 + k] = a[piv * 8 + k]; a[piv * 8 + k] = t }
    const d = a[col * 8 + col]
    for (let k = 0; k < 8; k++) a[col * 8 + k] /= d
    for (let r = 0; r < 4; r++) {
      if (r === col) continue
      const f = a[r * 8 + col]
      if (f === 0) continue
      for (let k = 0; k < 8; k++) a[r * 8 + k] -= f * a[col * 8 + k]
    }
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = a[r * 8 + 4 + c]
  return true
}

// --------------------------------------------------------------------------
// 等距（正交）相机
// --------------------------------------------------------------------------

export const ISOMETRIC_PITCH = 0.4363 // 25°
export const ISOMETRIC_YAW = -0.6632 // -38°

export type Camera = {
  /** 注视点（世界坐标） */
  target: Vec3
  /** 沿视线推近的比例：0 = 原位，0.35 = 画面放大 35% */
  dolly: number
  pitch: number
  yaw: number
  /** 注视点落在画布的哪个 CSS 像素位置 */
  ox: number
  oy: number
  /** 每世界单位对应的 CSS 像素 */
  scale: number
  /** 相机位置（正交投影下只用于反解世界坐标） */
  eye: Vec3
  /** 视图矩阵 */
  view: Mat4
}

export function createCamera(): Camera {
  return {
    target: v3(0, 0, 0),
    dolly: 0,
    pitch: ISOMETRIC_PITCH,
    yaw: ISOMETRIC_YAW,
    ox: 0,
    oy: 0,
    scale: 1,
    eye: v3(0, 0, 60),
    view: mat4(),
  }
}

/**
 * 相机基向量（世界坐标）：
 *   right = ( cosθ,       0,     sinθ      )
 *   up    = ( sinφ·sinθ,  cosφ,  -sinφ·cosθ )
 *   fwd   = (-cosφ·sinθ,  sinφ,   cosφ·cosθ )   ← 由注视点指向相机
 * θ=0, φ=0 时退化为单位阵（相机在 +Z 看向原点）。
 */
export function cameraBasis(cam: Camera): { right: Vec3; up: Vec3; fwd: Vec3 } {
  const cφ = Math.cos(cam.pitch), sφ = Math.sin(cam.pitch)
  const cθ = Math.cos(cam.yaw), sθ = Math.sin(cam.yaw)
  return {
    right: { x: cθ, y: 0, z: sθ },
    up: { x: sφ * sθ, y: cφ, z: -sφ * cθ },
    fwd: { x: -cφ * sθ, y: sφ, z: cφ * cθ },
  }
}

/**
 * 重新计算视图矩阵与像素缩放。
 *
 * contentW / contentH —— 当前构图希望内容占据的世界单位包围盒尺寸
 *   （等距投影下由几何外接盒换算，见 projectExtents）。
 * minScale —— 每世界单位的像素下限。跨尺度（芯片 1.0 单位 ↔ 集群 9 单位）
 *   拉远时靠它兜底，保证主体不会缩成一个点。
 */
export function updateCamera(
  cam: Camera,
  vw: number,
  vh: number,
  ox: number,
  oy: number,
  contentW: number,
  contentH: number,
  minScale: number,
  maxScale: number,
): Camera {
  const s = clamp(
    Math.min(vw / contentW, vh / contentH),
    minScale,
    maxScale,
  )

  // dolly 是相对当前 scale 的倍数，所以推近不改变构图中心
  cam.scale = clamp(s * (1 + cam.dolly), minScale * 0.6, maxScale * 2.6)
  cam.ox = ox
  cam.oy = oy

  const { right, up, fwd } = cameraBasis(cam)
  const dist = 60
  const eye: Vec3 = {
    x: cam.target.x + fwd.x * dist,
    y: cam.target.y + fwd.y * dist,
    z: cam.target.z + fwd.z * dist,
  }
  cam.eye = eye

  const m = cam.view
  m[0] = right.x; m[1] = right.y; m[2] = right.z; m[3] = 0
  m[4] = up.x; m[5] = up.y; m[6] = up.z; m[7] = 0
  m[8] = fwd.x; m[9] = fwd.y; m[10] = fwd.z; m[11] = 0
  m[12] = -(right.x * eye.x + right.y * eye.y + right.z * eye.z)
  m[13] = -(up.x * eye.x + up.y * eye.y + up.z * eye.z)
  m[14] = -(fwd.x * eye.x + fwd.y * eye.y + fwd.z * eye.z)
  m[15] = 1
  return cam
}

const _pj = { x: 0, y: 0, z: 0 }

/** 世界点 → 画布 CSS 像素。 */
export function project(cam: Camera, p: Vec3, out: { x: number; y: number; z: number }): void {
  const m = cam.view
  const vx = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]
  const vy = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]
  const vz = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
  out.x = vx * cam.scale + cam.ox
  out.y = -vy * cam.scale + cam.oy
  out.z = vz
}

export type Ndc = { x: number; y: number; z: number; w: number }
const _ndc: Ndc = { x: 0, y: 0, z: 0, w: 1 }

/**
 * 相机静止时，把世界点变换到视口 CSS 像素（相对画布左��角）。
 * DOM 层（文字标签、层标注）用它定位——保证文字与主体使用完全同一套相机。
 * 返回值是共享对象，调用方需立即取用。
 */
export function projectToScreen(cam: Camera, p: Vec3): Ndc {
  const m = cam.view
  _ndc.x = (m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12]) * cam.scale + cam.ox
  _ndc.y = -((m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13]) * cam.scale) + cam.oy
  _ndc.z = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
  _ndc.w = 1
  return _ndc
}

/** 供调试/几何计算使用的一次性投影。 */
export function projectOnce(cam: Camera, p: Vec3): { x: number; y: number; z: number } {
  project(cam, p, _pj)
  return _pj
}

/**
 * 由世界坐标集合求「投影后」的包围盒（等距 + 正交下，投影宽度 = 沿 right 的范围，
 * 高度 = 沿 up 的范围）。相机取 0 pitch/0 yaw 时的尺度与偏移对结果无影响，
 * 因为投影是正交且线性的。
 */
export function projectExtents(
  cam: Camera,
  pts: Vec3[],
): { w: number; h: number; cx: number; cy: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  const { right, up, fwd } = cameraBasis(cam)
  for (const p of pts) {
    const x = right.x * p.x + right.y * p.y + right.z * p.z
    const y = up.x * p.x + up.y * p.y + up.z * p.z
    const z = fwd.x * p.x + fwd.y * p.y + fwd.z * p.z
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  if (!Number.isFinite(minX)) return { w: 1, h: 1, cx: 0, cy: 0, minZ: 0, maxZ: 0 }
  return { w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minZ, maxZ }
}
