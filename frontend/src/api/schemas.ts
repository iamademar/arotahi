import { z } from 'zod'

/**
 * Zod mirrors of prediction-api/app/schemas.py. Parsing happens at the network
 * boundary so a backend change fails visibly here rather than silently
 * producing wrong numbers in a tile.
 */

export const provenanceSchema = z.object({
  model_version: z.string(),
  grid_version: z.string(),
  feature_schema_version: z.string(),
  source_snapshot_id: z.string(),
})
export type Provenance = z.infer<typeof provenanceSchema>

export const areaScoreSchema = z.object({
  cell_id: z.string(),
  target_year: z.number().int(),
  probability: z.number(),
  national_rank: z.number().int(),
  national_percentile: z.number(),
  regional_rank: z.number().int(),
  regional_percentile: z.number(),
  region: z.string(),
  tla: z.string(),
  history_sufficiency: z.string(),
  prior_crash_count: z.number().int(),
  prior_severe_count: z.number().int(),
  actual_outcome: z.number().int().nullable(),
  // Required: an export without provenance is not traceable, so a response
  // missing it must fail rather than degrade.
  provenance: provenanceSchema,
})
export type AreaScore = z.infer<typeof areaScoreSchema>

export const areaListMetaSchema = z.object({
  target_year: z.number().int(),
  total_matching: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  eligible_cells_in_year: z.number().int(),
  eligible_coverage: z.number(),
})
export type AreaListMeta = z.infer<typeof areaListMetaSchema>

export const areaListSchema = z.object({
  meta: areaListMetaSchema,
  areas: z.array(areaScoreSchema),
})
export type AreaList = z.infer<typeof areaListSchema>

/**
 * `eligible_cells` is typed `dict[int, int]` in Python but JSON object keys are
 * always strings, so it arrives as {"2024": 21396}. Verified against a live
 * /health response — parsing it as a numeric-keyed record would fail.
 */
export const healthSchema = z.object({
  status: z.string(),
  model_version: z.string(),
  trained_on_years: z.array(z.number().int()),
  calibrated_on_years: z.array(z.number().int()),
  years_available: z.array(z.number().int()),
  eligible_cells: z.record(z.string(), z.number()),
})
export type Health = z.infer<typeof healthSchema>

export const yearHistorySchema = z.object({
  year: z.number().int(),
  crash_count: z.number().int(),
  severe_count: z.number().int(),
  eligible: z.boolean(),
  scored_probability: z.number().nullable().optional(),
  actual_outcome: z.number().int().nullable().optional(),
})
export type YearHistory = z.infer<typeof yearHistorySchema>

export const areaHistorySchema = z.object({
  cell_id: z.string(),
  region: z.string(),
  tla: z.string(),
  years: z.array(yearHistorySchema),
})
export type AreaHistory = z.infer<typeof areaHistorySchema>

export const featureSchema = z.object({
  name: z.string(),
  group: z.string(),
  lookback_window: z.string(),
  dtype: z.string(),
  missing_rule: z.string(),
})
export type Feature = z.infer<typeof featureSchema>

export const featuresResponseSchema = z.object({
  model_version: z.string(),
  predictor_count: z.number().int(),
  // Group keys contain spaces and a slash ("road context / geography").
  groups: z.record(z.string(), z.number()),
  features: z.array(featureSchema),
})
export type FeaturesResponse = z.infer<typeof featuresResponseSchema>

/** The 404 body for a cell outside the eligible population. */
export const notScoredSchema = z.object({
  cell_id: z.string(),
  target_year: z.number().int(),
  status: z.literal('not scored'),
  reason: z.string(),
})
export type NotScored = z.infer<typeof notScoredSchema>

/**
 * FastAPI's `detail` is not a single shape. Only the not-scored 404 carries an
 * object; unknown year, unknown model version and missing-history 404s carry a
 * plain string, and 422s carry an array of validation issues. Treating them all
 * as objects would crash the not-assessed path on an unrelated error.
 */
export const errorBodySchema = z.object({
  detail: z.union([
    notScoredSchema,
    z.string(),
    z.array(z.object({ msg: z.string() }).passthrough()),
    z.record(z.string(), z.unknown()),
  ]),
})
