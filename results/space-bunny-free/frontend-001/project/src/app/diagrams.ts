/* ==========================================================================
   静态示意图（每章一张）
   ---------------------------------------------------------------------------
   用途：小屏 / 减少动态 / 文字放大 200% 时的阅读模式。
   它们不替代主体动画，只是把同一套结构用静态方式讲一遍。
   统一视觉语言：暖白底、墨黑线、绿色强调、同一套等距视角。
   ========================================================================== */

import { P } from '../engine/palette'

const NS = 'http://www.w3.org/2000/svg'

type El = SVGElement

function svg(vbW: number, vbH: number, label: string): { s: SVGSVGElement; g: SVGGElement } {
  const s = document.createElementNS(NS, 'svg')
  s.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`)
  s.setAttribute('role', 'img')
  s.setAttribute('aria-label', label)
  const g = document.createElementNS(NS, 'g')
  s.append(g)
  return { s, g }
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number>, parent: El,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
  parent.append(n)
  return n
}

/** 等距投影：与主舞台同一个视角（pitch 25° / yaw -38°） */
function iso(x: number, y: number, z: number, s = 46, ox = 0, oy = 0): { x: number; y: number } {
  const cθ = Math.cos(-0.6632), sθ = Math.sin(-0.6632)
  const cφ = Math.cos(0.4363), sφ = Math.sin(0.4363)
  const rx = cθ * x + sθ * z
  const uy = sφ * sθ * x + cφ * y - sφ * cθ * z
  return { x: ox + rx * s, y: oy - uy * s }
}

/** 以等距画一个长方体的可见三个面 */
function isoBox(
  parent: El, cx: number, cy: number, cz: number,
  w: number, h: number, d: number,
  fill: { top: string; left: string; right: string },
  s = 46, ox = 0, oy = 0, stroke = P.lineStrong,
): El {
  const g = el('g', {}, parent)
  const P0 = (x: number, y: number, z: number) => iso(x, y, z, s, ox, oy)
  const a = P0(cx - w / 2, cy + h / 2, cz + d / 2)
  const b = P0(cx + w / 2, cy + h / 2, cz + d / 2)
  const c = P0(cx + w / 2, cy + h / 2, cz - d / 2)
  const e = P0(cx - w / 2, cy + h / 2, cz - d / 2)
  const f = P0(cx - w / 2, cy - h / 2, cz + d / 2)
  const gg = P0(cx + w / 2, cy - h / 2, cz + d / 2)
  const hh = P0(cx + w / 2, cy - h / 2, cz - d / 2)

  // 顶面
  el('polygon', { points: `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${e.x},${e.y}`, fill: fill.top, stroke, 'stroke-width': 1 }, g)
  // 右面
  el('polygon', { points: `${b.x},${b.y} ${c.x},${c.y} ${hh.x},${hh.y} ${gg.x},${gg.y}`, fill: fill.right, stroke, 'stroke-width': 1 }, g)
  // 左面
  el('polygon', { points: `${a.x},${a.y} ${b.x},${b.y} ${gg.x},${gg.y} ${f.x},${f.y}`, fill: fill.left, stroke, 'stroke-width': 1 }, g)
  return g
}

function caption(text: string, x: number, y: number, parent: El, anchor = 'start'): void {
  el('text', {
    x, y, 'text-anchor': anchor, 'font-size': 11.5, fill: P.inkMuted,
    'font-family': "'Noto Sans SC Variable', system-ui, sans-serif",
  }, parent).textContent = text
}

function techLabel(text: string, x: number, y: number, parent: El, anchor = 'start'): void {
  el('text', {
    x, y, 'text-anchor': anchor, 'font-size': 9.5, fill: P.inkFaint,
    'font-family': "'Inter Variable', system-ui, sans-serif", 'letter-spacing': '0.08em',
  }, parent).textContent = text
}

const F = {
  top: '#fbf9f4', left: '#e2e0d6', right: '#d3d0c4',
  green: { top: '#22814e', left: '#1d6b3f', right: '#14512f' },
  metal: { top: '#e2e4e6', left: '#c9ccce', right: '#9aa0a5' },
  dark: { top: '#3b3f43', left: '#2e3134', right: '#212427' },
}

export type Diagram = { node: () => SVGSVGElement; caption: string }

export const DIAGRAMS: Record<string, Diagram> = {
  chip: {
    caption: '一颗芯片：绿色基板 + 银色顶盖 + 标记。它在后续章节里始终是同一颗。',
    node: () => {
      const { s, g } = svg(320, 200, '芯片示意图：绿色基板与银色顶盖')
      const ox = 150, oy = 130
      isoBox(g, 0, -0.02, 0, 1.0, 0.13, 1.0, F.green, 120, ox, oy)
      isoBox(g, 0, 0.085, 0, 0.84, 0.045, 0.84, F.metal, 120, ox, oy)
      techLabel('HUAWEI / Ascend', ox, oy - 96, g, 'middle')
      // 顶面标记
      const m1 = iso(-0.30, 0.11, 0.05, 120, ox, oy)
      const m2 = iso(0.30, 0.11, 0.05, 120, ox, oy)
      el('line', { x1: m1.x, y1: m1.y, x2: m2.x, y2: m2.y, stroke: P.green, 'stroke-width': 3, 'stroke-linecap': 'round' }, g)
      caption('芯片 0', 18, 28, g)
      techLabel('DIE', 18, 44, g)
      // 引脚
      for (let i = 0; i < 11; i++) {
        const a = iso(-0.43 + i * 0.086, -0.055, 0.5, 120, ox, oy)
        const b = iso(-0.43 + i * 0.086, -0.012, 0.5, 120, ox, oy)
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#c9a227', 'stroke-width': 2.4 }, g)
      }
      return s
    },
  },
  card: {
    caption: '芯片落入板卡插槽，板上还有供电接口、散热片与两枚风扇。',
    node: () => {
      const { s, g } = svg(360, 210, '板卡示意图：芯片已装入插槽')
      const ox = 180, oy = 150
      isoBox(g, 0, 0, 0, 1.16, 0.26, 1.44, F.green, 100, ox, oy)
      // 插槽金手指
      for (let i = 0; i < 15; i++) {
        const a = iso(-0.46 + i * 0.066, 0.135, -0.70, 100, ox, oy)
        const b = iso(-0.46 + i * 0.066, 0.135, -0.60, 100, ox, oy)
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#c9a227', 'stroke-width': 3 }, g)
      }
      // 顶盖 + 散热
      isoBox(g, -0.02, 0.30, 0.05, 0.84, 0.05, 0.84, F.metal, 100, ox, oy)
      isoBox(g, -0.02, 0.45, 0.05, 0.86, 0.20, 0.86, F.metal, 100, ox, oy)
      for (let i = 0; i < 2; i++) {
        const fx = i === 0 ? -0.02 - 0.205 : -0.02 + 0.205
        const c = iso(fx, 0.56, 0.05, 100, ox, oy)
        el('circle', { cx: c.x, cy: c.y, r: 12, fill: '#9aa0a5', stroke: '#6f757b', 'stroke-width': 1 }, g)
        el('circle', { cx: c.x, cy: c.y, r: 3.4, fill: '#2e3134' }, g)
      }
      caption('加速卡', 18, 28, g)
      techLabel('BOARD · SLOT OCCUPIED', 18, 44, g)
      return s
    },
  },
  server: {
    caption: '板卡插入服务器主板。侧板以线框表示，芯片仍在原来的位置。',
    node: () => {
      const { s, g } = svg(380, 220, '服务器示意图：板卡装入机箱主板')
      const ox = 190, oy = 165
      // 机箱（半透明）
      isoBox(g, 0, 0, 0, 1.58, 1.02, 2.30, F.dark, 72, ox, oy)
      isoBox(g, 0, 0.178, 0.06, 0.86, 0.03, 1.4, { top: '#276b43', left: '#1f5f3a', right: '#194a2e' }, 72, ox, oy)
      isoBox(g, 0.04, 0.30, 0.06, 1.16, 0.26, 1.44, F.green, 72, ox, oy)
      isoBox(g, 0.02, 0.62, 0.11, 0.86, 0.20, 0.86, F.metal, 72, ox, oy)
      caption('服务器', 18, 28, g)
      techLabel('SERVER · BOARD SEATED', 18, 44, g)
      return s
    },
  },
  rack: {
    caption: '服务器推入机柜，机柜提供供电、散热与纳管。',
    node: () => {
      const { s, g } = svg(340, 240, '机柜示意图')
      const ox = 170, oy = 200
      // 机柜框架
      const H = 2.66, W = 1.06, D = 1.44
      const corners: [number, number, number][] = []
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, H]) corners.push([sx * W / 2, y, sz * D / 2])
      for (let i = 0; i < 4; i++) {
        const b = i * 4 + 4
        if (b >= corners.length) break
        const a = iso(corners[i][0], corners[i][1], corners[i][2], 78, ox, oy)
        const c = iso(corners[b][0], corners[b][1], corners[b][2], 78, ox, oy)
        el('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, stroke: P.inkMuted, 'stroke-width': 1.6 }, g)
      }
      isoBox(g, 0, 0.035, 0, W + 0.06, 0.07, D + 0.06, F.dark, 78, ox, oy)
      isoBox(g, 0, H - 0.03, 0, W, 0.06, D, F.dark, 78, ox, oy)
      isoBox(g, 0, 0.30, 0, 0.9, 0.42, 1.2, F.dark, 78, ox, oy)
      isoBox(g, 0, 0.86, 0, 0.9, 0.34, 1.2, { top: '#3d4247', left: '#34383c', right: '#2b2f33' }, 78, ox, oy)
      isoBox(g, 0, 1.44, 0, 0.9, 0.40, 1.2, { top: '#3d4247', left: '#34383c', right: '#2b2f33' }, 78, ox, oy)
      isoBox(g, 0, H - 0.24, 0, 0.9, 0.30, 1.1, { top: '#464b50', left: '#3a3e42', right: '#303438' }, 78, ox, oy)
      caption('机柜', 18, 28, g)
      techLabel('RACK', 18, 44, g)
      return s
    },
  },
  cluster: {
    caption: '镜头拉远：原机柜与另外三台机柜一起构成一个集群。',
    node: () => {
      const { s, g } = svg(440, 250, '集群示意图：四台机柜')
      const ox = 220, oy = 210, sc = 46
      const pos: [number, number][] = [[0, 0], [1.14, 0], [2.28, 0], [0.57, -1.56], [1.71, -1.56]]
      for (let i = 0; i < pos.length; i++) {
        const [x, z] = pos[i]
        const isA = i === 0
        isoBox(g, x, 0, z, 1.06, 2.66, 1.44, isA ? F.dark : { top: '#34383c', left: '#2b2f33', right: '#232629' }, sc, ox, oy)
        if (isA) {
          const m = iso(x, 1.55, z, sc, ox, oy)
          el('circle', { cx: m.x, cy: m.y, r: 3, fill: P.green }, g)
        }
      }
      // 互联
      for (const [x, z] of pos.slice(1)) {
        const a = iso(0, 1.0, 0, sc, ox, oy)
        const b = iso(x, 1.0, z, sc, ox, oy)
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: P.green, 'stroke-width': 1.2, 'stroke-dasharray': '4 4', opacity: 0.6 }, g)
      }
      caption('集群', 18, 28, g)
      techLabel('CLUSTER · ORIGINAL RACK HIGHLIGHTED', 18, 44, g)
      return s
    },
  },
  model: {
    caption: '在集群上方升起模型层：推理服务以开放平台的方式表达，而不是塞进一个箱体。',
    node: () => {
      const { s, g } = svg(420, 230, '模型层示意图')
      const ox = 210, oy = 190, sc = 40
      // 集群
      for (const [x, z] of [[0, 0], [1.1, 0], [0.55, -1.5]] as [number, number][]) {
        isoBox(g, x, 1.33, z, 1.0, 2.66, 1.4, F.dark, sc * 0.8, ox, oy)
      }
      // 模型层
      const y0 = 5.0
      isoBox(g, 0, y0, 0, 6.6, 0.16, 4.5, { top: '#fbf9f4', left: '#e7e2d6', right: '#d8d2c4' }, sc, ox, oy)
      isoBox(g, -1.3, y0 + 0.17, 0, 1.1, 0.18, 1.1, { top: '#f1f4f1', left: '#dfe4e0', right: '#ccd2ce' }, sc, ox, oy)
      isoBox(g, 0.95, y0 + 0.15, -0.55, 1.3, 0.14, 0.3, { top: '#eef2ec', left: '#d9dfd8', right: '#c5ccc4' }, sc, ox, oy)
      const a = iso(3.2, y0 + 0.1, 0, sc, ox, oy)
      techLabel('模型层 · 推理服务', a.x, a.y - 6, g, 'end')
      caption('模型层', 18, 28, g)
      return s
    },
  },
  harness: {
    caption: 'Harness 层：上下文、工具、状态、执行控制围出中心执行场，信号沿连续路径流动。',
    node: () => {
      const { s, g } = svg(440, 250, 'Harness 层示意图')
      const ox = 220, oy = 200, sc = 40
      const y0 = 5.0
      isoBox(g, 0, y0, 0, 6.6, 0.16, 4.5, { top: '#fbf9f4', left: '#e7e2d6', right: '#d8d2c4' }, sc, ox, oy)
      const y1 = y0 + 2.3
      isoBox(g, 0, y1, 0, 6.6, 0.16, 4.5, { top: '#fbf9f4', left: '#e7e2d6', right: '#d8d2c4' }, sc, ox, oy)
      const blk = (x: number, z: number, c: { top: string; left: string; right: string }) =>
        isoBox(g, x, y1 + 0.13, z, 1.3, 0.16, 0.78, c, sc, ox, oy)
      blk(-2.25, -0.72, { top: '#f0f3f6', left: '#dde3e8', right: '#c6ced4' })
      blk(2.25, -0.72, { top: '#f4f1ea', left: '#e6e2d8', right: '#d0cbc0' })
      blk(-2.25, 0.80, { top: '#eef5f0', left: '#d9e5dc', right: '#c2d2c7' })
      blk(2.25, 0.80, { top: '#f5f1e8', left: '#e4ded4', right: '#cec7bb' })
      // 回路
      const pts: [number, number][] = [[-2.25, -0.72], [0, 0], [2.25, -0.72], [1.3, 0.8], [0, 0.62], [-1.3, 0.8], [-2.25, 0.8]]
      for (let i = 0; i < pts.length - 1; i++) {
        const a = iso(pts[i][0], y1 + 0.12, pts[i][1], sc, ox, oy)
        const b = iso(pts[i + 1][0], y1 + 0.12, pts[i + 1][1], sc, ox, oy)
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: P.green, 'stroke-width': 1.4, opacity: 0.65 }, g)
      }
      for (const k of [0.28, 0.62]) {
        const t = k * (pts.length - 1)
        const i = Math.floor(t), f = t - i
        const a = iso(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y1 + 0.12, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, sc, ox, oy)
        el('circle', { cx: a.x, cy: a.y, r: 4, fill: P.greenBright }, g)
      }
      caption('Harness 层', 18, 28, g)
      techLabel('CONTEXT · TOOLS · STATE · CONTROL', 18, 44, g)
      return s
    },
  },
  agent: {
    caption: 'Agent 层是最终应用；四层结构整体进入窗口运行区，结构本身没有换。',
    node: () => {
      const { s, g } = svg(440, 250, 'Agent 层与窗口示意图')
      const ox = 220, oy = 205, sc = 38
      const y0 = 5.0
      const names = ['模型层', 'Harness 层', 'Agent 层']
      for (let k = 0; k < 3; k++) {
        const y = y0 + k * 2.3
        isoBox(g, 0, y, 0, 6.6, 0.16, 4.5, { top: '#fbf9f4', left: '#e7e2d6', right: '#d8d2c4' }, sc, ox, oy)
        const a = iso(3.4, y + 0.1, 0, sc, ox, oy)
        techLabel(names[k].toUpperCase(), a.x, a.y - 4, g, 'end')
      }
      // 窗口
      el('rect', { x: 12, y: 60, width: 416, height: 176, rx: 10, fill: 'none', stroke: P.lineStrong, 'stroke-width': 1.4, 'stroke-dasharray': '6 5' }, g)
      caption('Agent 窗口', 24, 84, g)
      return s
    },
  },
}
