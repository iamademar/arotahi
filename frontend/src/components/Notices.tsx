import { PERSISTENT_NOTICE } from '../lib/copy'

/**
 * Spec section 7 notice. NOT CURRENTLY RENDERED: removed from the Overview at
 * the product owner's request. Spec section 6.2 asks the Overview screen to
 * carry a persistent non-causal interpretation notice, so mounting this
 * component somewhere is what would close that gap.
 */
export function PersistentNotice() {
  return (
    <aside className="warning">
      <div className="warning-icon" aria-hidden="true">⚠</div>
      <div>
        <strong>Scores cover previously observed crash areas only.</strong>
        <span>
          An unscored square is <b>not assessed</b> — it is not evidence of low risk. The model
          does not account for traffic volume or recommend treatments.
        </span>
        <details>
          <summary>What this score does and does not mean</summary>
          <p>{PERSISTENT_NOTICE}</p>
        </details>
      </div>
    </aside>
  )
}

/**
 * The static model metrics describe one specific artefact. If the service is
 * serving a different one, say so loudly rather than showing figures that no
 * longer describe the model behind the queue.
 */
export function VersionMismatchBanner({
  expected,
  actual,
}: {
  expected: string
  actual: string
}) {
  return (
    <div className="version-banner" role="alert">
      <strong>Model version mismatch</strong>
      The published performance figures were transcribed for <code>{expected}</code>, but the
      prediction service is serving <code>{actual}</code>. Treat the Model performance view as out
      of date until the static metrics are regenerated.
    </div>
  )
}
