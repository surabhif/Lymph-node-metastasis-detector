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
    alt: 'Two schematic procedures: a focused sentinel-node biopsy versus a broader axillary dissection, plus a simple TNM diagram highlighting the N (node) category.',
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
    body: 'Pathology slides are enormous. Datasets like PatchCamelyon (PCam) cut them into small 96×96 patches so models can learn to score metastatic tissue. The detector demo runs that idea in your browser and can highlight which regions pushed the score — a class-activation heatmap.',
    alt: 'A whole-slide image is tiled into a grid of 96 by 96 patches. One patch is highlighted, linking to the in-browser detector and heatmap concept.',
    callouts: [
      { label: 'PCam', detail: 'Public PatchCamelyon dataset of lymph-node patches (CC0)' },
      { label: 'Heatmap', detail: 'Shows regions that most influenced the model score' },
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
