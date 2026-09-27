/* ==========================================================================
   场景图
   ---------------------------------------------------------------------------
   关键设计：物体是持久的 SceneObject 节点，携带自己的局部矩阵与世界矩阵。
   「芯片落进板卡插槽」改变的是 chip.parent，而 chip 本身、它的历史世界坐标
   都不会被销毁 —— 它继续被采样、被验证、被绘制。
   装配到位后不做任何「让路」处理：真实的遮挡由绘制顺序与裁剪产生。
   ========================================================================== */

import {
  mat4, mat4compose, mat4mul, mat4xformPoint, mat4invert,
  v3, type Vec3,
} from './math'

export type ObjectKind = 'chip' | 'card' | 'server' | 'rack' | 'node' | 'stratum'

export class SceneObject {
  readonly id: string
  readonly kind: ObjectKind
  parent: SceneObject | null = null
  readonly children: SceneObject[] = []

  /** 局部位置 */
  pos: Vec3 = v3()
  /** 局部旋转：绕 Y（方位）与绕 X（俯仰），单位弧度 */
  ry = 0
  rx = 0
  /** 局部等比缩放 */
  scale = 1

  /** 落位完成时的局部位置（= 装配终点） */
  home: Vec3 = v3()
  /** 落位完成时的姿态 */
  homeRy = 0
  homeRx = 0
  /** 装配基准位（与 p 无关）：窗口变形阶段以它为插值起点 */
  homePos: Vec3 = v3()
  /** 窗口变形解出的目标位（cluster 局部坐标） */
  targetPos: Vec3 = v3()

  /** 该物体自身装配动画的进度 0..1（由章节 p 纯函数驱动） */
  t = 0

  local = mat4()
  world = mat4()
  /** 本帧世界原点缓存 */
  worldPos: Vec3 = v3()

  constructor(id: string, kind: ObjectKind) {
    this.id = id
    this.kind = kind
  }

  addChild(c: SceneObject): SceneObject {
    c.parent = this
    this.children.push(c)
    return c
  }

  /** 递归写入世界矩阵。 */
  updateWorld(): void {
    mat4compose(this.local, this.pos, this.ry, this.rx, this.scale)
    if (this.parent) mat4mul(this.world, this.parent.world, this.local)
    else this.world.set(this.local)
    this.worldPos = mat4xformPoint(this.world, v3())
    for (const c of this.children) c.updateWorld()
  }

  worldPosOf(local: Vec3): Vec3 {
    return mat4xformPoint(this.world, local)
  }

  /** 世界位置 → 本对象局部坐标（装配路径需要：出发位是世界坐标写的） */
  worldToLocal(worldPoint: Vec3, out: Vec3 = v3()): Vec3 {
    const inv = mat4()
    if (!mat4invert(inv, this.world)) return v3(worldPoint.x, worldPoint.y, worldPoint.z)
    return mat4xformPoint(inv, worldPoint, out)
  }

  /** 沿父链累计的缩放 */
  accumulatedScale(): number {
    let s = this.scale
    for (let p: SceneObject | null = this; p; p = p.parent) s *= p.scale
    return s
  }
}

// --------------------------------------------------------------------------
// 悬停路径装配器
// --------------------------------------------------------------------------

const smoothstep01 = (t: number) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/**
 * 两段式装配路径（与要求一致：先对齐，再进入、落位）。
 *
 *   t = 0.00 → 0.70  悬停自由空间，路径是一段抬高的弧线，终点正好在目标的正上方，
 *                    此时物体已经与目标坐标系对齐
 *   t = 0.70 → 1.00  沿最短轴向路径压入 0.6 深度完成落位（只穿孔洞，不穿外壳）
 *
 * fromLocal 是「出发位在父级局部坐标中的表示」——由 worldToLocal 得到，
 * 所以无论父对象当前跑到哪里，物体都从同一个世界位置起飞。
 * 所有中间量都是 t 的纯函数，反向滚动严格可逆。
 */
export function applyHover(
  obj: SceneObject,
  fromLocal: Vec3,
  lift: number,
  arcLateral: Vec3,
  fromRy: number,
  fromRx: number,
  hover: number,
  drop: number,
): void {
  const k = smoothstep01(hover)
  const d = smoothstep01(drop)

  // 悬停段：从出发位走到「目标正上方 + 侧移」处，全程在目标之上
  const apexX = obj.home.x + arcLateral.x
  const apexY = obj.home.y + lift
  const apexZ = obj.home.z + arcLateral.z

  const px = fromLocal.x + (apexX - fromLocal.x) * k
  const py = fromLocal.y + (apexY - fromLocal.y) * k
  const pz = fromLocal.z + (apexZ - fromLocal.z) * k

  // 进入落位段：从正上方沿 -Y 压到 home
  obj.pos = {
    x: px + (obj.home.x - px) * d,
    y: py + (obj.home.y - py) * d,
    z: pz + (obj.home.z - pz) * d,
  }

  const kk = Math.max(k, d)
  obj.ry = fromRy + (obj.homeRy - fromRy) * kk
  obj.rx = fromRx + (obj.homeRx - fromRx) * kk
  obj.t = d
}
