/** Shared chip / scale options for assessment baseline + per-session progress. */

export const AFFECTED_AREAS = [
  'Lower back',
  'Neck',
  'Shoulder',
  'Knee',
  'Hip',
  'Ankle',
  'Wrist / hand',
  'Other',
]

export const FINDINGS = [
  'Restricted ROM',
  'Weakness',
  'Muscle spasm',
  'Swelling',
  'Poor posture',
  'Gait issue',
  'Balance risk',
  'Other',
]

export const PRECAUTIONS = [
  'Fall risk',
  'Post-op',
  'Neuro signs',
  'Anticoagulation / bleeding risk',
  'Pregnancy',
  'None',
  'Other',
]

export const PLAN_LENGTHS = [7, 15, 30]

export const PATIENT_GOALS = [
  'Reduce pain',
  'Walk better',
  'Return to work',
  'Sleep better',
  'Other',
]

export const SLEEP_OPTIONS = [
  { value: 'good', label: 'Good' },
  { value: 'ok', label: 'OK' },
  { value: 'poor', label: 'Poor' },
]

export const MOBILITY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'limited', label: 'Limited' },
  { value: 'difficult', label: 'Difficult' },
  { value: 'unable', label: 'Unable' },
]

export const VS_LAST_VISIT_OPTIONS = [
  { value: 'better', label: 'Better' },
  { value: 'same', label: 'Same' },
  { value: 'worse', label: 'Worse' },
]

export const HOME_EXERCISES_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'partial', label: 'Partial' },
  { value: 'no', label: 'No' },
]

export const PAIN_MEDS_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'as_needed', label: 'As needed' },
  { value: 'regular', label: 'Regular' },
]

export const EMPTY_ASSESSMENT_DATA = {
  painNow: null,
  functionNow: null,
  painOnMovement: null,
  areas: [],
  areasOther: '',
  findings: [],
  findingsOther: '',
  precautions: [],
  precautionsOther: '',
  sleep: null,
  mobility: null,
  planLength: null,
  patientGoal: null,
  patientGoalOther: '',
  extraNotes: '',
}

export const EMPTY_SESSION_PROGRESS = {
  painNow: null,
  functionNow: null,
  painOnMovement: null,
  sleep: null,
  mobility: null,
  vsLastVisit: null,
  homeExercises: null,
  painMeds: null,
  text: '',
}

function scoreLabel(n) {
  if (n == null || Number.isNaN(Number(n))) return null
  return String(Number(n))
}

function optionLabel(options, value) {
  if (!value) return null
  return options.find((o) => o.value === value)?.label || value
}

/** Human-readable assessment summary for timeline / View notes. */
export function formatAssessmentNotesText(data) {
  if (!data || typeof data !== 'object') return ''
  const lines = []
  if (data.painNow != null) lines.push(`Pain now: ${scoreLabel(data.painNow)}/10`)
  if (data.painOnMovement != null) lines.push(`Pain on movement: ${scoreLabel(data.painOnMovement)}/10`)
  if (data.functionNow != null) lines.push(`Function / daily activity: ${scoreLabel(data.functionNow)}/10`)
  if (Array.isArray(data.areas) && data.areas.length) {
    const areasLabel = data.areas
      .map((a) =>
        a === 'Other' && data.areasOther?.trim() ? `Other (${data.areasOther.trim()})` : a,
      )
      .join(', ')
    lines.push(`Affected areas: ${areasLabel}`)
  }
  if (Array.isArray(data.findings) && data.findings.length) {
    const findingsLabel = data.findings
      .map((a) =>
        a === 'Other' && data.findingsOther?.trim() ? `Other (${data.findingsOther.trim()})` : a,
      )
      .join(', ')
    lines.push(`Findings: ${findingsLabel}`)
  }
  if (Array.isArray(data.precautions) && data.precautions.length) {
    const precautionsLabel = data.precautions
      .map((a) =>
        a === 'Other' && data.precautionsOther?.trim()
          ? `Other (${data.precautionsOther.trim()})`
          : a,
      )
      .join(', ')
    lines.push(`Precautions: ${precautionsLabel}`)
  }
  if (data.sleep) lines.push(`Sleep: ${optionLabel(SLEEP_OPTIONS, data.sleep)}`)
  if (data.mobility) lines.push(`Walking / mobility: ${optionLabel(MOBILITY_OPTIONS, data.mobility)}`)
  if (data.patientGoal) {
    const goal =
      data.patientGoal === 'Other' && data.patientGoalOther?.trim()
        ? data.patientGoalOther.trim()
        : data.patientGoal
    lines.push(`Patient goal: ${goal}`)
  }
  if (data.extraNotes?.trim()) lines.push(`Notes: ${data.extraNotes.trim()}`)
  return lines.join('\n')
}

/** Human-readable session progress summary. */
export function formatSessionProgressText(data) {
  if (!data || typeof data !== 'object') return ''
  const lines = []
  if (data.painNow != null) lines.push(`Pain now: ${scoreLabel(data.painNow)}/10`)
  if (data.painOnMovement != null) lines.push(`Pain on movement: ${scoreLabel(data.painOnMovement)}/10`)
  if (data.functionNow != null) lines.push(`Function / daily activity: ${scoreLabel(data.functionNow)}/10`)
  if (data.sleep) lines.push(`Sleep: ${optionLabel(SLEEP_OPTIONS, data.sleep)}`)
  if (data.mobility) lines.push(`Walking / mobility: ${optionLabel(MOBILITY_OPTIONS, data.mobility)}`)
  if (data.vsLastVisit) lines.push(`Vs last visit: ${optionLabel(VS_LAST_VISIT_OPTIONS, data.vsLastVisit)}`)
  if (data.homeExercises) {
    lines.push(`Home exercises: ${optionLabel(HOME_EXERCISES_OPTIONS, data.homeExercises)}`)
  }
  if (data.painMeds) lines.push(`Pain meds: ${optionLabel(PAIN_MEDS_OPTIONS, data.painMeds)}`)
  if (data.text?.trim()) lines.push(`Notes: ${data.text.trim()}`)
  return lines.join('\n')
}

export function validateAssessmentData(data) {
  const hasPain = data?.painNow != null && data?.painNow !== ''
  const hasFn = data?.functionNow != null && data?.functionNow !== ''
  const pain = Number(data?.painNow)
  const fn = Number(data?.functionNow)
  const areas = Array.isArray(data?.areas) ? data.areas : []
  if (!hasPain || !Number.isFinite(pain) || pain < 0 || pain > 10) {
    return 'Select pain now (0–10)'
  }
  if (!hasFn || !Number.isFinite(fn) || fn < 0 || fn > 10) {
    return 'Select function / daily activity (0–10)'
  }
  if (areas.length < 1) {
    return 'Select at least one affected area'
  }
  if (areas.includes('Other') && !String(data?.areasOther || '').trim()) {
    return 'Describe the other affected area'
  }
  const findings = Array.isArray(data?.findings) ? data.findings : []
  if (findings.includes('Other') && !String(data?.findingsOther || '').trim()) {
    return 'Describe the other key finding'
  }
  const precautions = Array.isArray(data?.precautions) ? data.precautions : []
  if (precautions.includes('Other') && !String(data?.precautionsOther || '').trim()) {
    return 'Describe the other precaution'
  }
  return null
}

export function validateSessionProgress(data) {
  const hasPain = data?.painNow != null && data?.painNow !== ''
  const hasFn = data?.functionNow != null && data?.functionNow !== ''
  const pain = Number(data?.painNow)
  const fn = Number(data?.functionNow)
  if (!hasPain || !Number.isFinite(pain) || pain < 0 || pain > 10) {
    return 'Select pain now (0–10)'
  }
  if (!hasFn || !Number.isFinite(fn) || fn < 0 || fn > 10) {
    return 'Select function / daily activity (0–10)'
  }
  return null
}

/** Compact progress line: Pain 7→5→4 · Function 3→5 */
export function formatProgressHistoryLine(booking) {
  const baseline = booking?.assessmentData
  const rows = []
  if (baseline && (baseline.painNow != null || baseline.functionNow != null)) {
    rows.push({
      label: 'Baseline',
      painNow: baseline.painNow,
      functionNow: baseline.functionNow,
      sleep: baseline.sleep,
      mobility: baseline.mobility,
    })
  }
  const schedule = Array.isArray(booking?.schedule) ? booking.schedule : []
  if (schedule.length) {
    schedule.forEach((s, i) => {
      const n = s?.notes
      if (!n || (n.painNow == null && n.functionNow == null)) return
      rows.push({
        label: `#${i + 1}`,
        painNow: n.painNow,
        functionNow: n.functionNow,
        sleep: n.sleep,
        mobility: n.mobility,
      })
    })
  } else if (booking?.primarySessionNotes?.painNow != null || booking?.primarySessionNotes?.functionNow != null) {
    const n = booking.primarySessionNotes
    rows.push({
      label: 'Visit',
      painNow: n.painNow,
      functionNow: n.functionNow,
      sleep: n.sleep,
      mobility: n.mobility,
    })
  }
  if (rows.length < 1) return ''

  const pains = rows.filter((r) => r.painNow != null).map((r) => r.painNow)
  const funcs = rows.filter((r) => r.functionNow != null).map((r) => r.functionNow)
  const parts = []
  if (pains.length) parts.push(`Pain ${pains.join('→')}`)
  if (funcs.length) parts.push(`Function ${funcs.join('→')}`)
  const sleeps = rows.filter((r) => r.sleep).map((r) => optionLabel(SLEEP_OPTIONS, r.sleep))
  if (sleeps.length > 1) parts.push(`Sleep ${sleeps.join('→')}`)
  const mobs = rows.filter((r) => r.mobility).map((r) => optionLabel(MOBILITY_OPTIONS, r.mobility))
  if (mobs.length > 1) parts.push(`Mobility ${mobs.join('→')}`)
  return parts.join(' · ')
}
