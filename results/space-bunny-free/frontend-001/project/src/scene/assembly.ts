/* ==========================================================================
   装配模型：芯片 → 板卡 → 服务器 → 机柜 → 集群 → 四层结构
   ---------------------------------------------------------------------------
   全部物体在同一个世界坐标系里，父子关系一旦建立就不再改变：
     chip → card → server → rackA → cluster → root
   「移动」= 改局部矩阵；「装入」= 改 parent。二者都不销毁对象。
   每一帧的函数是 p 的纯函数：同一个 p 必然得到同一帧画面，
   因此快速反向、停在中间、导航跳转都不会重建主体或跳到另一套画面。
   ========================================================================== */

import { SceneObject, applyHover } from '../engine/scene'
import {
  clamp01, lerp, smooth, v3,
  type Vec3,
} from '../engine/math'

// ---------------------------------------------------------------------------
// 尺寸（世界单位）。芯片 1.0 宽，集群约 9.3 宽 —— 跨一个数量级。
// ---------------------------------------------------------------------------

export const DIM = {
  chip: { w: 1.00, h: 0.13, d: 1.00 },
  card: { w: 1.16, h: 0.26, d: 1.44 },
  server: { w: 1.58, h: 1.02, d: 2.30 },
  rack: { w: 1.06, h: 2.66, d: 1.44 },
  clusterPitch: { x: 1.16, z: 1.58 },
  cols: 2,
  rows: 2,
} as const

/** 板卡插槽：芯片落位点（板卡本地） */
export const SLOT = {
  pos: v3(-0.02, DIM.card.h / 2 - 0.055, 0.05),
  /** 顶盖：底面 = 基板顶面 − 0.012；芯片 h = 0.13 → 顶盖厚 0.045 */
  lidPos: v3(-0.02, DIM.card.h / 2 + 0.0015, 0.05),
  rise: 0.95,
} as const

/** 三个开放层的半尺寸（本地坐标，未缩放） */
export const STRATUM_HALF = { w: 3.30, d: 2.24, h: 0.16 }

/** 服务器主板中心 = 底板顶面 0.128 + 立柱 0.05 */
export const BOARD_Y = 0.178
/** 服务器上板卡的落位点（服务器本地） */
export const CARD_HOME = v3(0.04, BOARD_Y, 0.06)
/** 服务器在机柜内的落位点（机柜本地） */
export const SERVER_HOME = v3(0, 0.30, 0.02)

const RACK_YAW = 0.06
export const CLUSTER_YAW = 0.30

/**
 * 悬停出发位（世界坐标）。
 * 刻意保持紧凑：装配前它们聚成一团「等待被装起来」的机器，
 * 而不是散落一地的零件——构图包围盒因此在全程都稳定。
 */
const FROM = {
  chip: v3(0.02, 0.28, 0.68),
  card: v3(0.42, 0.60, 0.24),
  server: v3(0.72, 1.00, 0.56),
  rackA: v3(1.00, 0, 0.78),
  peers: [v3(0.58, 0, 0.62), v3(1.18, 0, 0.44), v3(0.58, 0, 0.26)] as Vec3[],
} as const

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

export type ChapterWeights = [number, number, number, number, number, number, number, number]

export type PhaseState = {
  chipIn: number
  cardIn: number
  serverIn: number
  rackIn: number
  peerIn: [number, number, number]
  clusterIn: number
  /** 构图重心（世界）：相机注视点由它决定 */
  centroid: Vec3
  dolly: number
  /** 章节权重 */
  w: ChapterWeights
  /** Harness 层内部执行进度 0..1（由时间驱动，与滚动解耦） */
  exec: number
  /** 四层结构进入 Agent 窗口的进度 0..1 */
  embed: number
  /** 三层开放结构的升起进度 0..1 */
  rise: number
  /** 细节档 0..1（由主体屏幕尺寸决定，关掉远处看不见的细碎几何） */
  detail: number
  /** 当前构图的世界点集合（每帧重建，勿长期持有） */
  extents: Vec3[]
}

export type AssemblyModel = {
  root: SceneObject
  cluster: SceneObject
  chip: SceneObject
  card: SceneObject
  server: SceneObject
  rackA: SceneObject
  peers: SceneObject[]
  strata: Record<'model' | 'harness' | 'agent', SceneObject>
  state: PhaseState
}

const CH_START = (i: number) => i / 8

// ---------------------------------------------------------------------------
// 场景构建（只做一次）
// ---------------------------------------------------------------------------

export function buildAssembly(): AssemblyModel {
  const root = new SceneObject('root', 'node')
  const cluster = new SceneObject('cluster', 'node')
  root.addChild(cluster)
  cluster.ry = CLUSTER_YAW

  const rackA = new SceneObject('rackA', 'rack')
  rackA.home = v3(0, 0, 0)
  rackA.pos = v3(0, 0, 0)
  rackA.homeRy = RACK_YAW
  cluster.addChild(rackA)

  const server = new SceneObject('serverA', 'server')
  server.home = SERVER_HOME
  server.pos = v3(SERVER_HOME.x, SERVER_HOME.y, SERVER_HOME.z)
  server.homeRx = 0.062
  server.rx = 0.062
  rackA.addChild(server)

  const card = new SceneObject('cardA', 'card')
  card.home = CARD_HOME
  card.pos = v3(CARD_HOME.x, CARD_HOME.y, CARD_HOME.z)
  server.addChild(card)

  const chip = new SceneObject('chip0', 'chip')
  chip.home = SLOT.pos
  chip.pos = v3(SLOT.pos.x, SLOT.pos.y, SLOT.pos.z)
  card.addChild(chip)

  // 同伴机柜：原机柜固定在 cluster 本地 (0,0,0)，其余补齐成 2×2 的机柜阵
  const peers: SceneObject[] = []
  const cols = DIM.cols
  for (let i = 0; i < 3; i++) {
    const r = new SceneObject(`rack${String.fromCharCode(66 + i)}`, 'rack')
    const col = 1 + (i % 2)
    const row = Math.floor(i / 2)
    r.home = v3((col - (cols - 1) / 2) * DIM.clusterPitch.x, 0, -row * DIM.clusterPitch.z)
    r.pos = v3(FROM.peers[i].x, FROM.peers[i].y, FROM.peers[i].z)
    r.homeRy = RACK_YAW + (i % 2 === 0 ? 0.02 : -0.015)
    cluster.addChild(r)
    peers.push(r)
  }

  // 三个开放层，堆在集群上方
  const strata: Record<'model' | 'harness' | 'agent', SceneObject> = {
    model: new SceneObject('stratum.model', 'stratum'),
    harness: new SceneObject('stratum.harness', 'stratum'),
    agent: new SceneObject('stratum.agent', 'stratum'),
  }
  strata.model.home = v3(0, 5.00, 0)
  strata.harness.home = v3(0, 7.30, 0)
  strata.agent.home = v3(0, 9.60, 0)
  for (const k of ['model', 'harness', 'agent'] as const) {
    const s = strata[k]
    s.homeRy = CLUSTER_YAW
    s.pos = v3(0, 0, 0)
    cluster.addChild(s)
  }

  return {
    root,
    cluster,
    chip,
    card,
    server,
    rackA,
    peers,
    strata,
    state: {
      chipIn: 0, cardIn: 0, serverIn: 0, rackIn: 0,
      peerIn: [0, 0, 0],
      clusterIn: 0,
      centroid: v3(0, 0.4, 0),
      dolly: 0,
      w: [1, 0, 0, 0, 0, 0, 0, 0],
      exec: 0,
      embed: 0,
      rise: 0,
      detail: 1,
      extents: [],
    },
  }
}

// ---------------------------------------------------------------------------
// 构图采样：落位 / 悬停两路
// ---------------------------------------------------------------------------

const seatedPts: Vec3[] = []
const hoverPts: Vec3[] = []

function pushBoxPts(out: Vec3[], o: SceneObject, hw: number, hh: number, hd: number): void {
  for (let i = 0; i < 8; i++) {
    const lx = i & 1 ? hw : -hw
    const ly = i & 2 ? hh : -hh
    const lz = i & 4 ? hd : -hd
    out.push(o.worldPosOf(v3(lx, ly, lz)))
  }
}

/** 是否已经落位（t ≥ 0.995 视为完成） */
const seated = (o: SceneObject): boolean => o.t >= 0.995

/**
 * 构图采样分两路：
 *   seatedPts —— 已落位的物体。决定「画面要装多大」（配合一个下限），
 *                它们是这个系统里真正稳定存在的部分。
 *   hoverPts  —— 正在飞入的物体。在算镜头注视点时只占 0.35 权重：
 *                装配中途镜头会跟着正在装的那个部件走，但不会为了它把画面拉远。
 * 芯片永远计入 seated：它是全片主角，任何一章都在讲它。
 */
function collectPts(m: AssemblyModel, s: PhaseState): void {
  seatedPts.length = 0
  hoverPts.length = 0

  pushBoxPts(seatedPts, m.chip, 0.5, 0.065, 0.5)
  if (seated(m.card)) pushBoxPts(seatedPts, m.card, DIM.card.w / 2, DIM.card.h / 2, DIM.card.d / 2)
  else pushBoxPts(hoverPts, m.card, DIM.card.w / 2, DIM.card.h / 2, DIM.card.d / 2)
  if (seated(m.server)) pushBoxPts(seatedPts, m.server, DIM.server.w / 2, DIM.server.h / 2, DIM.server.d / 2)
  else pushBoxPts(hoverPts, m.server, DIM.server.w / 2, DIM.server.h / 2, DIM.server.d / 2)
  if (seated(m.rackA)) pushBoxPts(seatedPts, m.rackA, DIM.rack.w / 2, DIM.rack.h / 2, DIM.rack.d / 2)
  else pushBoxPts(hoverPts, m.rackA, DIM.rack.w / 2, DIM.rack.h / 2, DIM.rack.d / 2)
  for (const r of m.peers) {
    if (seated(r)) pushBoxPts(seatedPts, r, DIM.rack.w / 2, DIM.rack.h / 2, DIM.rack.d / 2)
    else pushBoxPts(hoverPts, r, DIM.rack.w / 2, DIM.rack.h / 2, DIM.rack.d / 2)
  }
  // 层一旦开始进入 Agent 窗口，就退出「构图」：
  // 否则「层的位移 → 构图重心 → 相机 → 层的目标位置」会形成反馈，
  // 使同一 p 两次抵达得到不同画面（不再是纯函数）。
  if (s.embed <= 0.001) {
    for (const k of ['model', 'harness', 'agent'] as const) {
      const o = m.strata[k]
      if (o.t < 0.02) continue
      const sc = o.accumulatedScale()
      pushBoxPts(seatedPts, o, STRATUM_HALF.w * sc, 0.22 * sc, STRATUM_HALF.d * sc)
    }
  }

  s.extents = seatedPts

  // 加权重心：落位的权重 1，正在飞的权重 0.35
  let x = 0, y = 0, z = 0, w = 0
  for (const p of seatedPts) { x += p.x; y += p.y; z += p.z; w += 1 }
  for (const p of hoverPts) { x += p.x * 0.35; y += p.y * 0.35; z += p.z * 0.35; w += 0.35 }
  s.centroid = w > 0 ? v3(x / w, y / w, z / w) : v3(0, 0.4, 0)
}


// ---------------------------------------------------------------------------
// 相机关键帧：只控制推近比例
// ---------------------------------------------------------------------------
// 注视点不写死，而是由构图重心实时决定（见 collectPts）——
// 这样无论正在装配的是哪个部件，主体都不会被推出画面；
// 而「镜头拉远揭示集群」是自然发生的：落位的东西变多，
// 包围盒与重心一起长大，镜头随之后退。

type Key = { at: number; dolly: number }

const KEYS: Key[] = [
  { at: 0.000, dolly: 0.00 },
  { at: 0.100, dolly: 0.06 },
  { at: 0.140, dolly: 0.12 },
  { at: 0.225, dolly: 0.10 },
  { at: 0.252, dolly: 0.04 },
  { at: 0.318, dolly: 0.22 },
  { at: 0.348, dolly: 0.10 },
  { at: 0.412, dolly: 0.28 },
  { at: 0.444, dolly: 0.06 },
  { at: 0.508, dolly: 0.22 },
  { at: 0.548, dolly: 0.14 },
  { at: 0.588, dolly: 0.20 },
  { at: 0.660, dolly: 0.10 },
  { at: 0.700, dolly: 0.00 },
  { at: 0.740, dolly: -0.14 },
  { at: 0.790, dolly: 0.02 },
  { at: 0.845, dolly: 0.06 },
  { at: 0.900, dolly: 0.12 },
  { at: 0.950, dolly: 0.14 },
  { at: 1.000, dolly: 0.02 },
]

function sampleKeys(p: number, out: PhaseState): void {
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].at) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  out.dolly = lerp(a.dolly, b.dolly, smooth(p, a.at, b.at))
}

// ---------------------------------------------------------------------------
// 每帧更新
// ---------------------------------------------------------------------------

export function updateAssembly(m: AssemblyModel, p: number, exec: number): PhaseState {
  const s = m.state
  const pc = clamp01(p)

  const f = pc * 8
  for (let i = 0; i < 8; i++) s.w[i] = Math.max(0, 1 - Math.abs(f - (i + 0.5)) / 0.5)

  sampleKeys(pc, s)

  // ---- 装配进度 ----
  s.chipIn = smooth(pc, CH_START(0) + 0.085, CH_START(1) - 0.012)
  s.cardIn = smooth(pc, CH_START(1) + 0.028, CH_START(1) + 0.100)
  s.serverIn = smooth(pc, CH_START(2) + 0.026, CH_START(2) + 0.102)
  s.rackIn = smooth(pc, CH_START(3) + 0.026, CH_START(3) + 0.106)
  // 四台机柜在第 04 章末到第 05 章内陆续补齐，
  // 全部在第 05 章结束前落位——「拉远揭示集群」发生在集群章的后半段。
  s.peerIn = [
    smooth(pc, CH_START(3) + 0.140, CH_START(3) + 0.218),
    smooth(pc, CH_START(3) + 0.226, CH_START(4) + 0.048),
    smooth(pc, CH_START(4) + 0.056, CH_START(4) + 0.118),
  ]
  s.exec = exec
  s.embed = smooth(pc, 0.952, 1.0)

  // ---- 父级先落位，子级再从世界坐标换算出发位（保证起飞位置恒定） ----
  applyHover(m.rackA, FROM.rackA, 1.55, v3(0.20, 0, 0.22), -0.14, 0.04, s.rackIn, s.rackIn)

  const serverFrom = m.rackA.worldToLocal(FROM.server)
  applyHover(m.server, serverFrom, 1.35, v3(0.14, 0, 0.18), 0.20, -0.05, s.serverIn, s.serverIn)

  const cardFrom = m.server.worldToLocal(FROM.card)
  applyHover(m.card, cardFrom, 1.05, v3(0.08, 0, 0.12), 0.15, -0.09, s.cardIn, s.cardIn)

  const chipFrom = m.card.worldToLocal(FROM.chip)
  applyHover(m.chip, chipFrom, SLOT.rise, v3(0, 0, 0), 0, 0, s.chipIn, s.chipIn)

  m.peers.forEach((r, i) => {
    const t = s.peerIn[i]
    const from = m.cluster.worldToLocal(FROM.peers[i])
    applyHover(r, from, 1.5, v3(0.18, 0, 0.18), -0.12, 0.03, t, t)
  })

  // ---- 三个开放层：第 06 章升起，第 08 章末进入 Agent 窗口 ----
  const rise = smooth(pc, CH_START(5) + 0.024, CH_START(5) + 0.084)
  s.rise = rise
  const em = s.embed
  for (const k of ['model', 'harness', 'agent'] as const) {
    const o = m.strata[k]
    // 关键：从「与 p 无关的基准姿态」插值，而不是从上一次的 pos 插值。
    // 窗口变形阶段会在渲染层改写 pos；若这里以 pos 为起点，
    // 反复抵达同一 p 会累积偏移，破坏纯函数性。
    o.homePos = v3(0, o.home.y * rise, 0)
    if (em <= 0.001) {
      o.pos = { x: o.homePos.x, y: o.homePos.y, z: o.homePos.z }
      o.scale = 1
      o.ry = CLUSTER_YAW
      o.rx = 0
    }
    o.t = rise
  }

  m.cluster.ry = CLUSTER_YAW
  m.root.updateWorld()

  // 构图包围盒 + 重心，供渲染层拟合相机
  collectPts(m, s)
  return s
}

/**
 * 细节档：由「当前主体在屏幕上的高度」决定。
 * 集群全景时关掉引脚、鳍片、风扇叶片等细节——它们在 3px 时只是噪点，
 * 却是实打实的绘制开销。
 */
export function detailFor(extH: number, scale: number): number {
  const px = extH * scale
  if (px < 200) return 0.16
  if (px < 320) return 0.38
  if (px < 500) return 0.66
  return 1
}

// ---------------------------------------------------------------------------
// 校验探针：把「同一颗芯片一直在板卡上」变成可断言的事实
// ---------------------------------------------------------------------------

export type IdentityProbe = {
  chipParentId: string
  cardParentId: string
  serverParentId: string
  chipSeatedError: number
  cardSeatedError: number
  serverSeatedError: number
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function probeIdentity(m: AssemblyModel): IdentityProbe {
  const slotWorld = m.card.worldPosOf(SLOT.pos)
  const cardHomeWorld = m.server.worldPosOf(CARD_HOME)
  const serverHomeWorld = m.rackA.worldPosOf(SERVER_HOME)
  return {
    chipParentId: m.chip.parent?.id ?? '',
    cardParentId: m.card.parent?.id ?? '',
    serverParentId: m.server.parent?.id ?? '',
    chipSeatedError: dist(m.chip.worldPos, slotWorld),
    cardSeatedError: dist(m.card.worldPos, cardHomeWorld),
    serverSeatedError: dist(m.server.worldPos, serverHomeWorld),
  }
}
