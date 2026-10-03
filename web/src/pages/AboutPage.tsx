export default function AboutPage() {
  return (
    <article className="panel prose fade-in">
      <h1>About / Method</h1>
      <p>
        Lymph-node status helps decide how breast-cancer surgery is planned. This project
        studies an educational question: can a small convolutional network, fine-tuned on
        public PatchCamelyon (PCam) patches, score the chance that a 96×96 lymph-node
        histology patch contains metastatic tumor — and show <em>where</em> it looked using
        a class activation map?
      </p>

      <h2>Why this problem</h2>
      <p>
        PCam is a CC0 dataset of 327,680 patches from Camelyon16 lymph-node slides. It is
        de-identified public research data. The clinical stakes of lymph-node assessment
        motivate careful, honest modeling — not a claim that this demo replaces a pathologist.
      </p>

      <h2>Method (planned / student-run)</h2>
      <ul>
        <li>
          Fine-tune a small ImageNet-pretrained CNN (ResNet-18 or MobileNetV2) in PyTorch on
          Google Colab.
        </li>
        <li>
          Keep PCam&apos;s official train / valid / test splits. Never reshuffle across
          splits — that would leak patient/slide information and inflate scores.
        </li>
        <li>
          Evaluate with accuracy, ROC-AUC (with a bootstrap confidence interval), a
          calibration/reliability plot, a confusion matrix, and a gallery of confident
          mistakes.
        </li>
        <li>
          Export to ONNX with outputs needed for browser CAM: class probability, final conv
          feature maps, and classifier weights so the site can compute{' '}
          <code>CAM = weighted sum of feature maps</code> without gradients.
        </li>
        <li>
          Run inference entirely in the visitor&apos;s browser with ONNX Runtime Web.
        </li>
      </ul>

      <h2>What this site does</h2>
      <p>
        For ~96×96 patches it shows P(metastasis) and a CAM heatmap. For larger images it
        scans patch-by-patch and overlays a tumor-probability map. Until a trained export
        is installed, the bundled model is an untrained placeholder so the UI can be tested.
      </p>

      <h2>Citations</h2>
      <ul>
        <li>
          Veeling, B. S., Linmans, J., Winkens, J., Cohen, T., &amp; Welling, M. (2018).
          Rotation equivariant CNNs for digital pathology. <em>MICCAI</em>. PCam dataset
          (CC0):{' '}
          <a href="https://github.com/basveeling/pcam" rel="noreferrer" target="_blank">
            github.com/basveeling/pcam
          </a>
        </li>
        <li>
          Ehteshami Bejnordi, B., et al. (2017). Diagnostic assessment of deep learning
          algorithms for detection of lymph node metastases in women with breast cancer.
          <em> JAMA</em>. Camelyon16.
        </li>
        <li>
          Mitchell, M., et al. (2019). Model cards for model reporting. <em>FAT*</em>.
        </li>
      </ul>

      <h2>Ethics</h2>
      <p>
        No real clinic PHI is used. Licenses are respected (PCam is CC0). Metrics will not
        be overclaimed. This is a research demo — not for clinical use.
      </p>
    </article>
  )
}
