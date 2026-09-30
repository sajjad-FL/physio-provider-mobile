/** Ported from client/src/utils/physioWorkflow.js — keep in sync with web. */
import { normalizeSessionRows, todayYmd } from './physioBookingHelpers'
import { isAwaitingPatientConsent, isPlanLive } from './planStatus'

export const PHYSIO_WAITING_PLAN_STATUSES = new Set(['awaiting_consent', 'proposed'])

function scheduledTreatmentRows(b) {
  return normalizeSessionRows(b).filter((r) => !r.complimentary)
}

function legacyNeedsHomePlan(b) {
  if (!b || b.managerId) return false
  if (b.serviceType !== 'home') return false
  if (!['accepted', 'scheduled'].includes(b.status)) return false
  const ps = b.planStatus
  if (isAwaitingPatientConsent(ps) || isPlanLive(ps)) return false
  return !ps || ps === 'requested' || ps === 'rejected' || ps === 'draft'
}

function dueSessionRows(b) {
  const today = todayYmd()
  return scheduledTreatmentRows(b).filter(
    (r) => r.status === 'scheduled' && String(r.date || '') <= today,
  )
}

function nextScheduledRow(b) {
  const today = todayYmd()
  return scheduledTreatmentRows(b).find(
    (r) => r.status === 'scheduled' && String(r.date || '') >= today,
  )
}

function bookingFullyCompleted(b) {
  if (b.sessionStatus === 'completed') {
    if (Array.isArray(b.schedule) && b.schedule.length > 0) {
      return scheduledTreatmentRows(b).every((r) => r.status === 'completed')
    }
    return true
  }
  if (Array.isArray(b.schedule) && b.schedule.length > 0) {
    return scheduledTreatmentRows(b).every((r) => r.status === 'completed')
  }
  return false
}

/**
 * Workflow badge for physio booking list.
 */
export function physioWorkflowMeta(b) {
  if (!b) {
    return { label: 'Review', hint: '', tone: 'muted' }
  }

  if (!b.managerId && b.status === 'assigned') {
    return {
      label: 'Accept case',
      hint: 'Accept or decline this assignment',
      tone: 'urgent',
    }
  }

  if (legacyNeedsHomePlan(b)) {
    return {
      label: 'Create plan',
      hint: 'Draft home treatment plan for patient',
      tone: 'urgent',
    }
  }

  if (isAwaitingPatientConsent(b.planStatus)) {
    return {
      label: 'Awaiting consent',
      hint: 'Patient must approve the plan in the app',
      tone: 'waiting',
    }
  }

  const due = dueSessionRows(b)
  const today = todayYmd()
  const overdue = due.some((r) => String(r.date || '') < today)
  if (overdue) {
    return {
      label: 'Session overdue',
      hint: 'Complete or reschedule the visit',
      tone: 'urgent',
    }
  }
  if (due.some((r) => String(r.date || '') === today)) {
    return {
      label: "Today's session",
      hint: 'Mark complete after the visit',
      tone: 'action',
    }
  }

  if (physioInTreatment(b)) {
    const next = nextScheduledRow(b)
    return {
      label: 'In treatment',
      hint: next?.date ? `Next visit ${next.date}` : 'Sessions in progress',
      tone: 'progress',
    }
  }

  if (bookingFullyCompleted(b)) {
    return { label: 'Completed', hint: '', tone: 'muted' }
  }

  return {
    label: 'Scheduled',
    hint: 'Open booking for details',
    tone: 'muted',
  }
}

export function physioNeedsAction(b) {
  if (!b) return false
  if (!b.managerId && b.status === 'assigned') return true
  if (legacyNeedsHomePlan(b)) return true
  if (dueSessionRows(b).length > 0) return true
  return false
}

export function physioInTreatment(b) {
  if (!b || bookingFullyCompleted(b)) return false
  if (isAwaitingPatientConsent(b.planStatus)) return false
  if (!b.managerId && b.status === 'assigned') return false
  if (legacyNeedsHomePlan(b)) return false

  if (isPlanLive(b.planStatus)) {
    return scheduledTreatmentRows(b).some((r) => r.status !== 'completed')
  }

  if (b.managerId && ['payment_recorded', 'in_treatment'].includes(b.workflowStatus)) {
    return true
  }

  if (!b.managerId && ['accepted', 'scheduled'].includes(b.status) && b.sessionStatus !== 'completed') {
    return true
  }

  return false
}

export function physioMatchesFilter(b, filterId) {
  if (filterId === 'all') return true
  if (filterId === 'action') return physioNeedsAction(b)
  if (filterId === 'waiting') return isAwaitingPatientConsent(b.planStatus)
  if (filterId === 'active') return physioInTreatment(b)
  return true
}

/** Lower tier = higher in the list. */
export function physioCaseSortTier(b) {
  if (!b) return 999

  const today = todayYmd()
  const rows = scheduledTreatmentRows(b)
  const overdue = rows.some(
    (r) => r.status === 'scheduled' && String(r.date || '') < today,
  )
  const dueToday = rows.some(
    (r) => r.status === 'scheduled' && String(r.date || '') === today,
  )

  if (overdue) return 1
  if (dueToday) return 2
  if (!b.managerId && b.status === 'assigned') return 3
  if (legacyNeedsHomePlan(b)) return 4
  if (isAwaitingPatientConsent(b.planStatus)) return 50
  if (physioInTreatment(b)) return 80
  if (bookingFullyCompleted(b)) return 100
  return 90
}

/** @param {object} a @param {object} b */
export function comparePhysioCases(a, b) {
  const tierA = physioCaseSortTier(a)
  const tierB = physioCaseSortTier(b)
  if (tierA !== tierB) return tierA - tierB

  const dateA = String(a?.date || '')
  const dateB = String(b?.date || '')
  if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB)

  const updatedA = String(a?.updatedAt || '')
  const updatedB = String(b?.updatedAt || '')
  return updatedB.localeCompare(updatedA)
}
