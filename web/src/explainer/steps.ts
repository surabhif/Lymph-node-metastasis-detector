/** Educational step copy — plain language, not medical advice. */

export type ExplainerStepId =
  | 'lymphatic'
  | 'spread'
  | 'inside'
  | 'surgery'
  | 'patches'

export type ExplainerStep = {
  id: ExplainerStepId
  title: string
  /** Short label for the compact stepper */
  shortTitle: string
  kicker: string
  body: string
  /** Screen-reader / reduced-motion text alternative for the 3D scene */
  alt: string
  /** Optional callouts shown as chips beside the scene */
  callouts?: { label: string; detail: string }[]
}

export const EXPLAINER_STEPS: ExplainerStep[] = [
  {
    id: 'lymphatic',
    kicker: 'Step 1 · Anatomy',
    shortTitle: 'Lymphatics',
    title: 'The lymphatic system near the breast',
    body: 'Lymph vessels carry fluid and immune cells. Around the breast, many of those vessels drain toward lymph nodes in the underarm (axilla). Those nodes help filter lymph before it returns to the bloodstream.',
    alt: 'A stylized torso shows a breast region, thin lymph vessels, and several axillary lymph nodes. You can rotate the view and focus a node to see its label.',
    callouts: [
      { label: 'Axillary nodes', detail: 'Underarm lymph nodes that often receive lymph from the breast' },
      { label: 'Lymph vessels', detail: 'Thin channels that carry lymph fluid' },
    ],
  },
  {
    id: 'spread',
    kicker: 'Step 2 · Metastasis path',
    shortTitle: 'Spread',
    title: 'How cancer can travel through lymph',
    body: 'Some breast cancers shed cells that enter lymph vessels. The first node that typically receives drainage from the tumor area is called the sentinel node. Cells may stop there — or, less often, continue to further nodes.',
    alt: 'Animated tumor cells leave a breast tumor, travel along a lymph vessel, arrive at the sentinel node first, then some continue to a farther node.',
    callouts: [
      { label: 'Sentinel node', detail: 'Usually the first axillary node in the drainage path from the tumor' },
      { label: 'Further nodes', detail: 'Additional axillary nodes downstream of the sentinel' },
    ],
  },
  {
    id: 'inside',
    kicker: 'Step 3 · What pathologists look for',
    shortTitle: 'Inside node',
    title: 'Inside a lymph node',
    body: 'A cut-away view of a node: healthy lymphoid tissue versus tumor deposits. Pathologists describe deposit size with standard thresholds — isolated tumor cells, micrometastasis, and macrometastasis — which help classify how much tumor is present in the node.',
    alt: 'A cut-away lymph node shows normal tissue and three sizes of metastatic deposit: isolated tumor cells (≤0.2 mm), micrometastasis (greater than 0.2 mm up to 2 mm), and macrometastasis (greater than 2 mm).',
    callouts: [
      { label: 'ITC ≤ 0.2 mm', detail: 'Isolated tumor cells or tiny clusters' },
      { label: 'Micro ≤ 2 mm', detail: 'Micrometastasis: larger than 0.2 mm, up to 2 mm' },
      { label: 'Macro > 2 mm', detail: 'Macrometastasis: larger than 2 mm' },
    ],
  },
  {
    id: 'surgery',
    kicker: 'Step 4 · Why surgeons care',
    shortTitle: 'Surgery',
    title: 'Surgery choices and staging',
    body: 'Sentinel lymph node biopsy samples the first draining node(s) with a smaller operation. Axillary lymph node dissection removes more nodes and is a larger procedure. Node findings feed into the N category of TNM staging — a structured way teams summarize tumor (T), nodes (N), and distant spread (M). This explainer is educational only, not advice about any person’s care.',
    alt: 'Two side-by-side BodyParts3D torso views: sentinel lymph node biopsy highlighting one to three axillary nodes, versus axillary dissection highlighting levels I and II, with a TNM N-category cue.',
    callouts: [
      { label: 'SLNB', detail: 'Sentinel lymph node biopsy — fewer nodes sampled' },
      { label: 'ALND', detail: 'Axillary lymph node dissection — more nodes removed' },
      { label: 'N in TNM', detail: 'Node status used in staging summaries' },
    ],
  },
  {
    id: 'patches',
    kicker: 'Step 5 · Into this research demo',
    shortTitle: 'Patches',
    title: 'From whole-slide image to 96×96 patches',
    body: 'Pathology slides are enormous. Datasets like PatchCamelyon (PCam) cut them into small 96×96 patches so models can learn to score metastatic tissue. In PCam, a patch is labeled tumor if the center 32×32 region contains tumor tissue. The mosaic here is stitched from real PCam test patches (not one contiguous slide) to show that tiling. The detector demo runs the same idea in your browser with a class-activation heatmap.',
    alt: 'A mosaic of real H&E-stained PCam patches stands in for a whole-slide image. A grid marks 96 by 96 tiles; tumor-labeled tiles are tinted. One tumor patch lifts and zooms to show its ground-truth label and the center 32 by 32 labeling region.',
    callouts: [
      { label: 'PCam mosaic', detail: 'Real H&E test patches (CC0) stitched as a WSI stand-in — not contiguous tissue' },
      { label: '96×96 tiles', detail: 'Grid aligned to patch boundaries' },
      { label: 'Center 32×32', detail: 'PCam labels a patch tumor if this central region contains tumor' },
    ],
  },
]

export const EXPLAINER_SOURCES: { name: string; href: string; note: string }[] = [
  {
    name: 'National Cancer Institute — Lymph Nodes and Cancer',
    href: 'https://www.cancer.gov/about-cancer/diagnosis-staging/staging/lymph-nodes-fact-sheet',
    note: 'Plain-language overview of lymph nodes and cancer.',
  },
  {
    name: 'American Cancer Society — Lymph Node Surgery for Breast Cancer',
    href: 'https://www.cancer.org/cancer/types/breast-cancer/treatment/surgery-for-breast-cancer/lymph-node-surgery-for-breast-cancer.html',
    note: 'Sentinel node biopsy vs axillary dissection (patient education).',
  },
  {
    name: 'NCI PDQ — Breast Cancer Treatment (health professional)',
    href: 'https://www.cancer.gov/types/breast/hp/breast-treatment-pdq',
    note: 'Staging context including nodal categories; for clinicians/educators.',
  },
  {
    name: 'AJCC / cancer staging overview (ACS)',
    href: 'https://www.cancer.org/cancer/diagnosis-staging/staging.html',
    note: 'TNM staging explained for a general audience.',
  },
  {
    name: 'PatchCamelyon (PCam) — Veeling et al.',
    href: 'https://github.com/basveeling/pcam',
    note: 'Public 96×96 lymph-node patches derived from Camelyon16 (CC0).',
  },
  {
    name: 'BodyParts3D / Anatomography — Database Center for Life Science',
    href: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html',
    note:
      'Upper-torso GLB in the explainer (skin, pectoralis major/minor, deltoid, clavicles, sternum, proximal humeri). License: CC BY 4.0 International. Attribution: “BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International”. Cropped/decimated/Draco-compressed for the web; educational lymph overlays added in-app.',
  },
]
