/** Ported from client/src/utils/physioBookingWorkflow.js — keep in sync with web. */
import { normalizeSessionRows } from './physioBookingHelpers'
import { paymentAmountLabel, sessionStatusLabel } from './bookingDisplay'
import { isPlanLive } from './planStatus'

function badgeToneFromPhysioState(b, ctx) {
  if (b.sessionStatus === 'completed') return 'progress'
  if (ctx.showCreatePlan) return 'action'
  if (ctx.showPlanPending) return 'waiting'
  if (ctx.outstanding > 0.009 && ctx.planLive) return 'urgent'
  if (ctx.planLive) return 'progress'
  return 'muted'
}

export function physioWorkflowMeta(b, ctx) {
  const label = ctx.showCreatePlan
    ? 'Create plan'
    : ctx.showPlanPending
    ? 'Awaiting patient'
    : sessionStatusLabel(b)
  return {
    label,
    tone: badgeToneFromPhysioState(b, ctx),
  }
}

/** @typedef {'done' | 'current' | 'waiting' | 'upcoming'} StepState */

export function buildPhysioWorkflowSteps(ctx) {
  const {
    b,
    isOnline,
    planLive,
    showCreatePlan,
    showPlanPending,
    hasSchedulePlan,
    outstanding,
    paymentSummary,
    sessionsComplete,
    completedCount,
    totalSessions,
  } = ctx

  const totalPaid = Number(paymentSummary?.totalPaid || 0)
  const isOffline = b.serviceType === 'home' && b.homePlanPaymentMode === 'offline'

  if (isOnline) {
    return [
      {
        id: 'patient',
        num: 1,
        label: 'Patient',
        hint: b.userId?.name || 'Details',
        state: 'done',
      },
      {
        id: 'sessions',
        num: 2,
        label: 'Session',
        hint: sessionsComplete ? 'Completed' : 'Mark when done',
        state: sessionsComplete ? 'done' : 'current',
      },
      {
        id: 'payment',
        num: 3,
        label: 'Payment',
        hint:
          outstanding > 0.009
            ? `₹${Math.round(outstanding)} due`
            : totalPaid > 0
            ? 'Paid'
            : 'Payment status',
        state:
          outstanding > 0.009
            ? 'current'
            : totalPaid > 0
            ? 'done'
            : 'current',
      },
    ]
  }

  return [
    {
      id: 'patient',
      num: 1,
      label: 'Patient',
      hint: b.userId?.name || 'Home visit',
      state: 'done',
    },
    {
      id: 'plan',
      num: 2,
      label: 'Care plan',
      hint: showCreatePlan
        ? 'Create & send plan'
        : showPlanPending
        ? 'Awaiting patient'
        : planLive
        ? `${b.sessions || '—'} sessions · ${paymentAmountLabel(b)}`
        : 'Not ready',
      state: showCreatePlan
        ? 'current'
        : showPlanPending
        ? 'waiting'
        : planLive
        ? 'done'
        : 'upcoming',
    },
    {
      id: 'sessions',
      num: 3,
      label: 'Sessions',
      hint: hasSchedulePlan
        ? `${completedCount}/${totalSessions} completed`
        : sessionsComplete
        ? 'Done'
        : 'Mark visits',
      state:
        !planLive && !hasSchedulePlan && !showCreatePlan
          ? 'upcoming'
          : sessionsComplete
          ? 'done'
          : planLive || hasSchedulePlan || showCreatePlan
          ? 'current'
          : 'upcoming',
    },
    {
      id: 'payment',
      num: 4,
      label: 'Payment',
      hint:
        outstanding > 0.009
          ? `₹${Math.round(outstanding)} due`
          : totalPaid > 0
          ? 'Fully paid'
          : isOffline
          ? 'Collect at visit'
          : 'Installments',
      state: !planLive
        ? 'upcoming'
        : outstanding > 0.009
        ? 'current'
        : totalPaid > 0
        ? 'done'
        : 'current',
    },
  ]
}

export function defaultPhysioOpenStep(steps) {
  return (
    steps.find((s) => s.state === 'waiting' || s.state === 'current')?.id ||
    steps.find((s) => s.state === 'done')?.id ||
    steps[0]?.id ||
    'patient'
  )
}

export function physioPageContext(booking, options = {}) {
  if (!booking) return null
  const b = booking
  const isOnline = b.serviceType === 'online'
  const planLive = isPlanLive(b.planStatus) || isOnline
  const hasSchedulePlan = Array.isArray(b.schedule) && b.schedule.length > 0
  const showCreatePlan =
    !b.managerId &&
    b.serviceType === 'home' &&
    (b.planStatus === 'requested' || b.planStatus === 'rejected' || b.planStatus == null)
  const showPlanPending = b.serviceType === 'home' && b.planStatus === 'proposed'
  const paymentSummary = b.paymentSummary || null
  const payments = Array.isArray(b.payments) ? b.payments : []
  const outstanding = Number(paymentSummary?.outstanding || 0)
  const sessionsComplete = b.sessionStatus === 'completed'
  const rows = normalizeSessionRows(b)
  const completedCount = rows.filter((r) => r.status === 'completed').length
  const totalSessions = rows.length

  const ctx = {
    b,
    isOnline,
    planLive,
    hasSchedulePlan,
    showCreatePlan,
    showPlanPending,
    paymentSummary,
    payments,
    outstanding,
    sessionsComplete,
    rows,
    completedCount,
    totalSessions,
    ...options,
  }

  return {
    ...ctx,
    workflowMeta: physioWorkflowMeta(b, ctx),
  }
}
