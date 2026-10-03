export default function ResultsPage() {
  return (
    <article className="panel prose fade-in">
      <h1>Results</h1>
      <p>
        This page is a placeholder for Surabhi&apos;s held-out test metrics after she runs
        the Colab notebook. Do not invent numbers here.
      </p>

      <div className="placeholder-box">
        <p>
          <strong>To fill in after evaluation on the official PCam test split:</strong>
        </p>
        <ul>
          <li>Accuracy (and why accuracy alone is not enough)</li>
          <li>ROC-AUC with bootstrap 95% confidence interval</li>
          <li>Reliability / calibration plot (and a short note on what it shows)</li>
          <li>Confusion matrix</li>
          <li>Gallery of the most confident mistakes (false positives and false negatives)</li>
          <li>Optional: stain-color robustness stub results</li>
          <li>Honest comparison notes vs published PCam baselines (cite sources)</li>
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>
          Tip: export figures from the notebook into <code>web/public/results/</code> and
          link them from this page.
        </p>
      </div>
    </article>
  )
}
