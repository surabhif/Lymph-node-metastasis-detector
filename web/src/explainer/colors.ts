/** Shared clinical colors — keep scene materials and CSS legend swatches in lockstep. */
export const COLORS = {
  // Glass skin (cool translucent shell — neutral, not brand)
  skin: '#c4bcbc',
  skinDeep: '#a89898',
  skinTranslucent: '#d4cccc',
  skinRim: '#e0b8b6',
  // Soft pale lobules
  breastSoft: '#f0e4dc',
  breastGlow: '#ffe8dc',
  // Soft translucent lymphoid pink-purple (follicles / healthy tissue read)
  follicle: '#e898c4',
  follicleGlow: '#ffa8d8',
  lymphoid: '#e8a8d0',
  // Lymph vessels / nodes — rose-warm brand family (was teal)
  vessel: '#c48a88',
  vesselGlow: '#e8b4b2',
  sentinel: '#9b5654',
  node: '#b06a68',
  nodeHot: '#d4847f',
  // Tumor — malignant semantic red (distinct from brand rose)
  tumor: '#ff6b5a',
  tumorCell: '#ff8a7a',
  tumorGlow: '#ff5544',
  // Deposits (legend swatches stay locked to these)
  itc: '#ffc4b8',
  micro: '#ff8f7a',
  macro: '#e8453a',
  // Node interior bands — soft pink-lilac so tissue reads as lymphoid, not grey
  cortex: '#d898c0',
  paracortex: '#c488b0',
  medulla: '#b078a0',
  nodeCapsule: '#c49a99',
  slide: '#e6ddcf',
  patch: '#c4b0b0',
  patchHot: '#9b5654',
  board: '#f4efe6',
  scale: '#b0a0a0',
  // Cinematic lights / panel (not legend)
  keyWarm: '#ffe8d2',
  rimCool: '#e0b8b6',
  fillSoft: '#0a1520',
  panelDeep: '#071018',
  panelTeal: '#2a1818',
} as const
