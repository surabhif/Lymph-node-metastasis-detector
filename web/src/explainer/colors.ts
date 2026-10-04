/** Shared clinical colors — keep scene materials and CSS legend swatches in lockstep. */
export const COLORS = {
  // Glass skin (cool translucent shell)
  skin: '#b8c8c6',
  skinDeep: '#8fa8a6',
  skinTranslucent: '#c5d6d4',
  skinRim: '#9ed4d0',
  // Soft pale lobules (not brown)
  breastSoft: '#f0e4dc',
  breastGlow: '#ffe8dc',
  // Soft translucent lymphoid pink-purple (follicles / healthy tissue read)
  follicle: '#d4a8c8',
  follicleGlow: '#e8c0d8',
  lymphoid: '#dcc0d4',
  // Lymph — brighter for dark cinematic panel
  vessel: '#3dcfb0',
  vesselGlow: '#6dffd4',
  sentinel: '#2ae0b8',
  node: '#5ebfa8',
  nodeHot: '#4dffc8',
  // Tumor
  tumor: '#ff6b5a',
  tumorCell: '#ff8a7a',
  tumorGlow: '#ff5544',
  // Deposits (legend swatches stay locked to these)
  itc: '#ffc4b8',
  micro: '#ff8f7a',
  macro: '#e8453a',
  // Node interior bands
  cortex: '#c8a8c0',
  paracortex: '#b898b0',
  medulla: '#a888a0',
  nodeCapsule: '#4ad4c0',
  slide: '#e6ddcf',
  patch: '#a9bfb5',
  patchHot: '#2ae0b8',
  board: '#f4efe6',
  scale: '#9ab0aa',
  // Cinematic lights / panel (not legend)
  keyWarm: '#ffe8d2',
  rimCool: '#6ec8c0',
  fillSoft: '#0a1520',
  panelDeep: '#071018',
  panelTeal: '#0c2a2e',
} as const
