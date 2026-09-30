import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView as RNScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { ScrollView as GHScrollView } from 'react-native-gesture-handler'
import Toast from 'react-native-toast-message'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../api/client'
import HomePlanFormPhysio from '../components/physio/HomePlanFormPhysio'
import InstallmentsPhysioCard from '../components/physio/InstallmentsPhysioCard'
import SessionProgressPhysio from '../components/physio/SessionProgressPhysio'
import SessionProgressModal from '../components/physio/SessionProgressModal'
import { formatProgressHistoryLine } from '../constants/assessmentForm'
import { DAILY_SLOTS } from '../constants/slots'
import { colors } from '../theme/colors'
import { font, type, leading } from '../theme/typography'
import {
  marketplacePaymentStatusLabel,
  paymentAmountLabel,
  paymentModeLabel,
  paymentStatusLabel,
  billingTypeLabel,
  bookingCodeBadge,
} from '../utils/bookingDisplay'
import { isPlanLive } from '../utils/planStatus'
import { buildSessionPaymentMap, defaultCollectionSessionId } from '../utils/sessionPaymentMap'
import { buildPhysioWorkflowSteps, defaultPhysioOpenStep, physioPageContext } from '../utils/physioBookingWorkflow'
import { formatBookingDateAndSlot, formatBookingTimeSlot } from '../utils/date'
import { openGoogleMapsDestination } from '../utils/googleMaps'
import { normalizeSessionRows } from '../utils/physioBookingHelpers'
import DropdownField from '../components/ui/DropdownField'

const ScrollView = Platform.OS === 'web' ? RNScrollView : GHScrollView

const bookingCardSurface = Platform.select({
  web: {
    backgroundColor: '#ffffff',
    boxShadow: '0px 2px 10px rgba(15, 23, 42, 0.08)',
  },
  default: {
    backgroundColor: colors.white,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
})

const innerPanelSurface = Platform.select({
  web: { backgroundColor: '#ffffff' },
  default: { backgroundColor: colors.white },
})

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const RESCHEDULE_SLOT_OPTIONS = DAILY_SLOTS.map((s) => ({
  value: s,
  label: formatBookingTimeSlot(s),
}))

/** Workflow badge tones — same palette as web badgeToneClass. */
const TONE = {
  urgent: { bg: colors.amber50, fg: colors.amber950, border: colors.amber200 },
  action: { bg: colors.teal50, fg: colors.teal800, border: colors.brandSoft },
  waiting: { bg: colors.blue50, fg: colors.blue700, border: '#bfdbfe' },
  progress: { bg: colors.emerald50, fg: colors.emerald900, border: '#a7f3d0' },
  muted: { bg: colors.slate50, fg: colors.slate700, border: colors.slate200 },
}

/** Row status pills — web BookingSessionTimeline statusBadgeClass/statusLabel. */
const ROW_PILL = {
  completed: { label: 'Completed', bg: colors.emerald50, fg: colors.emerald900, border: '#a7f3d0' },
  no_show: { label: 'No-show', bg: colors.rose50, fg: colors.rose900, border: '#fecdd3' },
  rescheduled: { label: 'Rescheduled', bg: colors.amber50, fg: colors.amber950, border: colors.amber200 },
  scheduled: { label: 'Scheduled', bg: colors.slate50, fg: colors.slate700, border: colors.slate200 },
}

/** Mirrors web BookingWorkflowStepRail (numbered circles: done ✓ / waiting / current / upcoming). */
const StepRail = memo(function StepRail({ steps, openStep, onSelect }) {
  return (
    <View style={styles.railRow}>
      {steps.map((step) => {
        const isOpen = openStep === step.id
        const done = step.state === 'done'
        const waiting = step.state === 'waiting'
        const current = step.state === 'current'
        const circle = done
          ? styles.railCircleDone
          : waiting
          ? styles.railCircleWaiting
          : current || isOpen
          ? styles.railCircleCurrent
          : styles.railCircleUpcoming
        const circleTxt = done || current || isOpen ? colors.white : waiting ? colors.blue700 : colors.slate400
        return (
          <Pressable
            key={step.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isOpen }}
            onPress={() => onSelect(step.id)}
            style={[styles.railItem, isOpen && styles.railItemOpen]}
          >
            <View style={[styles.railCircle, circle]}>
              <Text style={[styles.railCircleTxt, { color: waiting && !isOpen ? colors.blue700 : circleTxt }]}>
                {done ? '✓' : step.num}
              </Text>
            </View>
            <Text style={[styles.railLabel, isOpen && { color: colors.teal800 }]} numberOfLines={1}>
              {step.label}
            </Text>
            <Text style={styles.railHint} numberOfLines={1}>{step.hint}</Text>
          </Pressable>
        )
      })}
    </View>
  )
})

const GridCell = memo(function GridCell({ k, v, strong }) {
  return (
    <View style={styles.wfGridCell}>
      <Text style={styles.wfGridK}>{k}</Text>
      <Text style={[styles.wfGridV, strong && { fontFamily: font.semiBold }]}>{v}</Text>
    </View>
  )
})

/** Mirrors web PlanSummaryGrid. */
const PlanSummaryGrid = memo(function PlanSummaryGrid({ b }) {
  return (
    <View style={styles.wfGrid}>
      <GridCell k="Sessions" v={String(b.sessions ?? '—')} strong />
      {b.amountPerSession != null ? <GridCell k="Per session" v={`₹${Number(b.amountPerSession).toFixed(0)}`} strong /> : null}
      {b.discountPercent != null && b.discountPercent > 0 ? <GridCell k="Discount" v={`${b.discountPercent}%`} strong /> : null}
      <GridCell k="Total" v={paymentAmountLabel(b)} strong />
      {billingTypeLabel(b) ? <GridCell k="Payment type" v={billingTypeLabel(b)} strong /> : null}
    </View>
  )
})

function roundMoney2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function ymdFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim())
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function formatDmyDots(d) {
  const dt = d instanceof Date ? d : parseYmd(d)
  const day = String(dt.getDate()).padStart(2, '0')
  const mo = String(dt.getMonth() + 1).padStart(2, '0')
  const y = dt.getFullYear()
  return `${day}-${mo}-${y}`
}

function startOfToday() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

function iosSupportsCompactDate() {
  if (Platform.OS !== 'ios') return false
  const v = Platform.Version
  if (typeof v === 'number') return v >= 14
  const n = parseFloat(String(v))
  return !Number.isNaN(n) && n >= 14
}

function openWhatsApp(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '')
  const number = cleaned.startsWith('91') && cleaned.length === 12 ? cleaned : '91' + cleaned.slice(-10)
  Linking.openURL(`https://wa.me/${number}`)
}

function callPhone(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '')
  const number = cleaned.startsWith('91') && cleaned.length === 12 ? cleaned : '91' + cleaned.slice(-10)
  Linking.openURL(`tel:+${number}`)
}

const BookingDetailChrome = memo(function BookingDetailChrome({ navigation, insetsTop, title, subtitle, children }) {
  return (
    <View style={styles.screenRoot}>
      <View pointerEvents="none" style={styles.ambientLayer}>
        <View style={styles.ambientHeaderGlow} />
        <View style={styles.ambientHeaderGlow2} />
      </View>
      <View style={styles.screenBody}>
        <View style={[styles.customHeader, { paddingTop: insetsTop + 6 }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
          </Pressable>
          <View style={styles.customHeaderCenter}>
            <Text style={styles.customHeaderTitle} numberOfLines={1}>{title || 'Booking Details'}</Text>
            {subtitle ? <Text style={styles.customHeaderSub} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View style={styles.customHeaderSpacer} />
        </View>
        {children}
      </View>
    </View>
  )
})

export default function PhysioBookingDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { id } = route.params || {}
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rescheduleRow, setRescheduleRow] = useState(null)
  const [busySessionKey, setBusySessionKey] = useState(null)
  const [noShowRow, setNoShowRow] = useState(null)
  const [noShowReason, setNoShowReason] = useState('')
  const [recordCollectionOpen, setRecordCollectionOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState(new Date())
  const [rescheduleSlot, setRescheduleSlot] = useState(DAILY_SLOTS[0])
  const [androidRescheduleDateOpen, setAndroidRescheduleDateOpen] = useState(false)
  const [iosRescheduleDateOpen, setIosRescheduleDateOpen] = useState(false)
  const [rescheduleBusy, setRescheduleBusy] = useState(false)
  const [recordAmount, setRecordAmount] = useState('')
  const [recordNote, setRecordNote] = useState('')
  const [recordSessionId, setRecordSessionId] = useState('__general__')
  const [recordErr, setRecordErr] = useState('')
  const [recordBusy, setRecordBusy] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(true)
  const [noShowFocused, setNoShowFocused] = useState(false)
  const [recordAmountFocused, setRecordAmountFocused] = useState(false)
  const [recordNoteFocused, setRecordNoteFocused] = useState(false)
  const [notesRow, setNotesRow] = useState(null)
  const [confirmCompleteRow, setConfirmCompleteRow] = useState(null)



  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/physio/bookings/${id}`)
      setBooking(res.data)
    } catch (e) {
      const msg = e.response?.status === 404 ? 'Booking not found' : e.response?.data?.message || 'Failed to load'
      setError(msg)
      setBooking(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  useEffect(() => { load() }, [load])

  const paymentSummary = booking?.paymentSummary || null
  const paymentsList = useMemo(() => (Array.isArray(booking?.payments) ? booking.payments : []), [booking])
  const outstanding = Number(paymentSummary?.outstanding || 0)

  // Same derivation as web PhysioBookingDetailPage → drives the "Your checklist" steps.
  const pageCtx = useMemo(() => {
    if (!booking) return null
    const sessionsCount =
      booking.paymentSummary?.sessionsCount ||
      (Array.isArray(booking.schedule) && booking.schedule.length > 0 ? booking.schedule.length : 1)
    const unlockedSessions = Number(
      booking.paymentSummary?.unlockedSessions ?? booking.paymentSummary?.coveredSessions ?? 0,
    )
    const isOfflinePlan = booking.serviceType === 'home' && booking.homePlanPaymentMode === 'offline'
    const isHomeCare = booking.serviceType === 'home'
    const paymentGateSkipped = Boolean(booking.managerId || isHomeCare)
    const showInstallments =
      isPlanLive(booking.planStatus) ||
      booking.serviceType === 'online' ||
      (Array.isArray(booking.payments) && booking.payments.length > 0)

    let paymentBlockReason = ''
    if (!paymentGateSkipped) {
      const ps = booking.paymentSummary
      if (!ps && booking.paymentStatus !== 'held') {
        paymentBlockReason = 'Payment must be secured before completion'
      } else if (ps && unlockedSessions <= 0) {
        paymentBlockReason = 'Collect at least one installment before completing any session.'
      }
    }

    return physioPageContext(booking, {
      sessionsCount,
      unlockedSessions,
      isOfflinePlan,
      paymentGateSkipped,
      paymentBlockReason,
      showInstallments,
      canMarkComplete: booking.sessionStatus !== 'completed' && !paymentBlockReason,
      sessionPaymentMap: buildSessionPaymentMap(
        booking,
        Array.isArray(booking.payments) ? booking.payments : [],
        booking.paymentSummary,
      ),
    })
  }, [booking])

  const steps = useMemo(() => (pageCtx ? buildPhysioWorkflowSteps(pageCtx) : []), [pageCtx])
  const [openStep, setOpenStep] = useState('patient')
  const [stepReady, setStepReady] = useState(false)

  useEffect(() => {
    setStepReady(false)
    setOpenStep('patient')
  }, [id])

  useEffect(() => {
    if (!steps.length || stepReady) return
    setOpenStep(defaultPhysioOpenStep(steps))
    setStepReady(true)
  }, [steps, stepReady])

  function openRecordCollection(row) {
    const out = roundMoney2(outstanding)
    const per = roundMoney2(Number(paymentSummary?.amountPerSession || 0))
    setRecordAmount(out <= 0 ? '' : per > 0 ? String(Math.min(per, out)) : String(out))
    const sid = row?.sessionId || (pageCtx ? defaultCollectionSessionId(booking, pageCtx.sessionPaymentMap, per) : null)
    setRecordSessionId(sid ? String(sid) : '__general__')
    setRecordNote('')
    setRecordErr('')
    setRecordCollectionOpen(true)
  }

  async function completeSession(bookingId) {
    setBusyId(bookingId)
    try {
      await api.post(`/physio/sessions/${bookingId}/complete`)
      Toast.show({ type: 'success', text1: 'Session marked complete' })
      await load()
    } catch (e) {
      const code = e.response?.data?.code
      const msg = e.response?.data?.message
      if (code === 'payment_milestone_not_met') {
        Toast.show({ type: 'error', text1: 'Payment required', text2: msg || 'Collect the required payment before marking complete.' })
      } else {
        Toast.show({ type: 'error', text1: msg || 'Failed to complete session' })
      }
    } finally {
      setBusyId(null)
    }
  }

  async function completeOneSession(row) {
    if (!booking || !row?.sessionId) return
    const key = String(row.sessionId)
    setBusySessionKey(key)
    try {
      await api.post(`/physio/sessions/${booking._id}/${row.sessionId}/complete`)
      Toast.show({ type: 'success', text1: `Session #${row.n} marked complete` })
      await load()
    } catch (e) {
      const code = e.response?.data?.code
      const msg = e.response?.data?.message
      if (code === 'payment_milestone_not_met') {
        Toast.show({ type: 'error', text1: 'Payment required', text2: msg || 'Collect the required payment before marking complete.' })
      } else {
        Toast.show({ type: 'error', text1: msg || 'Failed to complete session' })
      }
    } finally {
      setBusySessionKey(null)
    }
  }

  async function respondToAssignment(action) {
    if (!booking) return
    setBusyId(booking._id)
    try {
      await api.patch(`/physio/bookings/${booking._id}/assignment`, { action })
      Toast.show({ type: 'success', text1: action === 'accept' ? 'Assignment accepted' : 'Assignment declined' })
      await load()
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Failed' })
    } finally {
      setBusyId(null)
    }
  }

  async function submitNoShow() {
    if (!booking || !noShowRow?.sessionId) return
    const key = String(noShowRow.sessionId)
    setBusySessionKey(key)
    try {
      await api.post(`/physio/sessions/${booking._id}/${noShowRow.sessionId}/no-show`, {
        reason: noShowReason.trim(),
      })
      Toast.show({ type: 'success', text1: `Session #${noShowRow.n} marked as no-show` })
      setNoShowRow(null)
      setNoShowReason('')
      await load()
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Failed' })
    } finally {
      setBusySessionKey(null)
    }
  }

  async function createPlan(bookingId, payload) {
    setBusyId(bookingId)
    try {
      await api.patch(`/bookings/${bookingId}/create-plan`, payload)
      Toast.show({ type: 'success', text1: 'Plan submitted to patient' })
      await load()
      setOpenStep('sessions')
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Could not create plan' })
    } finally {
      setBusyId(null)
    }
  }

  async function submitRecordCollection() {
    if (!booking) return
    setRecordErr('')
    const amt = roundMoney2(Number(recordAmount))
    const out = roundMoney2(outstanding)
    if (!Number.isFinite(amt) || amt <= 0) {
      setRecordErr('Enter an amount greater than zero')
      return
    }
    if (amt > out + 0.009) {
      setRecordErr(`Amount must be at most ₹${out.toFixed(2)}`)
      return
    }
    setRecordBusy(true)
    try {
      await api.post(`/physio/bookings/${booking._id}/collections`, {
        amount: amt,
        note: recordNote.trim(),
        sessionId: recordSessionId === '__general__' ? null : recordSessionId,
      })
      Toast.show({ type: 'success', text1: 'Collection recorded' })
      setRecordCollectionOpen(false)
      setRecordAmount('')
      setRecordNote('')
      setRecordSessionId('__general__')
      await load()
    } catch (e) {
      const msg = e.response?.data?.message || 'Could not record'
      setRecordErr(msg)
      Toast.show({ type: 'error', text1: msg })
    } finally {
      setRecordBusy(false)
    }
  }

  function closeRescheduleModal() {
    setAndroidRescheduleDateOpen(false)
    setIosRescheduleDateOpen(false)
    setRescheduleRow(null)
  }

  function openReschedule(row) {
    setAndroidRescheduleDateOpen(false)
    setIosRescheduleDateOpen(false)
    setRescheduleRow(row)
    const min = startOfToday()
    const d = row?.date || booking?.date
    let parsed = parseYmd(d)
    if (parsed.getTime() < min.getTime()) parsed = new Date(min)
    setRescheduleDate(parsed)
    setRescheduleSlot(row?.time || booking?.timeSlot || DAILY_SLOTS[0])
  }

  async function saveReschedule() {
    if (!booking || !rescheduleRow) return
    setRescheduleBusy(true)
    try {
      const payload = { date: ymdFromDate(rescheduleDate), timeSlot: rescheduleSlot }
      if (rescheduleRow?.sessionId && String(rescheduleRow.sessionId) !== String(booking._id)) {
        payload.sessionId = rescheduleRow.sessionId
      }
      await api.patch(`/bookings/${booking._id}/reschedule`, payload)
      Toast.show({ type: 'success', text1: 'Session rescheduled' })
      closeRescheduleModal()
      await load()
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Could not reschedule' })
    } finally {
      setRescheduleBusy(false)
    }
  }

  const rescheduleMinDate = useMemo(() => startOfToday(), [])
  const noteRows = useMemo(() => (booking ? normalizeSessionRows(booking) : []), [booking])
  const collectionSessionOptions = useMemo(() => {
    const sessionOpts = noteRows
      .filter((r) => r.sessionId)
      .map((r) => ({
        value: String(r.sessionId),
        label: `Session ${r.n} — ${formatBookingDateAndSlot(r.date, r.time)}`,
      }))
    return [
      ...sessionOpts,
      { value: '__general__', label: 'General (not tied to a session)' },
    ]
  }, [noteRows])
  const multiNotes = noteRows.length > 1

  const toggleNotes = useCallback(() => {
    if (!multiNotes) return
    setNotesExpanded((o) => !o)
  }, [multiNotes])

  if (loading) {
    return (
      <BookingDetailChrome navigation={navigation} insetsTop={insets.top}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </BookingDetailChrome>
    )
  }

  if (error || !booking) {
    return (
      <BookingDetailChrome navigation={navigation} insetsTop={insets.top}>
        <View style={styles.center}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="warning-outline" size={28} color={colors.warning} />
          </View>
          <Text style={styles.err}>{error || 'Not found'}</Text>
          <Pressable style={styles.backBtnOutline} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnOutlineTxt}>Go back</Text>
          </Pressable>
        </View>
      </BookingDetailChrome>
    )
  }

  const {
    b,
    isOnline,
    planLive,
    hasSchedulePlan,
    showCreatePlan,
    showPlanPending,
    payments,
    sessionsCount,
    unlockedSessions,
    isOfflinePlan,
    paymentGateSkipped,
    paymentBlockReason,
    showInstallments,
    canMarkComplete,
    sessionPaymentMap,
    workflowMeta,
    rows,
  } = pageCtx
  const busy = busyId === b._id
  // App-only: auto-assigned bookings (status 'assigned') need accept/decline — the web has no UI for it.
  const isAssigned = b.status === 'assigned' && !b.managerId
  const canStartNavigation = Boolean(b.userId?.coordinates || String(b.userId?.location || '').trim())
  const hasPhone = Boolean(b.userId?.phone)
  const activeStepMeta = steps.find((s) => s.id === openStep)
  const tday = todayYmd()
  const scrollBottomPad = 14 + insets.bottom + 14
  const tone = TONE[workflowMeta.tone] || TONE.muted

  function rowBlockedReason(row) {
    if (paymentGateSkipped) return ''
    if (!paymentSummary) return ''
    const ordinal = row?.perSession ? Number(row.n || 0) : 1
    if (ordinal <= 0) return ''
    if (ordinal > unlockedSessions) {
      return unlockedSessions === 0
        ? `Session #${ordinal} is locked. Collect at least one installment to open it.`
        : `Session #${ordinal} is locked. Currently unlocked: up to #${unlockedSessions} of ${sessionsCount}.`
    }
    return ''
  }

  function onCompleteRow(row) {
    if (paymentBlockReason) {
      Toast.show({ type: 'error', text1: paymentBlockReason })
      return
    }
    confirmComplete(row)
  }

  // Same confirmation as web PhysioBookingDetailPage before marking a visit complete.
  function confirmComplete(row) {
    setConfirmCompleteRow(row)
  }

  function submitConfirmedComplete() {
    const row = confirmCompleteRow
    setConfirmCompleteRow(null)
    if (row?.perSession) completeOneSession(row)
    else completeSession(b._id)
  }

  function onNoShowRow(row) {
    if (paymentBlockReason) {
      Toast.show({ type: 'error', text1: paymentBlockReason })
      return
    }
    if (row.perSession) {
      setNoShowReason('')
      setNoShowRow(row)
    }
  }

  return (
    <BookingDetailChrome
      navigation={navigation}
      insetsTop={insets.top}
      title={b.userId?.name || 'Booking'}
      subtitle={formatBookingDateAndSlot(b.date, b.timeSlot)}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.pad, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        bounces={true}
        alwaysBounceVertical={true}
        showsVerticalScrollIndicator
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brand} />
        }
      >
        {/* ── Header (web: patient, code, condition, date · location, workflow badge) ── */}
        <View style={styles.wfCard}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.wfBackLink}>← All bookings</Text>
          </Pressable>
          <View style={styles.wfHeadRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.wfName}>{b.userId?.name || 'Patient'}</Text>
              {bookingCodeBadge(b) ? <Text style={styles.wfCode}>{bookingCodeBadge(b)}</Text> : null}
              <Text style={styles.wfIssue}>{b.issue || '—'}</Text>
              <Text style={styles.wfMeta}>
                {formatBookingDateAndSlot(b.date, b.timeSlot)}
                {b.userId?.location ? ` · ${b.userId.location}` : ''}
              </Text>
            </View>
            <View style={[styles.wfBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Text style={[styles.wfBadgeTxt, { color: tone.fg }]}>{workflowMeta.label}</Text>
            </View>
          </View>
        </View>

        {/* ── Accept assignment banner (app-only; backend requires a response) ── */}
        {isAssigned ? (
          <View style={styles.assignmentBanner}>
            <View style={styles.assignmentBannerTop}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.amber800} />
              <Text style={styles.assignmentBannerTitle}>Action required — accept this assignment</Text>
            </View>
            <Text style={styles.assignmentBannerBody}>
              You have been assigned to this booking. Accept to confirm the visit, or decline to release it back to admin.
            </Text>
            <View style={styles.assignmentBannerBtns}>
              <Pressable
                style={[styles.assignmentAcceptBtn, busyId && styles.premiumActionBtnDisabled]}
                disabled={!!busyId}
                onPress={() => respondToAssignment('accept')}
              >
                {busyId ? <ActivityIndicator size="small" color={colors.white} /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={15} color={colors.white} />
                    <Text style={styles.assignmentAcceptTxt}>Accept</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.assignmentRejectBtn, busyId && styles.premiumActionBtnDisabled]}
                disabled={!!busyId}
                onPress={() => respondToAssignment('reject')}
              >
                <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                <Text style={styles.assignmentRejectTxt}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ── Your checklist ── */}
        <View style={styles.wfCard}>
          <Text style={styles.wfKicker}>YOUR CHECKLIST</Text>
          <StepRail steps={steps} openStep={openStep} onSelect={setOpenStep} />
        </View>

        {/* ── Active step panel ── */}
        <View style={styles.wfCard}>
          <View style={styles.wfPanelHead}>
            <Text style={styles.wfStepKicker}>
              STEP {activeStepMeta?.num || 1} OF {steps.length}
            </Text>
            <Text style={styles.wfPanelTitle}>{activeStepMeta?.label}</Text>
            {activeStepMeta?.state === 'waiting' ? (
              <Text style={styles.wfWaitingTxt}>Waiting on the patient to approve the care plan.</Text>
            ) : null}
          </View>

          {openStep === 'patient' ? (
            <View style={styles.wfStack}>
              <View style={styles.wfBoxMuted}>
                <Text style={styles.wfBoxLabel}>CONTACT</Text>
                <Text style={styles.wfBoxTitle}>{b.userId?.name ?? '—'}</Text>
                <Text style={styles.wfBoxText}>{b.userId?.phone ?? '—'}</Text>
                {b.userId?.location ? <Text style={[styles.wfBoxText, { marginTop: 6 }]}>{b.userId.location}</Text> : null}
                <View style={styles.wfBtnRow}>
                  <Pressable
                    style={[styles.wfOutlineBtn, !hasPhone && styles.stepperBtnDisabled]}
                    disabled={!hasPhone}
                    onPress={() => callPhone(b.userId.phone)}
                  >
                    <Ionicons name="call-outline" size={13} color={colors.teal800} />
                    <Text style={styles.wfOutlineBtnTxt}>Call</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.wfOutlineBtn, !hasPhone && styles.stepperBtnDisabled]}
                    disabled={!hasPhone}
                    onPress={() => openWhatsApp(b.userId.phone)}
                  >
                    <Ionicons name="logo-whatsapp" size={13} color={colors.teal800} />
                    <Text style={styles.wfOutlineBtnTxt}>WhatsApp</Text>
                  </Pressable>
                  {b.serviceType === 'home' ? (
                    <Pressable
                      style={[styles.wfOutlineBtn, !canStartNavigation && styles.stepperBtnDisabled]}
                      disabled={!canStartNavigation}
                      onPress={() => openGoogleMapsDestination({ coordinates: b.userId?.coordinates, address: b.userId?.location })}
                    >
                      <Ionicons name="navigate-outline" size={13} color={colors.teal800} />
                      <Text style={styles.wfOutlineBtnTxt}>Start navigation</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={styles.wfBox}>
                <Text style={styles.wfBoxLabel}>CONDITION</Text>
                <Text style={[styles.wfBoxText, { color: colors.slate800 }]}>{b.issue || '—'}</Text>
              </View>
              <View style={styles.wfChipRow}>
                <View style={styles.wfChip}>
                  <Text style={styles.wfChipTxt}>{b.serviceType === 'online' ? 'Online' : 'Home visit'}</Text>
                </View>
                <View style={styles.wfChip}>
                  <Text style={styles.wfChipTxt}>Hold: {paymentStatusLabel(b.paymentStatus)}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {openStep === 'plan' && !isOnline ? (
            <View style={styles.wfStack}>
              {showPlanPending ? (
                <Text style={[styles.wfNote, styles.wfNoteBlue]}>
                  Plan sent — waiting for the patient to consent before sessions can proceed.
                </Text>
              ) : null}
              {showCreatePlan ? (
                <HomePlanFormPhysio booking={b} busy={busy} onSubmit={(payload) => createPlan(b._id, payload)} />
              ) : null}
              {planLive && !showCreatePlan ? (
                <>
                  <Text style={styles.wfBoxText}>Active care plan for this patient.</Text>
                  <PlanSummaryGrid b={b} />
                </>
              ) : null}
              {!planLive && !showCreatePlan && !showPlanPending ? (
                <Text style={[styles.wfNote, styles.wfNoteAmber]}>
                  {b.managerId
                    ? 'Care manager will prepare the plan after assessment.'
                    : 'Create a home plan when you are ready to propose sessions and pricing.'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {openStep === 'sessions' ? (
            <View style={styles.wfStack}>
              {!planLive && !isOnline && !hasSchedulePlan ? (
                <Text style={styles.wfBoxText}>Sessions open after the care plan is live.</Text>
              ) : null}

              <SessionProgressPhysio booking={b} />

              {paymentSummary && !paymentGateSkipped && unlockedSessions < sessionsCount ? (
                <Text style={[styles.wfNote, styles.wfNoteBlue, { fontSize: type.xs }]}>
                  {unlockedSessions === 0
                    ? 'Collect at least one installment to unlock session #1.'
                    : `You can mark up to session #${unlockedSessions} of ${sessionsCount}. Collect the next installment to open more.`}
                </Text>
              ) : null}

              <View style={styles.wfBoxMuted}>
                <Text style={styles.wfBoxTitleSm}>Visit schedule</Text>
                <Text style={styles.wfBoxHint}>
                  Mark complete, log progress each visit, or reschedule. Assessment baseline shows on the complementary visit.
                </Text>
                {formatProgressHistoryLine(b) ? (
                  <Text style={styles.wfProgressLine}>Progress · {formatProgressHistoryLine(b)}</Text>
                ) : null}
                <View style={styles.wfRows}>
                  {rows.map((r) => {
                    const rowKey = String(r.sessionId || r.key)
                    const isComplimentary = Boolean(r.complimentary)
                    const rowDone = r.status === 'completed'
                    const rowNoShow = r.status === 'no_show'
                    const isToday = r.date === tday
                    const isTodayOrPast = r.date <= tday
                    const rowStatus = rowDone || rowNoShow ? r.status : b.rescheduled && r.date !== tday ? 'rescheduled' : 'scheduled'
                    const actBusy = String(busySessionKey || '') === rowKey
                    // Same rules as web BookingSessionTimeline; a missed (no-show) visit can still be rescheduled or marked complete.
                    const showPhysioButtons = !rowDone && !isComplimentary
                    const showReschedule = !rowDone && !isComplimentary
                    const perRowReason = rowBlockedReason(r)
                    const blockedReason = !isTodayOrPast
                      ? 'You can mark this session once its scheduled day arrives'
                      : perRowReason
                    const canActOnRow = showPhysioButtons && !blockedReason
                    const payEntry = sessionPaymentMap?.[r.sessionId ? String(r.sessionId) : '__primary__']
                    const hasNotes = Boolean(r.notes?.text?.trim() || r.notes?.painNow != null)
                    const rowTone = isComplimentary
                      ? styles.wfRowTeal
                      : rowDone
                      ? styles.wfRowDone
                      : rowNoShow
                      ? styles.wfRowNoShow
                      : isToday
                      ? styles.wfRowToday
                      : b.rescheduled
                      ? styles.wfRowResched
                      : null
                    const pill = ROW_PILL[rowStatus] || ROW_PILL.scheduled

                    return (
                      <View key={r.key} style={[styles.wfRow, rowTone]}>
                        <View style={styles.wfRowTop}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.wfRowTitle}>
                              <Text style={{ fontFamily: font.semiBold }}>
                                {isComplimentary ? r.label || 'Assessment' : `#${r.n}`}
                              </Text>
                              <Text style={{ color: colors.slate500 }}> · </Text>
                              {formatBookingDateAndSlot(r.date, r.time)}
                            </Text>
                            <View style={styles.wfRowTitleLine}>
                              {isComplimentary ? (
                                <View style={styles.wfTagTeal}><Text style={styles.wfTagTealTxt}>COMPLIMENTARY</Text></View>
                              ) : null}
                              {showPhysioButtons && isToday ? <Text style={styles.wfTodayTxt}>Today</Text> : null}
                              {showPhysioButtons && perRowReason ? (
                                <View style={styles.wfTagLocked}>
                                  <Ionicons name="lock-closed" size={9} color={colors.slate700} />
                                  <Text style={styles.wfTagLockedTxt}>LOCKED</Text>
                                </View>
                              ) : null}
                            </View>
                            {!isComplimentary ? (
                              <Text style={styles.wfPayLine}>
                                {payEntry?.recorded > 0.009 ? (
                                  <Text style={{ fontFamily: font.semiBold, color: colors.teal800 }}>
                                    ₹{Number(payEntry.recorded).toFixed(2)} recorded
                                    {payEntry.items?.some((i) => i.explicit === false) ? (
                                      <Text style={{ fontFamily: font.regular, color: colors.slate500 }}> (allocated)</Text>
                                    ) : null}
                                  </Text>
                                ) : 'No payment recorded yet'}
                              </Text>
                            ) : null}
                          </View>
                          <View style={[styles.wfPill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
                            <Text style={[styles.wfPillTxt, { color: pill.fg }]}>{pill.label}</Text>
                          </View>
                        </View>

                        {showReschedule || showPhysioButtons || !isComplimentary ? (
                          <View style={styles.wfRowBtns}>
                            {showReschedule ? (
                              <Pressable style={[styles.wfRowBtn, styles.wfRowBtnBlue]} onPress={() => openReschedule(r)}>
                                <Text style={[styles.wfRowBtnTxt, { color: colors.blue700 }]}>Reschedule</Text>
                              </Pressable>
                            ) : null}
                            {showPhysioButtons ? (
                              <Pressable
                                style={[styles.wfRowBtn, styles.wfRowBtnGreen, (!canActOnRow || actBusy) && styles.stepperBtnDisabled]}
                                disabled={!canActOnRow || actBusy}
                                onPress={() => onCompleteRow(r)}
                              >
                                <Text style={[styles.wfRowBtnTxt, { color: colors.emerald700 }]}>{actBusy ? 'Saving…' : 'Mark complete'}</Text>
                              </Pressable>
                            ) : null}
                            {showPhysioButtons && !rowNoShow && r.perSession ? (
                              <Pressable
                                style={[styles.wfRowBtn, styles.wfRowBtnRose, (!canActOnRow || actBusy) && styles.stepperBtnDisabled]}
                                disabled={!canActOnRow || actBusy}
                                onPress={() => onNoShowRow(r)}
                              >
                                <Text style={[styles.wfRowBtnTxt, { color: colors.rose900 }]}>No-show</Text>
                              </Pressable>
                            ) : null}
                            {!isComplimentary ? (
                              <Pressable style={[styles.wfLogBtn, hasNotes && styles.wfLogBtnHas]} onPress={() => setNotesRow(r)}>
                                <Text style={styles.wfLogBtnTxt}>{hasNotes ? 'Edit progress' : 'Log progress'}</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}

                        {showPhysioButtons && blockedReason ? <Text style={styles.wfRowHint}>{blockedReason}</Text> : null}
                        {rowNoShow && r.noShowReason ? <Text style={styles.wfRowHint}>Reason: {r.noShowReason}</Text> : null}
                        {isComplimentary && r.notes?.text ? <Text style={styles.wfRowHint}>{r.notes.text}</Text> : null}
                      </View>
                    )
                  })}
                </View>
              </View>

              {!hasSchedulePlan && b.sessionStatus !== 'completed' ? (
                <Pressable
                  style={[styles.wfPrimaryBtn, (busy || !canMarkComplete) && styles.stepperBtnDisabled]}
                  disabled={busy || !canMarkComplete}
                  onPress={() => confirmComplete({ perSession: false })}
                >
                  <Text style={styles.wfPrimaryBtnTxt}>{busy ? 'Saving…' : 'Mark visit complete'}</Text>
                </Pressable>
              ) : null}
              {!hasSchedulePlan && b.sessionStatus !== 'completed' && !canMarkComplete && paymentBlockReason ? (
                <Text style={styles.wfBoxHint}>{paymentBlockReason}</Text>
              ) : null}
            </View>
          ) : null}

          {openStep === 'payment' ? (
            <View style={styles.wfStack}>
              {!planLive && !isOnline ? (
                <Text style={styles.wfBoxText}>Payment details appear after the plan goes live.</Text>
              ) : (
                <>
                  <View style={styles.wfGrid}>
                    <GridCell k="Mode" v={paymentModeLabel(b)} />
                    <GridCell k="Amount" v={paymentAmountLabel(b)} strong />
                    <GridCell k="Hold" v={paymentStatusLabel(b.paymentStatus)} />
                    <GridCell k="Status" v={marketplacePaymentStatusLabel(b.payment?.status)} />
                    {outstanding > 0.009 ? (
                      <View style={[styles.wfGridCell, { width: '100%' }]}>
                        <Text style={styles.wfGridK}>Outstanding</Text>
                        <Text style={[styles.wfGridV, { fontSize: type.md, color: colors.rose900 }]}>₹{outstanding.toFixed(0)}</Text>
                      </View>
                    ) : null}
                  </View>

                  {b.offlinePaymentRejectReason && b.payment?.status === 'pending' ? (
                    <View style={styles.warnBox}>
                      <Text style={styles.warnTitle}>Admin note</Text>
                      <Text style={styles.warnBody}>{b.offlinePaymentRejectReason}</Text>
                    </View>
                  ) : null}

                  {showInstallments ? (
                    <InstallmentsPhysioCard
                      title={isOfflinePlan ? 'Collections' : 'Installments'}
                      subtitle={isOfflinePlan ? 'Record each cash/UPI hand-off from the patient.' : 'Patient pays online per installment.'}
                      summary={paymentSummary}
                      payments={payments}
                      emptyMessage={isOfflinePlan ? 'No collections recorded yet.' : 'No online installments yet.'}
                    >
                      {isOfflinePlan && outstanding > 0.009 && planLive && !b.managerId ? (
                        <Pressable style={styles.recordCollectionBtn} onPress={() => openRecordCollection(null)}>
                          <Ionicons name="add-circle-outline" size={14} color={colors.white} />
                          <Text style={styles.recordCollectionBtnTxt}>Record collection</Text>
                        </Pressable>
                      ) : null}
                    </InstallmentsPhysioCard>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>

        {/* ── Mark complete confirmation ───────────────── */}
        <Modal transparent visible={confirmCompleteRow != null} animationType="fade" onRequestClose={() => setConfirmCompleteRow(null)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setConfirmCompleteRow(null)} />
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={[styles.modalIconWrap, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="checkmark-done-outline" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Mark session as complete?</Text>
                  <Text style={styles.modalSub}>
                    {confirmCompleteRow?.perSession
                      ? `Session #${confirmCompleteRow.n} · ${formatBookingDateAndSlot(confirmCompleteRow.date, confirmCompleteRow.time)}`
                      : formatBookingDateAndSlot(b.date, b.timeSlot)}
                  </Text>
                </View>
              </View>
              <View style={styles.confirmNote}>
                <Ionicons name="information-circle-outline" size={15} color={colors.teal800} />
                <Text style={styles.confirmNoteTxt}>Only mark it complete after the visit has taken place.</Text>
              </View>
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setConfirmCompleteRow(null)}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalPrimaryBtn, styles.confirmPrimaryBtn]} onPress={submitConfirmedComplete}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.white} />
                  <Text style={styles.modalPrimaryTxt}>Yes, mark complete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <SessionProgressModal open={notesRow != null} row={notesRow} booking={b} onClose={() => setNotesRow(null)} onSaved={load} />

        {/* ── No-show modal ──────────────────────────── */}
        <Modal transparent visible={Boolean(noShowRow)} animationType="fade">
          <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => { setNoShowRow(null); setNoShowReason('') }} />
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={styles.modalIconWrap}>
                  <Ionicons name="person-remove-outline" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Mark session as no-show</Text>
                  <Text style={styles.modalSub}>
                    Session #{noShowRow?.n} · {noShowRow ? formatBookingDateAndSlot(noShowRow.date, noShowRow.time) : ''}
                  </Text>
                </View>
              </View>
              <Text style={styles.inputLabel}>Reason (optional)</Text>
              <TextInput
                style={[styles.ta, noShowFocused && styles.taFocused]}
                onFocus={() => setNoShowFocused(true)}
                onBlur={() => setNoShowFocused(false)}
                value={noShowReason}
                onChangeText={setNoShowReason}
                multiline
                maxLength={500}
                placeholder="e.g. Patient was not at home; could not reach by phone."
                placeholderTextColor={colors.slate400}
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => { setNoShowRow(null); setNoShowReason('') }}
                >
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalDangerBtn, busySessionKey && styles.modalBtnBusy]}
                  disabled={busySessionKey != null}
                  onPress={submitNoShow}
                >
                  {busySessionKey ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalDangerTxt}>Mark no-show</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Record collection modal ────────────────── */}
        <Modal transparent visible={recordCollectionOpen} animationType="slide">
          <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => { setRecordCollectionOpen(false); setRecordErr('') }} />
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={[styles.modalIconWrap, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="cash-outline" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Record collection</Text>
                  <Text style={styles.modalSub}>
                    Outstanding ₹{outstanding.toFixed(2)}. Admin verification counts toward your payment milestones.
                  </Text>
                </View>
              </View>
              <Text style={styles.inputLabel}>For session</Text>
              <DropdownField
                label={null}
                value={recordSessionId}
                placeholder="Select session"
                options={collectionSessionOptions}
                onSelect={setRecordSessionId}
                variant="inline"
              />
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Amount (₹)</Text>
              <TextInput
                style={[styles.inp, recordAmountFocused && styles.inpFocused]}
                onFocus={() => setRecordAmountFocused(true)}
                onBlur={() => setRecordAmountFocused(false)}
                keyboardType="decimal-pad"
                value={recordAmount}
                onChangeText={setRecordAmount}
                placeholder="0.00"
                placeholderTextColor={colors.slate400}
              />
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Note (optional)</Text>
              <TextInput
                style={[styles.ta, recordNoteFocused && styles.taFocused]}
                onFocus={() => setRecordNoteFocused(true)}
                onBlur={() => setRecordNoteFocused(false)}
                value={recordNote}
                onChangeText={setRecordNote}
                multiline
                placeholder="Cash / UPI reference…"
                placeholderTextColor={colors.slate400}
              />
              {recordErr ? <Text style={styles.errSm}>{recordErr}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => { setRecordCollectionOpen(false); setRecordErr('') }}
                >
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalPrimaryBtn, recordBusy && styles.modalBtnBusy]}
                  disabled={recordBusy}
                  onPress={submitRecordCollection}
                >
                  {recordBusy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalPrimaryTxt}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Reschedule modal ───────────────────────── */}
        <Modal
          transparent
          visible={Boolean(rescheduleRow)}
          animationType="fade"
          onRequestClose={closeRescheduleModal}
        >
          <View style={styles.modalRootFlex}>
            <Pressable style={styles.modalBackdrop} onPress={closeRescheduleModal} accessibilityRole="button" accessibilityLabel="Close" />
            <View style={[styles.modalCard, styles.rescheduleCard]}>
              <View style={styles.modalIconRow}>
                <View style={[styles.modalIconWrap, { backgroundColor: colors.blue50 }]}>
                  <Ionicons name="calendar-outline" size={18} color={colors.blue600} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Reschedule session</Text>
                  {rescheduleRow && booking ? (
                    <Text style={styles.modalSub}>
                      {(rescheduleRow.n != null
                        ? `Session #${rescheduleRow.n}`
                        : rescheduleRow.sessionId
                          ? 'This session'
                          : 'Visit') +
                        ' — currently ' +
                        formatBookingDateAndSlot(
                          rescheduleRow.date || booking.date,
                          rescheduleRow.time || booking.timeSlot,
                        )}
                    </Text>
                  ) : null}
                </View>
              </View>

              {booking?.rescheduled && booking.previousDate != null && !rescheduleRow?.sessionId ? (
                <View style={styles.reschedulePrevBox}>
                  <Ionicons name="arrow-back-outline" size={12} color={colors.amber800} />
                  <Text style={styles.reschedulePrev}>
                    Previously: {formatBookingDateAndSlot(booking.previousDate, booking.previousTimeSlot)}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.rescheduleLabel}>New date</Text>
              {Platform.OS === 'ios' && iosSupportsCompactDate() ? (
                <View style={styles.rescheduleIosDateWrap}>
                  <DateTimePicker
                    value={rescheduleDate}
                    mode="date"
                    display="compact"
                    themeVariant="light"
                    minimumDate={rescheduleMinDate}
                    onChange={(_, selected) => selected && setRescheduleDate(selected)}
                  />
                </View>
              ) : Platform.OS === 'ios' ? (
                <>
                  <Pressable style={styles.rescheduleDateTap} onPress={() => setIosRescheduleDateOpen((o) => !o)}>
                    <Ionicons name="calendar-outline" size={15} color={colors.brand} />
                    <Text style={styles.rescheduleDateTapTxt}>{formatDmyDots(rescheduleDate)}</Text>
                    <Ionicons name={iosRescheduleDateOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.slate400} />
                  </Pressable>
                  {iosRescheduleDateOpen ? (
                    <>
                      <DateTimePicker
                        value={rescheduleDate}
                        mode="date"
                        display="spinner"
                        minimumDate={rescheduleMinDate}
                        themeVariant="light"
                        onChange={(_, selected) => { if (selected) setRescheduleDate(selected) }}
                      />
                      <Pressable style={styles.modalCancelBtn} onPress={() => setIosRescheduleDateOpen(false)}>
                        <Text style={styles.modalCancelTxt}>Done</Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <Pressable style={styles.rescheduleDateTap} onPress={() => setAndroidRescheduleDateOpen(true)}>
                    <Ionicons name="calendar-outline" size={15} color={colors.brand} />
                    <Text style={styles.rescheduleDateTapTxt}>{formatDmyDots(rescheduleDate)}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.slate400} />
                  </Pressable>
                  {androidRescheduleDateOpen ? (
                    <DateTimePicker
                      value={rescheduleDate}
                      mode="date"
                      display="calendar"
                      minimumDate={rescheduleMinDate}
                      themeVariant="light"
                      onChange={(ev, selected) => {
                        setAndroidRescheduleDateOpen(false)
                        if (ev?.type !== 'dismissed' && selected) setRescheduleDate(selected)
                      }}
                    />
                  ) : null}
                </>
              )}

              <Text style={[styles.rescheduleLabel, { marginTop: 18 }]}>New time slot</Text>
              <DropdownField
                label={null}
                value={rescheduleSlot}
                placeholder="Select a time"
                options={RESCHEDULE_SLOT_OPTIONS}
                onSelect={setRescheduleSlot}
                variant="inline"
              />

              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={closeRescheduleModal} disabled={rescheduleBusy}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalPrimaryBtn, rescheduleBusy && styles.modalBtnBusy]}
                  onPress={saveReschedule}
                  disabled={rescheduleBusy}
                >
                  {rescheduleBusy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.modalPrimaryTxt}>Save new time</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </BookingDetailChrome>
  )
}

const styles = StyleSheet.create({
  // ── Web-parity workflow layout (header / checklist / step panel) ──
  wfCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: '0px 1px 3px rgba(15, 23, 42, 0.06)' },
      default: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    }),
  },
  wfBackLink: { fontFamily: font.medium, fontSize: type.base, color: colors.teal800 },
  wfHeadRow: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  wfName: { fontFamily: font.semiBold, fontSize: type.xl, lineHeight: leading.xl, color: colors.slate900 },
  wfCode: { marginTop: 2, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: type.xs, fontWeight: '600', color: colors.slate500 },
  wfIssue: { marginTop: 2, fontFamily: font.regular, fontSize: type.base, color: colors.slate600 },
  wfMeta: { marginTop: 6, fontFamily: font.regular, fontSize: type.base, color: colors.slate500 },
  wfBadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  wfBadgeTxt: { fontFamily: font.semiBold, fontSize: type.xs },
  wfKicker: { marginBottom: 8, fontFamily: font.semiBold, fontSize: type.xs, letterSpacing: 0.6, color: colors.slate500 },
  railRow: { flexDirection: 'row', gap: 4 },
  railItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 2 },
  railItemOpen: { backgroundColor: colors.teal50, borderWidth: 1, borderColor: colors.brandSoft },
  railCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  railCircleDone: { backgroundColor: '#059669' },
  railCircleWaiting: { backgroundColor: '#dbeafe', borderWidth: 2, borderColor: '#60a5fa' },
  railCircleCurrent: { backgroundColor: colors.brand, borderWidth: 2, borderColor: '#5eead4' },
  railCircleUpcoming: { backgroundColor: colors.slate100 },
  railCircleTxt: { fontFamily: font.bold, fontSize: type.xs },
  railLabel: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.slate700 },
  railHint: { fontFamily: font.regular, fontSize: type.xs, color: colors.slate500, maxWidth: '100%' },
  wfPanelHead: { marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.slate100 },
  wfStepKicker: { fontFamily: font.semiBold, fontSize: type.xs, letterSpacing: 0.6, color: colors.teal800 },
  wfPanelTitle: { marginTop: 2, fontFamily: font.semiBold, fontSize: type.lg, lineHeight: leading.lg, color: colors.slate900 },
  wfWaitingTxt: { marginTop: 4, fontFamily: font.regular, fontSize: type.base, color: colors.blue700 },
  wfStack: { gap: 14 },
  wfBox: { borderRadius: 12, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, padding: 14 },
  wfBoxMuted: { borderRadius: 12, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.slate50, padding: 14 },
  wfBoxLabel: { fontFamily: font.semiBold, fontSize: type.xs, letterSpacing: 0.6, color: colors.slate500 },
  wfBoxTitle: { marginTop: 4, fontFamily: font.semiBold, fontSize: type.md, color: colors.slate900 },
  wfBoxTitleSm: { fontFamily: font.semiBold, fontSize: type.base, color: colors.slate900 },
  wfBoxText: { marginTop: 2, fontFamily: font.regular, fontSize: type.base, lineHeight: leading.base, color: colors.slate600 },
  wfBoxHint: { marginTop: 2, fontFamily: font.regular, fontSize: type.xs, lineHeight: leading.xs, color: colors.slate500 },
  wfBtnRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wfOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    backgroundColor: colors.teal50,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  wfOutlineBtnTxt: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.teal800 },
  wfChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wfChip: { borderRadius: 999, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.slate50, paddingHorizontal: 10, paddingVertical: 3 },
  wfChipTxt: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.slate700 },
  wfNote: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontFamily: font.regular, fontSize: type.base, lineHeight: leading.base, overflow: 'hidden' },
  wfNoteBlue: { backgroundColor: colors.blue50, color: colors.blue700 },
  wfNoteAmber: { backgroundColor: colors.amber50, color: colors.amber950 },
  wfGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.slate50, padding: 14 },
  wfGridCell: { width: '50%', paddingRight: 8 },
  wfGridK: { fontFamily: font.regular, fontSize: type.base, color: colors.slate500 },
  wfGridV: { marginTop: 2, fontFamily: font.medium, fontSize: type.base, color: colors.slate900 },
  wfPrimaryBtn: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: colors.brand, paddingHorizontal: 18, paddingVertical: 11 },
  wfPrimaryBtnTxt: { fontFamily: font.semiBold, fontSize: type.md, color: colors.white },
  wfRowTitleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  wfTagTeal: { borderRadius: 6, borderWidth: 1, borderColor: colors.brandSoft, backgroundColor: colors.teal50, paddingHorizontal: 5, paddingVertical: 1 },
  wfTagTealTxt: { fontFamily: font.semiBold, fontSize: 9, letterSpacing: 0.4, color: colors.teal800 },
  wfTagLocked: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.slate100, paddingHorizontal: 5, paddingVertical: 1 },
  wfTagLockedTxt: { fontFamily: font.semiBold, fontSize: 9, letterSpacing: 0.4, color: colors.slate700 },
  wfProgressLine: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    backgroundColor: colors.teal50,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: font.medium,
    fontSize: type.xs,
    color: colors.teal800,
    overflow: 'hidden',
  },
  wfLogBtn: { borderRadius: 8, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 4 },
  wfLogBtnHas: { borderColor: '#a5b4fc', backgroundColor: '#e0e7ff' },
  wfLogBtnTxt: { fontFamily: font.semiBold, fontSize: type.xs, color: '#3730a3' },
  wfRows: { marginTop: 12, gap: 8 },
  wfRow: { borderRadius: 10, borderWidth: 1, borderColor: colors.slate100, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 10 },
  wfRowTeal: { borderColor: '#99f6e4', backgroundColor: 'rgba(240, 253, 250, 0.7)' },
  wfRowDone: { borderColor: '#a7f3d0', backgroundColor: 'rgba(236, 253, 245, 0.9)' },
  wfRowNoShow: { borderColor: '#fecdd3', backgroundColor: 'rgba(255, 241, 242, 0.8)' },
  wfRowToday: { borderColor: '#93c5fd', backgroundColor: colors.blue50 },
  wfRowResched: { borderColor: colors.amber200, backgroundColor: 'rgba(255, 251, 235, 0.5)' },
  wfRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  wfRowTitle: { fontFamily: font.regular, fontSize: type.base, lineHeight: leading.base, color: colors.slate800 },
  wfTodayTxt: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.blue700 },
  wfPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  wfPillTxt: { fontFamily: font.semiBold, fontSize: type.sm },
  wfRowBtns: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wfRowBtn: { borderRadius: 8, borderWidth: 1, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 5 },
  wfRowBtnBlue: { borderColor: '#bfdbfe' },
  wfRowBtnGreen: { borderColor: '#a7f3d0' },
  wfRowBtnRose: { borderColor: '#fecdd3' },
  wfRowBtnTxt: { fontFamily: font.semiBold, fontSize: type.sm },
  wfRowHint: { marginTop: 6, fontFamily: font.regular, fontSize: type.xs, lineHeight: leading.xs, color: colors.slate500 },
  wfPayLine: { marginTop: 3, fontFamily: font.regular, fontSize: type.xs, color: colors.slate500 },

  screenRoot: {
    flex: 1,
    backgroundColor: colors.canvas,
    position: 'relative',
    overflow: 'hidden',
  },
  ambientLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  screenBody: {
    flex: 1,
    zIndex: 1,
  },
  sectionGap: { height: 10 },
  footerCard: { marginTop: 10 },

  // ── Custom header ────────────────────────────────
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    ...bookingCardSurface,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    boxShadow: Platform.OS === 'web' ? 'none' : undefined,
    shadowOpacity: Platform.OS === 'web' ? undefined : 0,
    elevation: 0,
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    flexShrink: 0,
  },
  customHeaderCenter: { flex: 1, minWidth: 0 },
  customHeaderTitle: {
    fontFamily: font.bold,
    fontSize: type.base,
    color: colors.textPrimary,
  },
  customHeaderSub: {
    marginTop: 1,
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.textSecondary,
  },
  customHeaderSpacer: { width: 34 },

  // ── Premium Hero Card ────────────────────────────
  premiumHeroCard: {
    borderRadius: 20,
    backgroundColor: '#0d3d38',
    padding: 16,
    marginTop: 8,
    shadowColor: '#0d3d38',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
  },
  premiumHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  premiumHeroServiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  premiumHeroServiceText: {
    fontFamily: font.bold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  premiumHeroStatusRow: {
    flexDirection: 'row',
    gap: 6,
  },
  premiumStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  premiumStatusText: {
    fontFamily: font.bold,
    fontSize: 9,
  },
  premiumHeroMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assignedPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingVertical: 6,
  },
  assignedPlaceholderTxt: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: type.sm,
    color: 'rgba(255,255,255,0.45)',
    fontStyle: 'italic',
  },
  premiumAvatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  premiumAvatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  premiumAvatarText: {
    fontFamily: font.bold,
    fontSize: 18,
    color: '#0d3d38',
  },
  premiumPatientInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  premiumPatientName: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.white,
  },
  premiumPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  premiumPatientPhone: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: 'rgba(255,255,255,0.65)',
  },
  premiumComplaintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginTop: 2,
  },
  premiumComplaintText: {
    fontFamily: font.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
  },
  premiumHeroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 12,
  },
  premiumHeroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  premiumHeroDateText: {
    fontFamily: font.semiBold,
    fontSize: type.sm,
    color: 'rgba(255,255,255,0.85)',
  },
  premiumActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  premiumActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  premiumActionBtnDisabled: {
    opacity: 0.35,
  },
  premiumActionBtnTxt: {
    fontFamily: font.bold,
    fontSize: type.xs,
    color: colors.white,
  },
  premiumActionBtnTxtDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },

  // ── Banner ───────────────────────────────────────
  bannerMint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.35)',
    backgroundColor: colors.brandSoft,
  },
  bannerMintTxt: { flex: 1, fontFamily: font.semiBold, fontSize: type.xs, color: colors.teal800, lineHeight: 16 },

  assignmentBanner: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.35)',
    backgroundColor: colors.amber50,
    gap: 8,
  },
  assignmentBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assignmentBannerTitle: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: type.sm,
    color: colors.amber800,
  },
  assignmentBannerBody: {
    fontFamily: font.medium,
    fontSize: type.xs,
    color: colors.amber800,
    lineHeight: 17,
    opacity: 0.85,
  },
  assignmentBannerBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  assignmentAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.success,
  },
  assignmentAcceptTxt: {
    fontFamily: font.bold,
    fontSize: type.sm,
    color: colors.white,
  },
  assignmentRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.white,
  },
  assignmentRejectTxt: {
    fontFamily: font.bold,
    fontSize: type.sm,
    color: colors.danger,
  },

  // ── Tab bar ──────────────────────────────────────
  tabIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  tabBadgeDot: {
    position: 'absolute',
    top: -3,
    right: -5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(241, 245, 249, 0.90)',
    borderRadius: 14,
    padding: 4,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.07)',
  },
  segmentedTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  },
  segmentedTabActive: {
    backgroundColor: colors.white,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderBottomColor: 'transparent',
  },
  segmentedTabTxt: {
    fontFamily: font.semiBold,
    fontSize: type.xs,
    color: colors.slate400,
  },
  segmentedTabTxtActive: {
    fontFamily: font.bold,
    color: colors.brand,
  },
  tabContentGap: {
    gap: 12,
  },

  // ── Section titles ────────────────────────────────
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(13, 148, 136, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitleBody: { flex: 1, minWidth: 0 },
  sectionTitleRight: { flexShrink: 0 },
  h2: { fontFamily: font.bold, fontSize: type.base, color: colors.textPrimary },
  sectionHint: { marginTop: 2, fontFamily: font.regular, fontSize: 11, color: colors.textTertiary },

  // ── Section cards ────────────────────────────────
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  notesHeaderPress: { marginBottom: 4 },

  // ── People section ────────────────────────────────
  physioSelfBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    marginBottom: 12,
  },
  physioSelfIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  issueBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
  },
  issue: { marginTop: 6, fontFamily: font.regular, fontSize: type.sm, color: colors.slate700, lineHeight: 18 },

  // ── Info stripe ──────────────────────────────────
  infoStripe: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.35)',
  },
  infoStripeTxt: { flex: 1, fontFamily: font.regular, fontSize: type.xs, color: colors.teal800, lineHeight: 16 },

  // ── Milestone payment schedule ────────────────────
  milestoneStrip: {
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,253,250,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  milestoneRowMet: {},
  milestoneTxt: { flex: 1, fontFamily: font.medium, fontSize: 11, color: colors.amber800, lineHeight: 15 },
  milestoneTxtMet: { color: colors.success },

  // ── Payments ─────────────────────────────────────
  subHead: {
    marginTop: 12,
    marginBottom: 8,
    fontFamily: font.bold,
    fontSize: type.xs,
    color: colors.teal800,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  subSectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
    marginVertical: 14,
  },
  recordCollectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  recordCollectionBtnTxt: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.white },
  warnBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  warnTitle: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.danger },
  warnBody: { marginTop: 4, fontFamily: font.regular, fontSize: type.xs, color: colors.danger, lineHeight: 16 },

  // ── Note editor ───────────────────────────────────
  noteEditorWrap: {
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fffe',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(13, 148, 136, 0.35)',
  },
  noteEditorLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  noteEditorLabel: {
    fontFamily: font.bold,
    fontSize: 10,
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteEditorTs: { marginTop: 6, fontFamily: font.regular, fontSize: 9.5, color: colors.textTertiary },
  saveNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.brand,
    flexShrink: 0,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 4,
    elevation: 2,
  },
  saveNoteBtnBusy: { opacity: 0.55 },
  saveNoteBtnTxt: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.white },

  // ── Quick action (complete session) ──────────────
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  completeBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  completeBtnTxt: { fontFamily: font.bold, fontSize: type.base, color: colors.white },

  // ── KV rows ──────────────────────────────────────
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 148, 136, 0.08)',
  },
  kvRowLast: { borderBottomWidth: 0 },
  kvRowHighlight: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  kvPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...innerPanelSurface,
  },
  kvPillTxt: {
    fontFamily: font.bold,
    fontSize: type.xs,
  },
  kvK: { fontFamily: font.regular, fontSize: type.sm, color: colors.textSecondary },
  kvV: { fontFamily: font.medium, fontSize: type.sm, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  kvBold: { fontFamily: font.bold, color: colors.brand },
  kvCap: { textTransform: 'capitalize' },

  // ── Modals ───────────────────────────────────────
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalRootFlex: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: colors.white,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  rescheduleCard: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  modalIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  modalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modalTitle: { fontFamily: font.bold, fontSize: type.lg, color: colors.textPrimary },
  modalSub: { marginTop: 3, fontFamily: font.regular, fontSize: type.sm, color: colors.textSecondary, lineHeight: 18 },
  inputLabel: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    alignItems: 'center',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    backgroundColor: colors.white,
  },
  modalCancelTxt: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.textPrimary },
  modalPrimaryBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnBusy: { opacity: 0.6 },
  confirmNote: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    backgroundColor: colors.teal50,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confirmNoteTxt: { flex: 1, fontFamily: font.medium, fontSize: type.sm, lineHeight: 17, color: colors.teal800 },
  confirmPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.brand },
  modalPrimaryTxt: { fontFamily: font.bold, fontSize: type.sm, color: colors.white },
  modalDangerTxt: { fontFamily: font.bold, fontSize: type.sm, color: colors.white },

  // Reschedule modal extras
  reschedulePrevBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  reschedulePrev: { fontFamily: font.medium, fontSize: type.xs, color: colors.amber800 },
  rescheduleLabel: {
    marginTop: 16,
    marginBottom: 10,
    fontFamily: font.semiBold,
    fontSize: type.xs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  rescheduleIosDateWrap: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  rescheduleDateTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
  },
  rescheduleDateTapTxt: { flex: 1, fontFamily: font.semiBold, fontSize: type.base, color: colors.textPrimary },

  // ── Misc ──────────────────────────────────────────
  scroll: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'transparent' },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  err: { fontFamily: font.medium, fontSize: type.base, color: colors.textSecondary, marginBottom: 16, textAlign: 'center' },
  backBtnOutline: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    backgroundColor: colors.white,
  },
  backBtnOutlineTxt: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.textPrimary },
  k: { fontFamily: font.semiBold, fontSize: 10, color: colors.slate500, textTransform: 'uppercase', letterSpacing: 0.4 },
  v: { marginTop: 4, fontFamily: font.medium, fontSize: type.sm, color: colors.textPrimary },
  muted: { fontFamily: font.regular, fontSize: type.sm, color: colors.textSecondary },
  mutedSm: { marginTop: 4, fontFamily: font.regular, fontSize: type.xs, color: colors.textSecondary },
  errSm: { marginTop: 8, fontFamily: font.semiBold, fontSize: type.xs, color: colors.danger },
  ta: {
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    borderRadius: 10,
    padding: 10,
    minHeight: 56,
    textAlignVertical: 'top',
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.textPrimary,
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
  },
  inp: {
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    borderRadius: 10,
    padding: 10,
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.textPrimary,
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
  },
  taFocused: {
    backgroundColor: colors.white,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  inpFocused: {
    backgroundColor: colors.white,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(13, 148, 136, 0.08)', marginVertical: 10 },

  // ── Plan tab ─────────────────────────────────────
  planPendingCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    overflow: 'hidden',
    shadowColor: '#92400e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  planPendingBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.warningBorder,
    padding: 14,
  },
  planPendingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  planPendingTitle: {
    fontFamily: font.bold,
    fontSize: type.base,
    color: colors.amber800,
  },
  planPendingBody: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.amber800,
    lineHeight: 16,
    marginTop: 2,
    opacity: 0.80,
  },
  planPendingKVs: {
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  planApprovedCard: {
    ...bookingCardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
  },
  planApprovedHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  planApprovedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  planApprovedTitle: {
    fontFamily: font.bold,
    fontSize: type.lg,
    color: colors.textPrimary,
  },
  planApprovedSub: {
    marginTop: 3,
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  planNaCard: {
    ...bookingCardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  planNaTxt: {
    fontFamily: font.medium,
    fontSize: type.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  planKVRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 148, 136, 0.08)',
  },
  planKVLabel: {
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.textSecondary,
  },
  planKVValue: {
    fontFamily: font.semiBold,
    fontSize: type.sm,
    color: colors.textPrimary,
  },
  planKVValueHL: {
    fontFamily: font.bold,
    fontSize: type.lg,
    color: colors.brand,
  },

  // Glows
  ambientHeaderGlow: {
    position: 'absolute',
    top: -120,
    left: -60,
    right: -60,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(162, 240, 239, 0.15)',
  },
  ambientHeaderGlow2: {
    position: 'absolute',
    top: -50,
    left: '20%',
    width: '60%',
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(13, 107, 107, 0.04)',
  },

  // ── Stepper timeline ──────────────────────────────
  stepperContainer: {
    marginTop: 8,
    position: 'relative',
  },
  stepperRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  stepperLeftCol: {
    width: 34,
    alignItems: 'center',
    position: 'relative',
  },
  stepperLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 16,
    width: 2,
    backgroundColor: colors.slate200,
  },
  stepperLineFirst: {
    top: 17,
  },
  stepperLineLast: {
    bottom: 'auto',
    height: 17,
  },
  stepperLineDone: {
    backgroundColor: colors.success,
    width: 2,
  },
  stepperNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.slate100,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepperNodeDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  stepperNodeNoShow: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  stepperNodeToday: {
    backgroundColor: 'rgba(13,148,136,0.10)',
    borderColor: colors.brand,
    borderWidth: 2,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  stepperNodeTodayInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brand,
  },
  stepperCard: {
    flex: 1,
    marginLeft: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...bookingCardSurface,
    padding: 14,
    shadowOpacity: Platform.OS === 'web' ? undefined : 0.04,
    elevation: 1,
  },
  stepperCardExpanded: {
    borderColor: 'rgba(13,148,136,0.30)',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  stepperCardDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.03)',
    borderColor: 'rgba(16, 185, 129, 0.18)',
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  stepperCardNoShow: {
    backgroundColor: 'rgba(239, 68, 68, 0.02)',
    borderColor: 'rgba(239, 68, 68, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  stepperCardToday: {
    borderColor: 'rgba(13, 148, 136, 0.30)',
    backgroundColor: 'rgba(13, 148, 136, 0.025)',
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  stepperCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  stepperSessionNum: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  stepperSessionNumDone: {
    color: colors.success,
  },
  stepperSessionDate: {
    fontFamily: font.regular,
    fontSize: 11,
    color: colors.slate500,
    marginTop: 2,
  },
  stepperStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  stepperStatusBadgeDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
    borderColor: 'rgba(16, 185, 129, 0.20)',
  },
  stepperStatusBadgeNoShow: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.18)',
  },
  stepperStatusBadgeToday: {
    backgroundColor: 'rgba(13, 148, 136, 0.10)',
    borderColor: 'rgba(13, 148, 136, 0.22)',
  },
  stepperStatusText: {
    fontFamily: font.bold,
    fontSize: 9,
    color: colors.slate600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepperStatusTextDone: {
    color: colors.success,
  },
  stepperStatusTextNoShow: {
    color: colors.danger,
  },
  stepperStatusTextToday: {
    color: colors.brand,
  },
  stepperConfirmBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  stepperConfirmBadgePending: {
    backgroundColor: colors.amber50 || '#fffbeb',
    borderColor: colors.amber200 || '#fde68a',
  },
  stepperConfirmBadgeDone: {
    backgroundColor: colors.successBg || '#f0fdf4',
    borderColor: '#a7f3d0',
  },
  stepperConfirmBadgeTxt: {
    fontFamily: font.semiBold,
    fontSize: 10,
  },
  stepperConfirmBadgeTxtPending: {
    color: colors.amber800 || '#92400e',
  },
  stepperConfirmBadgeTxtDone: {
    color: colors.success || '#15803d',
  },
  stepperNoShowBox: {
    marginTop: 6,
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  stepperNoShowTitle: {
    fontFamily: font.semiBold,
    fontSize: 9,
    color: colors.danger,
  },
  stepperNoShowReason: {
    fontFamily: font.regular,
    fontSize: 9,
    color: colors.danger,
    marginTop: 2,
  },
  stepperDrawer: {
    marginTop: 8,
  },
  stepperDrawerContent: {
    marginTop: 6,
  },
  stepperActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  stepperCollectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.25)',
    backgroundColor: 'rgba(13, 148, 136, 0.06)',
  },
  stepperCollectBtnTxt: {
    fontFamily: font.semiBold,
    fontSize: 12,
    color: colors.brand,
  },
  stepperCompleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 6,
    elevation: 3,
  },
  stepperCompleteBtnHalf: {
    flex: 1,
  },
  stepperCompleteBtnFull: {
    flex: 1,
    width: '100%',
  },
  stepperCompleteBtnTxt: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.white,
  },
  stepperPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.brand,
    marginBottom: 8,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  stepperPrimaryBtnTxt: {
    fontFamily: font.bold,
    fontSize: type.xs,
    color: colors.white,
  },
  stepperSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepperSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.white,
  },
  stepperSecondaryBtnTxt: {
    fontFamily: font.semiBold,
    fontSize: 12,
    color: colors.slate800,
  },
  stepperReschedBtn: {
    borderColor: 'rgba(13, 148, 136, 0.18)',
    backgroundColor: 'rgba(13, 148, 136, 0.04)',
  },
  stepperNoShowBtn: {
    borderColor: 'rgba(239, 68, 68, 0.18)',
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
  },
  stepperBtnDisabled: {
    opacity: 0.45,
  },
  lockBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  lockBoxUpcoming: {
    backgroundColor: colors.amber50,
    borderColor: colors.warningBorder,
  },
  lockText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 10,
    color: colors.slate600,
    lineHeight: 14,
  },
  lockTextUpcoming: {
    color: colors.amber800,
  },
  timelineNoteDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginVertical: 10,
  },
  noteSnippetWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: colors.slate50,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  noteSnippetText: {
    fontFamily: font.regular,
    fontSize: 10,
    color: colors.slate600,
  },

  // ── Stripe billing card ──────────────────────────
  stripeProgressCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    backgroundColor: colors.white,
    shadowColor: '#0d3d38',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 4,
  },
  stripeProgressHeaderBand: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#0d3d38',
    padding: 16,
    paddingBottom: 14,
    gap: 12,
  },
  stripeProgressTitle: {
    fontFamily: font.bold,
    fontSize: type.base,
    color: colors.white,
  },
  stripeProgressSub: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
  },
  stripeProgressPctWrap: {
    alignItems: 'flex-end',
    gap: 5,
    flexShrink: 0,
  },
  stripeProgressPct: {
    fontFamily: font.bold,
    fontSize: 30,
    color: colors.white,
    lineHeight: 34,
  },
  stripeOutstandingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  stripeOutstandingBadgeOnline: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  stripeOutstandingBadgeTxt: {
    fontFamily: font.bold,
    fontSize: 10,
    color: '#fbbf24',
  },
  stripeOutstandingBadgeTxtOnline: {
    fontFamily: font.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
  },
  stripeSplitBar: {
    height: 10,
    backgroundColor: 'rgba(13,61,56,0.12)',
    overflow: 'hidden',
  },
  stripeSplitBarPaid: {
    height: '100%',
    backgroundColor: colors.success,
  },
  stripeMetricsRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  stripeMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stripeMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(13,148,136,0.10)',
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  stripeMetricDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  stripeMetricLabel: {
    fontFamily: font.regular,
    fontSize: 10,
    color: colors.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stripeMetricVal: {
    fontFamily: font.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
})
