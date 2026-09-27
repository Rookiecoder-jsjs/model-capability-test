/* ==========================================================================
   物体几何
   ---------------------------------------------------------------------------
   全部用长方体 + 贴片构成，与渲染器的画家算法一致（长方体之间不会互相穿插）。
   芯片参考昇腾风格：绿色基板、银色顶盖、简洁的 HUAWEI / Ascend 标记。
   属于概念造型，不对应任何一代产品的精确规格。
   ========================================================================== */

import { mat4, v3, type Mat4 } from '../engine/math'
import type { Renderer } from '../engine/render2d'
import { P, alpha } from '../engine/palette'
import { DIM, SLOT, BOARD_Y, STRATUM_HALF } from './assembly'
import type { SceneObject } from '../engine/scene'

// ---------------------------------------------------------------------------
// 通用构件
// ---------------------------------------------------------------------------

/** 在物体本地坐标里，叠一层薄片（平移矩阵与父矩阵的旋转、缩放一致） */
function sub(m: Mat4, x: number, y: number, z: number, out: Mat4): Mat4 {
  out.set(m)
  out[3] = m[0] * x + m[4] * y + m[8] * z + m[12]
  out[7] = m[1] * x + m[5] * y + m[9] * z + m[13]
  out[11] = m[2] * x + m[6] * y + m[10] * z + m[14]
  return out
}

const _s = mat4()
const _s2 = mat4()

/** 通风格栅：在一面上一排细缝 */
function vents(
  r: Renderer, m: Mat4, face: 'pz' | 'nz' | 'px', count: number, span: number,
  yFrom: number, yTo: number, color: string, a: number,
): void {
  for (let i = 0; i < count; i++) {
    const c = (count === 1 ? 0.5 : i / (count - 1)) - 0.5
    r.patch(m, face, c * span, yFrom, c * span + span / count - 0.004, yTo, color, a)
  }
}

// ---------------------------------------------------------------------------
// 芯片
// ---------------------------------------------------------------------------

const chipBody = { faces: { default: P.pcb, py: '#22814e', ny: P.pcbDark }, stroke: alpha(P.pcbEdge, 0.9), strokeWidth: 1 }
const chipLidStyle = { faces: { default: P.metal, py: P.metalLight, ny: P.metalDark }, stroke: alpha('#7d838a', 0.85), strokeWidth: 1, topSheen: 0.14 }
const chipMarkStyle = { faces: { default: alpha(P.greenWash, 0.0) }, stroke: null }

/**
 * 芯片 = 绿色基板 + 银色顶盖 + 顶盖上的简洁标记。
 * 标记用细笔画而非图片：任何缩放比例下都锐利，也不引入外部资源。
 */
export function drawChip(r: Renderer, chip: SceneObject, alphaV: number, detail: number): void {
  const m = chip.world
  const { w, h, d } = DIM.chip
  r.box(m, w, h, d, { ...chipBody, alpha: alphaV })

  // 基板顶面的深色封装区域（顶盖会盖住大部分，留出边缘）
  r.patch(m, 'py', -0.40, -0.40, 0.40, 0.40, alpha(P.pcbDark, 0.55), alphaV)

  // 顶盖：银色，略微内缩，带倒角感（上下两片薄）
  const lid = sub(m, SLOT.lidPos.x, SLOT.lidPos.y, SLOT.lidPos.z, _s)
  r.box(lid, 0.84, 0.045, 0.84, { ...chipLidStyle, alpha: alphaV })

  if (detail > 0.02) {
    // 顶盖上的标识：一条绿色横线 + 两行字位标记（概念化，不做真实字形）
    const lm = sub(lid, 0, 0.0225, 0, _s2)
    r.patch(lm, 'py', -0.30, 0.055, 0.30, 0.085, alpha(P.green, 0.85 * alphaV), 1)
    r.patch(lm, 'py', -0.30, 0.012, 0.30, 0.038, alpha(P.green, 0.5 * alphaV), 1)
    for (let i = 0; i < 6; i++) {
      const x = -0.235 + i * 0.094
      r.patch(lm, 'py', x, 0.118, x + 0.056, 0.148, alpha(P.inkMuted, 0.42 * alphaV * detail), 1)
    }
    for (let i = 0; i < 6; i++) {
      const x = -0.20 + i * 0.070
      r.patch(lm, 'py', x, -0.115, x + 0.040, -0.086, alpha(P.inkMuted, 0.32 * alphaV * detail), 1)
    }
  }

  // 基板四边的引脚（可见的那两面）
  if (detail > 0.1) {
    const pins = 11
    for (let i = 0; i < pins; i++) {
      const c = (i / (pins - 1) - 0.5) * 0.86
      r.patch(m, 'pz', c, -0.046, c + 0.028, -0.008, alpha('#c9a227', 0.9 * alphaV), 1)
      r.patch(m, 'nx', c, -0.046, c + 0.028, -0.008, alpha('#c9a227', 0.7 * alphaV), 1)
    }
  }
  void chipMarkStyle
}

// ---------------------------------------------------------------------------
// 板卡
// ---------------------------------------------------------------------------

const pcbStyle = { faces: { default: P.pcb, py: '#20784a', ny: P.pcbDark }, stroke: alpha(P.pcbEdge, 0.85), strokeWidth: 1 }

/** 板卡 = 绿色 PCB + 供电接口 + 散热片 + 散热器风扇 + 金手指插槽 + 固定孔 */
export function drawCard(r: Renderer, card: SceneObject, alphaV: number, detail: number): void {
  const m = card.world
  const { w, h, d } = DIM.card
  r.box(m, w, h, d, { ...pcbStyle, alpha: alphaV })

  // 金手指：沿 -Z 端的一排长条
  const fingers = 15
  for (let i = 0; i < fingers; i++) {
    const x = (i / (fingers - 1) - 0.5) * 0.92
    r.patch(m, 'py', x, -0.70, x + 0.030, -0.60, alpha('#c9a227', 0.85 * alphaV), 1)
  }
  // 插槽槽口（挖空视觉：在板卡 -Z 面上画一条深色槽）
  r.patch(m, 'nz', -0.46, -0.40, 0.46, -0.18, alpha(P.slotDark, 0.85 * alphaV), 1)

  // 散热片（让出芯片正上方的位置：芯片要先被看清，再被装上散热）
  if (detail > 0.02) {
    const hs = sub(m, 0.12, h / 2 + 0.15, 0.30, _s)
    r.box(hs, 0.66, 0.17, 0.66, {
      faces: { default: P.metal, py: P.metalLight, nz: P.metalDark },
      stroke: alpha('#7d838a', 0.8), strokeWidth: 1, sideShade: 0.10, alpha: alphaV,
    })
    // 鳍片
    if (detail > 0.25) {
      for (let i = 0; i < 7; i++) {
        r.patch(hs, 'pz', -0.31, -0.062, 0.31, 0.062, alpha('#b4b9bd', 0.9 * alphaV), 1)
      }
    }
    // 风扇（两枚，金属外圈 + 叶片）
    for (let i = 0; i < 2; i++) {
      const fx = i === 0 ? -0.155 : 0.155
      const fm = sub(hs, fx, 0.090, 0, _s2)
      r.box(fm, 0.27, 0.014, 0.27, {
        faces: { default: P.metalDark, py: P.metal }, stroke: alpha('#6f757b', 0.8), strokeWidth: 1, alpha: alphaV,
      })
      if (detail > 0.3) {
        for (let b = 0; b < 5; b++) {
          const a0 = (b / 5) * Math.PI * 2
          r.patch(fm, 'py', -0.12, a0 * 0.04 - 0.024, 0.12, a0 * 0.04 + 0.024, alpha('#6b7175', 0.42 * alphaV), 1)
        }
        r.patch(fm, 'py', -0.030, -0.030, 0.030, 0.030, alpha(P.chassis, 0.9 * alphaV), 1)
      }
    }
  }

  // 供电接口（+Z 端上沿）
  if (detail > 0.1) {
    const ps = sub(m, 0.16, h / 2 + 0.055, -0.56, _s)
    r.box(ps, 0.30, 0.075, 0.18, {
      faces: { default: '#2b2e31' }, stroke: alpha('#121416', 0.8), strokeWidth: 1, alpha: alphaV,
    })
  }

  // 电路走线（顶面可见部分）
  if (detail > 0.18) {
    for (let i = 0; i < 5; i++) {
      const y = -0.30 + i * 0.10
      r.patch(m, 'py', -0.50, y, 0.50, y + 0.012, alpha(P.pcbTrace, 0.55 * alphaV), 1)
    }
  }
}

// ---------------------------------------------------------------------------
// 服务器
// ---------------------------------------------------------------------------

/**
 * 服务器 = 底板 + 四角立柱 + 顶盖（封闭箱体）。
 * 刻意不画前后侧板：侧板以线框表示，让「板卡在服务器内部」这件事可见。
 */
export function drawServer(r: Renderer, server: SceneObject, alphaV: number, detail: number): void {
  const m = server.world
  const { w, h, d } = DIM.server

  // 底板
  r.box(sub(m, 0, -h / 2 + 0.02, 0, _s), w, 0.04, d, {
    faces: { default: P.chassis, py: P.chassisTop }, stroke: alpha('#0f1113', 0.85), strokeWidth: 1, alpha: alphaV,
  })
  // 立柱
  if (detail > 0.05) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      r.box(
        sub(m, sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035), _s2),
        0.07, h - 0.04, 0.07,
        { faces: { default: P.chassisSide }, stroke: alpha('#0f1113', 0.6), strokeWidth: 1, alpha: alphaV },
      )
    }
  }
  // 主板
  if (detail > 0.02) {
    r.box(sub(m, 0, BOARD_Y, 0, _s), w - 0.16, 0.03, d - 0.14, {
      faces: { default: '#1f5f3a', py: '#276b43' }, stroke: alpha('#123a22', 0.8), strokeWidth: 1, alpha: alphaV,
    })
  }
  // 顶盖（保留全部可交叠面，遮挡是真实的）
  r.box(sub(m, 0, h / 2 - 0.02, 0, _s), w, 0.04, d, {
    faces: { default: P.chassis, py: P.chassisTop, pz: P.chassisLip }, stroke: alpha('#0f1113', 0.85),
    strokeWidth: 1, sideShade: 0.10, topSheen: 0.08, alpha: alphaV,
  })
  // 前面板（+Z）
  if (detail > 0.05) {
    const fp = sub(m, 0, 0.02, d / 2 + 0.006, _s2)
    r.box(fp, w - 0.10, h - 0.20, 0.012, {
      faces: { default: P.chassisSide, pz: '#31353a' }, stroke: alpha('#0f1113', 0.7), strokeWidth: 1, alpha: alphaV,
    })
    // 前面板进风格栅
    vents(r, fp, 'pz', 11, w - 0.24, -h / 2 + 0.20, h / 2 - 0.26, alpha('#0d0f11', 0.55 * alphaV), 1)
    // 电源按钮 + 指示灯
    r.patch(fp, 'pz', -w / 2 + 0.075, h / 2 - 0.20, -w / 2 + 0.135, h / 2 - 0.13, alpha(P.greenBright, 0.9 * alphaV), 1)
  }
  // 侧板以线框表示（不挡内部）
  if (detail > 0.12) {
    r.patch(m, 'px', -d / 2 + 0.02, -h / 2 + 0.06, d / 2 - 0.02, h / 2 - 0.08, alpha('#ffffff', 0.001), 1)
    r.line3(m, v3(w / 2, -h / 2 + 0.05, -d / 2 + 0.02), v3(w / 2, h / 2 - 0.06, -d / 2 + 0.02), alpha(P.inkGhost, 0.5 * alphaV), 1)
    r.line3(m, v3(w / 2, -h / 2 + 0.05, d / 2 - 0.02), v3(w / 2, h / 2 - 0.06, d / 2 - 0.02), alpha(P.inkGhost, 0.5 * alphaV), 1)
    r.line3(m, v3(w / 2, h / 2 - 0.06, -d / 2 + 0.02), v3(w / 2, h / 2 - 0.06, d / 2 - 0.02), alpha(P.inkGhost, 0.42 * alphaV), 1)
  }
}

// ---------------------------------------------------------------------------
// 机柜
// ---------------------------------------------------------------------------

/**
 * 机柜 = 立柱 + 底座 + 顶板 + 导轨 + 侧网板（半透明）+ 三层设备 + 配电。
 * 侧网板允许看到内部设备。
 */
export function drawRack(
  r: Renderer, o: SceneObject, alphaV: number, detail: number, populated: boolean,
): void {
  const m = o.world
  const { w, h, d } = DIM.rack

  // 底座
  r.box(sub(m, 0, 0.035, 0, _s), w + 0.06, 0.07, d + 0.06, {
    faces: { default: P.chassisSide, py: P.chassis }, stroke: alpha('#0f1113', 0.7), strokeWidth: 1, alpha: alphaV,
  })
  // 立柱
  if (detail > 0.02) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      r.box(sub(m, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03), _s2), 0.06, h, 0.06, {
        faces: { default: P.metalDark, pz: P.metal }, stroke: alpha('#6f757b', 0.7), strokeWidth: 1, alpha: alphaV,
      })
    }
  }
  // 顶板
  r.box(sub(m, 0, h - 0.03, 0, _s), w, 0.06, d, {
    faces: { default: P.chassis, py: P.chassisTop }, stroke: alpha('#0f1113', 0.8), strokeWidth: 1,
    topSheen: 0.07, alpha: alphaV,
  })
  // 侧网板：半透明深色，能看到里面的设备，但不喧宾夺主
  if (detail > 0.06) {
    for (const sx of [-1, 1] as const) {
      r.patch(m, sx > 0 ? 'px' : 'nx', -d / 2 + 0.04, 0.12, d / 2 - 0.04, h - 0.10, alpha('#22262a', 0.92 * alphaV), 1)
      // 门板上的把手与铰链，让侧板读起来是「门」
      r.patch(m, sx > 0 ? 'px' : 'nx', -d / 2 + 0.10, h * 0.46, -d / 2 + 0.13, h * 0.62, alpha('#6f757b', 0.85 * alphaV), 1)
    }
  }
  // 门框：正面四条边，让机柜读起来是一个「柜子」而不是一块板
  if (detail > 0.02) {
    const t = 0.05
    r.box(sub(m, 0, h / 2, d / 2 - t / 2, _s), w, t, t, { faces: { default: P.metalDark }, stroke: alpha('#6f757b', 0.7), strokeWidth: 1, alpha: alphaV })
    r.box(sub(m, 0, 0.10, d / 2 - t / 2, _s), w, t, t, { faces: { default: P.metalDark }, stroke: alpha('#6f757b', 0.7), strokeWidth: 1, alpha: alphaV })
    for (const sx of [-1, 1] as const) {
      r.box(sub(m, sx * (w / 2 - t / 2), h / 2, d / 2 - t / 2, _s2), t, h, t, { faces: { default: P.metalDark }, stroke: alpha('#6f757b', 0.7), strokeWidth: 1, alpha: alphaV })
    }
  }
  // 内部设备层
  const units: [number, number][] = [
    [0.30, 0.42],
    [0.86, 0.34],
    [1.44, 0.40],
  ]
  units.forEach(([y, uh], i) => {
    const um = sub(m, 0, y, 0, _s)
    const isServer = populated && i === 0
    r.box(um, w - 0.10, uh, d - 0.12, {
      faces: { default: isServer ? P.chassis : '#34383c', pz: isServer ? P.chassisLip : '#3d4247' },
      stroke: alpha('#0f1113', 0.7), strokeWidth: 1, sideShade: 0.08, alpha: alphaV,
    })
    if (detail > 0.10) {
      vents(r, um, 'pz', 9, w - 0.24, -uh / 2 + 0.05, uh / 2 - 0.05, alpha('#0d0f11', 0.5 * alphaV), 1)
      r.patch(um, 'pz', w / 2 - 0.16, -0.022, w / 2 - 0.10, 0.022, alpha(P.greenBright, 0.85 * alphaV), 1)
    }
  })
  // 顶部配电
  if (detail > 0.10) {
    const pdm = sub(m, 0, h - 0.24, 0, _s2)
    r.box(pdm, w - 0.16, 0.30, d - 0.30, {
      faces: { default: '#3a3e42', pz: '#464b50' }, stroke: alpha('#0f1113', 0.7), strokeWidth: 1, alpha: alphaV,
    })
    if (detail > 0.2) {
      for (let i = 0; i < 6; i++) {
        const x = -0.36 + i * 0.145
        r.patch(pdm, 'pz', x, -0.05, x + 0.055, 0.05, alpha('#22262a', 0.85 * alphaV), 1)
      }
    }
  }
  // 导轨
  if (detail > 0.18) {
    for (const sx of [-1, 1] as const) {
      r.line3(m, v3(sx * (w / 2 - 0.075), 0.10, -d / 2 + 0.10), v3(sx * (w / 2 - 0.075), h - 0.10, -d / 2 + 0.10), alpha(P.inkGhost, 0.55 * alphaV), 1.2)
    }
  }
}

// ---------------------------------------------------------------------------
// 三个开放层（不是箱体，是薄平台 + 立柱 + 器件）
// ---------------------------------------------------------------------------

export type StratumKind = 'model' | 'harness' | 'agent'

export function drawStratumFrame(
  r: Renderer, o: SceneObject, alphaV: number, detail: number, kind: StratumKind,
): void {
  const m = o.world
  const { w, d, h } = STRATUM_HALF
  const t = o.accumulatedScale()

  // 平台
  r.box(m, w * 2, h, d * 2, {
    faces: { default: '#e7e2d6', py: '#fbf9f4', ny: '#d8d2c4' },
    stroke: alpha(P.lineStrong, 0.95), strokeWidth: 1, topSheen: 0.05, sideShade: 0.10, alpha: alphaV,
  })
  // 平台边线：强调「开放」，四角不设围栏
  if (detail > 0.05) {
    const c = P.green
    r.patch(m, 'py', -w, d - 0.035, w, d, alpha(c, 0.30 * alphaV), 1)
    r.patch(m, 'py', -w, -d, w, -d + 0.035, alpha(c, 0.18 * alphaV), 1)
  }
  // 立柱（四角细柱，把层「悬」起来）
  if (detail > 0.02) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      r.box(
        sub(m, sx * (w - 0.10), -0.16, sz * (d - 0.10), _s2),
        0.055, 0.30, 0.055,
        { faces: { default: alpha(P.inkGhost, 0.55) }, stroke: null, alpha: alphaV * 0.9 },
      )
    }
  }
  void t
  void kind
}

/** 模型层：推理服务（一个计算块 + 一条服务条 + 若干请求条） */
export function drawModelStratum(r: Renderer, o: SceneObject, alphaV: number, detail: number): void {
  const m = o.world
  const cx = -1.30
  // 计算块
  r.box(sub(m, cx, 0.17, 0, _s), 1.10, 0.18, 1.10, {
    faces: { default: '#dfe4e0', py: '#f1f4f1' }, stroke: alpha(P.lineStrong, 0.9), strokeWidth: 1, alpha: alphaV,
  })
  if (detail > 0.1) {
    for (let i = 0; i < 4; i++) {
      const z = -0.36 + i * 0.24
      r.patch(m, 'py', cx - 0.44, z, cx - 0.30, z + 0.12, alpha(P.green, 0.35 * alphaV), 1)
    }
  }
  // 服务条
  r.box(sub(m, 0.95, 0.15, -0.55, _s), 1.30, 0.14, 0.30, {
    faces: { default: '#d9dfd8', py: '#eef2ec' }, stroke: alpha(P.lineStrong, 0.85), strokeWidth: 1, alpha: alphaV,
  })
  // 请求条（三条）
  if (detail > 0.05) {
    for (let i = 0; i < 3; i++) {
      const z = 0.30 + i * 0.32
      r.box(sub(m, 0.95, 0.12, z, _s2), 1.30, 0.08, 0.20, {
        faces: { default: '#e6e3d9', py: '#f6f3ec' }, stroke: alpha(P.line, 0.9), strokeWidth: 1, alpha: alphaV * 0.95,
      })
    }
  }
}

/** Harness 层：上下文 / 工具 / 状态 / 执行控制四组块 + 中间执行场 */
export function drawHarnessStratum(
  r: Renderer, o: SceneObject, alphaV: number, detail: number, exec: number,
): void {
  const m = o.world
  const mk = (x: number, z: number, w: number, d: number, tone: string, top: string) =>
    r.box(sub(m, x, 0.13, z, _s), w, 0.16, d, {
      faces: { default: tone, py: top }, stroke: alpha(P.lineStrong, 0.9), strokeWidth: 1, alpha: alphaV,
    })

  // 后排：上下文（左） / 状态（右）
  mk(-2.25, -0.72, 1.30, 0.78, '#dde3e8', '#f0f3f6')
  mk(2.25, -0.72, 1.30, 0.78, '#e6e2d8', '#f4f1ea')
  // 前排：工具（左） / 执行控制（右）
  mk(-2.25, 0.80, 1.30, 0.78, '#d9e5dc', '#eef5f0')
  mk(2.25, 0.80, 1.30, 0.78, '#e4ded4', '#f5f1e8')

  if (detail > 0.08) {
    // 上下文里的分层条
    for (let i = 0; i < 4; i++) {
      r.patch(m, 'py', -2.70, -0.98 + i * 0.16, -1.80, -0.90 + i * 0.16, alpha(P.inkFaint, 0.30 * alphaV), 1)
    }
    // 状态里的三格
    for (let i = 0; i < 3; i++) {
      r.patch(m, 'py', 1.72 + i * 0.36, -0.98, 1.99 + i * 0.36, -0.66, alpha(P.green, 0.22 * alphaV), 1)
    }
    // 工具格：四个
    for (let i = 0; i < 4; i++) {
      const x = -2.66 + (i % 2) * 0.58
      const z = 0.58 + Math.floor(i / 2) * 0.42
      r.patch(m, 'py', x, z, x + 0.44, z + 0.26, alpha(P.greenDeep, 0.16 * alphaV), 1)
    }
    // 执行控制：四档进度
    for (let i = 0; i < 4; i++) {
      const on = exec * 4 > i
      r.patch(
        m, 'py', 1.74 + i * 0.34, 0.62, 1.98 + i * 0.34, 0.98,
        on ? alpha(P.green, 0.55 * alphaV) : alpha(P.inkFaint, 0.18 * alphaV), 1,
      )
    }
  }
}

/** Agent 层：最终应用的外框 + 资料槽 + 结果条 */
export function drawAgentStratum(r: Renderer, o: SceneObject, alphaV: number, detail: number): void {
  const m = o.world
  // 应用外框（四条边，不用箱体）
  const w = STRATUM_HALF.w, d = STRATUM_HALF.d
  if (detail > 0.02) {
    const t = 0.06
    r.box(sub(m, 0, 0.15, -d + t / 2, _s), w * 2, 0.10, t, { faces: { default: '#cfd6cd' }, stroke: alpha(P.lineStrong, 0.9), strokeWidth: 1, alpha: alphaV })
    r.box(sub(m, 0, 0.15, d - t / 2, _s), w * 2, 0.10, t, { faces: { default: '#cfd6cd' }, stroke: alpha(P.lineStrong, 0.9), strokeWidth: 1, alpha: alphaV })
    r.box(sub(m, -w + t / 2, 0.15, 0, _s), t, 0.10, d * 2, { faces: { default: '#cfd6cd' }, stroke: alpha(P.lineStrong, 0.9), strokeWidth: 1, alpha: alphaV })
    r.box(sub(m, w - t / 2, 0.15, 0, _s), t, 0.10, d * 2, { faces: { default: '#cfd6cd' }, stroke: alpha(P.lineStrong, 0.9), strokeWidth: 1, alpha: alphaV })
  }
  if (detail > 0.05) {
    // 资料槽（两张）
    for (let i = 0; i < 2; i++) {
      const x = -1.85 + i * 1.15
      r.box(sub(m, x, 0.13, -1.30, _s), 1.00, 0.12, 0.62, {
        faces: { default: '#e7e3d9', py: '#f7f4ee' }, stroke: alpha(P.line, 0.95), strokeWidth: 1, alpha: alphaV,
      })
      r.patch(m, 'py', x - 0.42, -1.44, x + 0.42, -1.36, alpha(P.inkFaint, 0.30 * alphaV), 1)
    }
    // 结果条
    r.box(sub(m, 1.55, 0.15, 0.55, _s), 2.10, 0.14, 1.10, {
      faces: { default: '#dde6df', py: '#eef4ef' }, stroke: alpha(P.green, 0.35), strokeWidth: 1, alpha: alphaV,
    })
    if (detail > 0.2) {
      for (let i = 0; i < 3; i++) {
        r.patch(m, 'py', 0.62, 0.14 + i * 0.26, 2.48, 0.26 + i * 0.26, alpha(P.inkMuted, 0.22 * alphaV), 1)
      }
    }
    // 操作栏
    r.box(sub(m, -1.30, 0.13, 0.95, _s2), 1.90, 0.12, 0.34, {
      faces: { default: '#2b2d30', py: '#3a3d41' }, stroke: null, alpha: alphaV,
    })
    for (let i = 0; i < 3; i++) {
      r.patch(m, 'py', -2.10 + i * 0.62, 0.86, -1.72 + i * 0.62, 1.04, alpha('#f6f3ec', 0.55 * alphaV), 1)
    }
  }
}

export { sub }
