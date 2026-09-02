/**
 * Wording taken verbatim from spec_v2.md and from the prediction service.
 * Do not paraphrase: the terminology rules in spec section 7 are part of the
 * product's safety case, not house style.
 */

/** Spec section 7. Shown on every view. */
export const PERSISTENT_NOTICE =
  'This score applies only to grid cells with recent reported crash history. ' +
  'It estimates whether the cell will record at least one serious or fatal ' +
  'Police-reported crash in the stated calendar year, based only on earlier ' +
  'CAS records. It is not adjusted for traffic exposure, does not score every ' +
  'road, and does not establish causes or replace engineering assessment.'

/** Spec section 6.7. Required in every export. */
export const EXPORT_LIMITATION =
  'The result is not exposure-adjusted road risk or an engineering recommendation.'

/** Spec section 4. */
export const ELIGIBLE_POPULATION_DEFINITION =
  'Cells with at least one reported crash in the previous five calendar years'

export const NOT_ASSESSED_LEGEND =
  'Areas with no cell shown are not assessed — this is not evidence of low risk.'

export const MAP_CONTEXT_NOTE =
  'Roads shown for orientation only; they are not model inputs.'

/** No per-cell attribution is served, and none is invented. */
export const NO_EXPLANATIONS_NOTE =
  'Per-cell model explanations are not yet available from the prediction service.'

export const REVEAL_HIDDEN_TITLE = 'Evaluate the historical ranking'
export const REVEAL_HIDDEN_TEXT = 'Keep outcomes hidden while reviewing the model’s queue.'
export const REVEAL_SHOWN_TITLE = (year: number) => `${year} outcomes revealed`
export const REVEAL_SHOWN_TEXT = 'Actual severe-crash cells are now marked separately.'

export const MASKED_VALUE = 'Hidden until outcomes are revealed'

/**
 * Plain-language reading of recall-at-capacity. The ceiling, not the headline
 * percentage, is what makes the number interpretable: an analyst who can review
 * K areas can never catch more than K, however good the ranking. Every figure is
 * derived, so the wording stays true as capacity and region change.
 */
export const RECALL_EXPLANATION = (args: {
  targetYear: number
  region: string
  positives: number
  capacity: number
  captured: number
  shareOfCatchable: string
}) =>
  `In ${args.targetYear}, ${args.positives.toLocaleString('en-NZ')} areas in ${args.region} had ` +
  `a serious or fatal crash. You can review ${args.capacity}. Your top-${args.capacity} list ` +
  `caught ${args.captured} of them.\n\n` +
  `The best possible list would have caught ${args.capacity} — you can't catch more than you ` +
  `can review. So ${args.captured} out of a possible ${args.capacity} means the model got you ` +
  `${args.shareOfCatchable} of what was catchable.`

/**
 * Plain-language reading of lift. Unlike recall, lift has no capacity ceiling,
 * so it is the fairer read on whether the ranking itself is any good.
 */
export const LIFT_EXPLANATION = (args: {
  capacity: number
  randomHits: number
  captured: number
  lift: string
}) =>
  `If you picked ${args.capacity} areas at random, about ${args.randomHits} of them would turn ` +
  `out to have ${args.randomHits === 1 ? 'a serious crash' : 'serious crashes'}. ` +
  `Using the model's top ${args.capacity}, you got ${args.captured}. ` +
  `That's ${args.lift} better than guessing.`

export const LOOKBACK_LABEL = (targetYear: number) =>
  `${targetYear - 5}–${targetYear - 1}`

export const LAG_CONFIGURATION = 'lag-0'

/** Region names are displayed without the trailing " Region"; the API needs it. */
export function displayRegion(region: string): string {
  return region.replace(/ Region$/, '')
}

export const ALL_NEW_ZEALAND = 'All New Zealand'

/**
 * Product identity. Arotahi is te reo Māori for "to focus", "look steadily",
 * or "lens" — fitting for an app that directs an analyst's attention to a
 * manageable shortlist of areas.
 */
export const APP_NAME = 'Arotahi'
export const APP_DESCRIPTOR = 'NZ Crash Area Prioritiser'
export const APP_TAGLINE = 'Ranking recurring crash areas for analyst review.'
export const APP_NAME_MEANING =
  'The name Arotahi comes from a Māori word that means to focus, look steadily, or lens. The ' +
  'idea is pretty simple: the app helps you zero in on a manageable shortlist of areas to ' +
  'review. If you’re an analyst trying to make sense of a mountain of data, hopefully this ' +
  'helps you spend your time where it counts.'
export const APP_NAME_SOURCE = 'Te Aka Māori Dictionary'

/**
 * Footer author block, in the author's own voice, under a name-and-role line.
 *
 * The artefacts behind the "did everything myself" claim are real and checkable:
 * ml/outputs/model_card.md, ml/tests/test_leakage.py, and the 2024/2025 years
 * held back by experiments/objective.assert_no_locked_years.
 */
export const AUTHOR_NAME_AND_ROLE = 'Ademar Tutor · AI/ML Engineer'
export const AUTHOR_INTRO = 'Hello there, I am Ademar Tutor.'
export const AUTHOR_BIO =
  'I’ve been shipping production code for about 15 years. These days, I’m deep in the world ' +
  'of ML and LLMs, and I’m just about to finish up a Master’s in AI at the University of ' +
  'Waikato.'
export const AUTHOR_PROJECT_NOTE =
  'Arotahi is my personal project, built from scratch on nights and weekends. I did everything ' +
  'myself from data audits and model calibration to wiring up the API and UI. If something’s ' +
  'broken, you know who to blame. 😅'
