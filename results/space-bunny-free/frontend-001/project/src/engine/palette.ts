/* ==========================================================================
   调色板
   暖白 / 墨黑 / 克制绿。金属与电路板色只服务于「这是一台机器」。
   ========================================================================== */

export const P = {
  paper: '#f6f3ec',
  paperRaised: '#fbf9f4',
  paperSunken: '#efeade',
  panel: '#fffdf9',
  panelSolid: '#fffdf9',

  ink: '#17181a',
  inkStrong: '#0b0c0d',
  inkBody: '#2b2d30',
  inkMuted: '#62656a',
  inkFaint: '#8b8f95',
  inkGhost: '#a8acb1',

  green: '#1f7a4d',
  greenBright: '#2e9a63',
  greenDeep: '#0f4f31',
  greenInk: '#0f4f31',
  greenWash: '#e6efe7',
  greenWash2: '#d6e4d8',

  pcb: '#1d6b3f',
  pcbDark: '#14512f',
  pcbTrace: '#2f8f5b',
  pcbEdge: '#0f4527',

  metal: '#c9ccce',
  metalLight: '#e2e4e6',
  metalDark: '#9aa0a5',
  metalDeep: '#7b8188',

  chassis: '#2e3134',
  chassisTop: '#3b3f43',
  chassisSide: '#212427',
  chassisLip: '#585d62',
  slotDark: '#1a1c1e',

  line: '#ddd8cc',
  lineStrong: '#c6c0b1',
  lineFaint: '#e9e5da',

  amber: '#b07a1f',
  danger: '#a23a2c',
  focus: '#0b0c0d',
} as const

/** 主题色的 rgba 变体（Canvas 需要透明通道） */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** 两个十六进制色之间线性插值 */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return `rgb(${r}, ${g}, ${bl})`
}
