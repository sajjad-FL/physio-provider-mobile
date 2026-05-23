/** Fallback per-session rate when admin has not set one on the physio profile yet. */
export const DEFAULT_ESTIMATOR_SESSION_FEE = 500

/** Maximum monthly sessions shown in the earnings estimator. */
export const ESTIMATOR_MAX_MONTHLY_SESSIONS = 200

/** Monthly session presets for the earnings estimator UI. */
export const ESTIMATOR_MONTHLY_SESSION_OPTIONS = [50, 100, 150, 200]

/**
 * @param {unknown} adminFee Per-session fee set by admin on the physio profile.
 * @returns {number}
 */
export function resolveEstimatorSessionFee(adminFee) {
  const fee = Number(adminFee)
  return Number.isFinite(fee) && fee > 0 ? fee : DEFAULT_ESTIMATOR_SESSION_FEE
}
