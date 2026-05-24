import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView as RNScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { ScrollView as GHScrollView } from 'react-native-gesture-handler'
import Toast from 'react-native-toast-message'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../api/client'
import HomePlanFormPhysio from '../components/physio/HomePlanFormPhysio'
import InstallmentsPhysioCard from '../components/physio/InstallmentsPhysioCard'
import SessionProgressPhysio from '../components/physio/SessionProgressPhysio'
import { DAILY_SLOTS } from '../constants/slots'
import { colors } from '../theme/colors'
import { font, type } from '../theme/typography'
import {
  marketplacePaymentStatusLabel,
  paymentAmountLabel,
  paymentModeLabel,
  paymentStatusLabel,
  sessionStatusLabel,
} from '../utils/bookingDisplay'
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

const BASE_TABS = [
  { key: 'treatment', label: 'Treatment Hub', icon: 'medical-outline', iconOn: 'medical' },
  { key: 'finance', label: 'Plan & Billing', icon: 'card-outline', iconOn: 'card' },
]

const TabBar = memo(function TabBar({ activeTab, onChange, tabs, badges = {} }) {
  return (
    <View style={styles.segmentedContainer}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key
        const hasBadge = badges[tab.key]
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segmentedTab, active && styles.segmentedTabActive]}
            onPress={() => onChange(tab.key)}
          >
            <View style={styles.tabIconWrap}>
              <Ionicons
                name={active ? tab.iconOn : tab.icon}
                size={13}
                color={active ? colors.brand : colors.slate400}
              />
              {hasBadge && !active ? <View style={styles.tabBadgeDot} /> : null}
            </View>
            <Text style={[styles.segmentedTabTxt, active && styles.segmentedTabTxtActive]}>{tab.label}</Text>
          </Pressable>
        )
      })}
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

function patientInitial(name) {
  const s = (name || '?').trim()
  return s ? s.slice(0, 1).toUpperCase() : '?'
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

const SectionTitle = memo(function SectionTitle({ title, hint, icon = 'information-circle-outline', right }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={14} color={colors.brand} />
      </View>
      <View style={styles.sectionTitleBody}>
        <Text style={styles.h2}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {right ? <View style={styles.sectionTitleRight}>{right}</View> : null}
    </View>
  )
})

const SessionNoteEditor = memo(function SessionNoteEditor({ row, onSaved }) {
  const [text, setText] = useState(row.notes?.text || '')
  const [busy, setBusy] = useState(false)
  const [meta, setMeta] = useState({ updatedAt: row.notes?.updatedAt })
  const [focused, setFocused] = useState(false)

  async function save() {
    if (!row.sessionId) {
      Toast.show({ type: 'error', text1: 'Session reference missing' })
      return
    }
    setBusy(true)
    try {
      const res = await api.patch(`/sessions/${row.sessionId}/notes`, { text })
      const n = res.data?.notes
      if (n) setMeta({ updatedAt: n.updatedAt })
      Toast.show({ type: 'success', text1: 'Notes saved' })
      onSaved?.()
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.noteEditorWrap}>
      <View style={styles.noteEditorLabelRow}>
        <Text style={styles.noteEditorLabel}>Clinical Notes</Text>
        <Pressable
          style={[styles.saveNoteBtn, busy && styles.saveNoteBtnBusy]}
          onPress={save}
          disabled={busy}
          hitSlop={4}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={13} color={colors.white} />
              <Text style={styles.saveNoteBtnTxt}>Save</Text>
            </>
          )}
        </Pressable>
      </View>
      <TextInput
        style={[styles.ta, focused && styles.taFocused]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Observations, exercises, follow-up…"
        placeholderTextColor={colors.slate400}
      />
      <Text style={styles.noteEditorTs}>
        {meta.updatedAt ? `Saved ${new Date(meta.updatedAt).toLocaleString('en-IN')}` : 'Not saved yet'}
      </Text>
    </View>
  )
})

export default function PhysioBookingDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { id } = route.params || {}
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
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
  const [recordErr, setRecordErr] = useState('')
  const [recordBusy, setRecordBusy] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState('treatment')
  const [noShowFocused, setNoShowFocused] = useState(false)
  const [recordAmountFocused, setRecordAmountFocused] = useState(false)
  const [recordNoteFocused, setRecordNoteFocused] = useState(false)
  const [expandedSessionId, setExpandedSessionId] = useState(null)


  useEffect(() => {
    if (booking) {
      const rows = normalizeSessionRows(booking)
      const activeRow = rows.find(r => r.status !== 'completed' && r.status !== 'no_show') || rows[0]
      if (activeRow) {
        setExpandedSessionId(String(activeRow.sessionId || activeRow.key))
      }
    }
  }, [booking])

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

  useEffect(() => { load() }, [load])

  const showCreatePlan = useMemo(() => {
    if (!booking) return false
    return (
      booking.serviceType === 'home' &&
      (booking.planStatus === 'requested' || booking.planStatus === 'rejected' || booking.planStatus == null)
    )
  }, [booking])

  const hasSchedulePlan = useMemo(
    () => Array.isArray(booking?.schedule) && booking.schedule.length > 0,
    [booking],
  )

  const paymentSummary = booking?.paymentSummary || null
  const paymentsList = useMemo(() => (Array.isArray(booking?.payments) ? booking.payments : []), [booking])
  const sessionsCount = paymentSummary?.sessionsCount || (hasSchedulePlan ? booking.schedule.length : 1)
  const isOfflinePlan = booking?.serviceType === 'home' && booking?.homePlanPaymentMode === 'offline'
  const isOnlinePayment = !isOfflinePlan
  const totalAmount = Number(
    paymentSummary?.totalAmount ?? booking?.totalAmount ?? booking?.payment?.amount ?? 0,
  )
  const totalPaid = Number(paymentSummary?.totalPaid ?? booking?.totalPaid ?? 0)
  const outstanding = Number(
    paymentSummary?.outstanding ?? Math.max(0, totalAmount - totalPaid),
  )
  const paidPercent = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0
  const milestoneStatus = paymentSummary?.milestoneStatus ?? null
  const showInstallments =
    booking?.planStatus === 'approved' || booking?.serviceType === 'online' || paymentsList.length > 0

  const showPlanPending = useMemo(() => {
    if (!booking) return false
    return booking.serviceType === 'home' && booking.planStatus === 'proposed'
  }, [booking])

  async function completeSession(bookingId) {
    setBusyId(bookingId)
    try {
      await api.post(`/physio/sessions/${bookingId}/complete`)
      Toast.show({ type: 'success', text1: 'Session marked complete' })
      await load()
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Failed' })
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
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Failed' })
    } finally {
      setBusySessionKey(null)
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
      })
      Toast.show({ type: 'success', text1: 'Collection recorded' })
      setRecordCollectionOpen(false)
      setRecordAmount('')
      setRecordNote('')
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

  const b = booking
  const busy = busyId === b._id
  const canStartNavigation = Boolean(b.userId?.coordinates || String(b.userId?.location || '').trim())
  const hasPhone = Boolean(b.userId?.phone)
  const scrollBottomPad = 14 + insets.bottom + 14

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
        bounces={false}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator
        {...(Platform.OS === 'android' ? { overScrollMode: 'never' } : {})}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >

        {/* ── Floating Hero Card ──────────────────────── */}
        <View style={styles.premiumHeroCard}>
          {/* Top row: Badges */}
          <View style={styles.premiumHeroTop}>
            <View style={styles.premiumHeroServiceBadge}>
              <Ionicons
                name={b.serviceType === 'online' ? 'videocam' : 'home'}
                size={11}
                color={colors.brand}
              />
              <Text style={styles.premiumHeroServiceText}>
                {b.serviceType === 'online' ? 'Online Session' : 'Home Visit'}
              </Text>
            </View>
            <View style={styles.premiumHeroStatusRow}>
              <View style={[styles.premiumStatusBadge, { backgroundColor: colors.brandSoft }]}>
                <Text style={[styles.premiumStatusText, { color: colors.brand }]}>{sessionStatusLabel(b)}</Text>
              </View>
              {b.rescheduled ? (
                <View style={[styles.premiumStatusBadge, { backgroundColor: colors.amber50 }]}>
                  <Text style={[styles.premiumStatusText, { color: colors.amber800 }]}>Rescheduled</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Main Content: Avatar + Name + Details */}
          <View style={styles.premiumHeroMiddle}>
            <View style={styles.premiumAvatarRing}>
              <View style={styles.premiumAvatarContainer}>
                <Text style={styles.premiumAvatarText}>{patientInitial(b.userId?.name)}</Text>
              </View>
            </View>
            <View style={styles.premiumPatientInfo}>
              <Text style={styles.premiumPatientName} numberOfLines={1}>{b.userId?.name ?? '—'}</Text>
              {b.userId?.phone ? (
                <Pressable onPress={() => callPhone(b.userId.phone)} style={styles.premiumPhoneRow}>
                  <Ionicons name="call-outline" size={12} color={colors.slate500} />
                  <Text style={styles.premiumPatientPhone}>{b.userId.phone}</Text>
                </Pressable>
              ) : null}
              {b.issue ? (
                <View style={styles.premiumComplaintBadge}>
                  <Ionicons name="medical-outline" size={11} color={colors.brand} />
                  <Text style={styles.premiumComplaintText} numberOfLines={1}>{b.issue}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Bottom Row: Date & Slot Display */}
          <View style={styles.premiumHeroDivider} />
          <View style={styles.premiumHeroDateRow}>
            <Ionicons name="time-outline" size={14} color={colors.slate600} />
            <Text style={styles.premiumHeroDateText}>{formatBookingDateAndSlot(b.date, b.timeSlot)}</Text>
          </View>

          {/* Action pill bar */}
          <View style={styles.premiumActionRow}>
            <Pressable
              style={[styles.premiumActionBtn, !hasPhone && styles.premiumActionBtnDisabled]}
              disabled={!hasPhone}
              onPress={() => callPhone(b.userId.phone)}
            >
              <Ionicons name="call" size={14} color={hasPhone ? colors.brand : colors.slate300} />
              <Text style={[styles.premiumActionBtnTxt, !hasPhone && styles.premiumActionBtnTxtDisabled]}>Call</Text>
            </Pressable>

            <Pressable
              style={[styles.premiumActionBtn, !hasPhone && styles.premiumActionBtnDisabled]}
              disabled={!hasPhone}
              onPress={() => openWhatsApp(b.userId.phone)}
            >
              <Ionicons name="logo-whatsapp" size={14} color={hasPhone ? '#16a34a' : colors.slate300} />
              <Text style={[styles.premiumActionBtnTxt, { color: hasPhone ? '#16a34a' : colors.slate300 }]}>WhatsApp</Text>
            </Pressable>

            {b.serviceType !== 'online' ? (
              <Pressable
                style={[styles.premiumActionBtn, !canStartNavigation && styles.premiumActionBtnDisabled]}
                disabled={!canStartNavigation}
                onPress={() => openGoogleMapsDestination({
                  coordinates: b.userId?.coordinates,
                  address: b.userId?.location,
                })}
              >
                <Ionicons name="navigate" size={14} color={canStartNavigation ? colors.brand : colors.slate300} />
                <Text style={[styles.premiumActionBtnTxt, !canStartNavigation && styles.premiumActionBtnTxtDisabled]}>Navigate</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ── Plan pending banner ────────────────────── */}
        {showPlanPending ? (
          <View style={styles.bannerMint}>
            <Ionicons name="time-outline" size={14} color={colors.teal800} />
            <Text style={styles.bannerMintTxt}>Awaiting patient approval on the proposed plan.</Text>
          </View>
        ) : null}

        {/* ── Tab bar ────────────────────────────────── */}
        <TabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          tabs={BASE_TABS}
          badges={{ finance: showCreatePlan }}
        />

        {/* ── Treatment Hub Tab ─────────────────────────── */}
        {activeTab === 'treatment' ? (
          <View style={styles.tabContentGap}>
            <SessionProgressPhysio booking={b} />


            <View style={styles.sectionCard}>
              <SectionTitle
                title="Session Timeline"
                hint="Tap any session card to expand clinical notes and actions."
                icon="calendar-outline"
              />
              {/* Milestone payment progress */}
              {milestoneStatus && milestoneStatus.length > 0 ? (
                <View style={styles.milestoneStrip}>
                  {milestoneStatus.map((m) => (
                    <View key={m.bySession} style={[styles.milestoneRow, m.met && styles.milestoneRowMet]}>
                      <Ionicons
                        name={m.met ? 'checkmark-circle' : 'ellipse-outline'}
                        size={13}
                        color={m.met ? colors.success : colors.amber800}
                      />
                      <Text style={[styles.milestoneTxt, m.met && styles.milestoneTxtMet]}>
                        {`Session ${m.bySession}: ${Math.round(m.requiredPct * 100)}% required`}
                        {m.met ? ' — met' : ' — pending'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Vertical stepper layout */}
              <View style={styles.stepperContainer}>
                {noteRows.map((r, index) => {
                  const sessionIdKey = String(r.sessionId || r.key)
                  const isExpanded = expandedSessionId === sessionIdKey
                  
                  const rowDone = r.status === 'completed'
                  const rowNoShow = r.status === 'no_show'
                  const isToday = r.date === todayYmd()
                  const isUpcoming = r.date > todayYmd()
                  
                  const showReschedule = Boolean(!rowDone && !rowNoShow)
                  const busyKey = String(r.sessionId || r.key)
                  const actBusy = String(busySessionKey || '') === busyKey
                  
                  // Compute blocked reason — only calendar gate remains; milestone
                  // enforcement is handled server-side on session complete
                  const blockedReason = isUpcoming
                    ? 'Available on the scheduled day'
                    : !paymentSummary
                    ? 'Payment must be secured before completion'
                    : ''
                    
                  const canActOnRow = !rowDone && !rowNoShow && !blockedReason
                  const showPhysioButtons = !rowDone && !rowNoShow

                  return (
                    <View key={r.key} style={styles.stepperRow}>
                      {/* Left: Stepper Line & Node */}
                      <View style={styles.stepperLeftCol}>
                        <View style={[
                          styles.stepperLine,
                          index === 0 && styles.stepperLineFirst,
                          index === noteRows.length - 1 && styles.stepperLineLast,
                          rowDone && styles.stepperLineDone
                        ]} />
                        <Pressable 
                          onPress={() => setExpandedSessionId(isExpanded ? null : sessionIdKey)}
                          style={[
                            styles.stepperNode,
                            rowDone && styles.stepperNodeDone,
                            rowNoShow && styles.stepperNodeNoShow,
                            isToday && !rowDone && !rowNoShow && styles.stepperNodeToday
                          ]}
                        >
                          {rowDone ? (
                            <Ionicons name="checkmark" size={12} color={colors.white} />
                          ) : rowNoShow ? (
                            <Ionicons name="close" size={12} color={colors.white} />
                          ) : isToday ? (
                            <View style={styles.stepperNodeTodayInner} />
                          ) : (
                            <Ionicons name="lock-closed" size={10} color={colors.slate400} />
                          )}
                        </Pressable>
                      </View>

                      {/* Right: Stepper Card Content */}
                      <Pressable 
                        onPress={() => setExpandedSessionId(isExpanded ? null : sessionIdKey)}
                        style={[
                          styles.stepperCard,
                          isExpanded && styles.stepperCardExpanded,
                          rowDone && styles.stepperCardDone,
                          rowNoShow && styles.stepperCardNoShow,
                          isToday && !rowDone && !rowNoShow && styles.stepperCardToday
                        ]}
                      >
                        <View style={styles.stepperCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.stepperSessionNum, rowDone && styles.stepperSessionNumDone]}>
                              Session #{r.n}
                            </Text>
                            <Text style={styles.stepperSessionDate}>
                              {formatBookingDateAndSlot(r.date, r.time)}
                            </Text>
                          </View>

                          <View style={styles.stepperCardHeaderRight}>
                            {/* Status badge */}
                            <View style={[
                              styles.stepperStatusBadge,
                              rowDone && styles.stepperStatusBadgeDone,
                              rowNoShow && styles.stepperStatusBadgeNoShow,
                              isToday && !rowDone && !rowNoShow && styles.stepperStatusBadgeToday
                            ]}>
                              <Text style={[
                                styles.stepperStatusText,
                                rowDone && styles.stepperStatusTextDone,
                                rowNoShow && styles.stepperStatusTextNoShow,
                                isToday && !rowDone && !rowNoShow && styles.stepperStatusTextToday
                              ]}>
                                {rowDone ? 'Done' : rowNoShow ? 'No-show' : isToday ? 'Today' : 'Scheduled'}
                              </Text>
                            </View>
                            {/* Expand/collapse chevron */}
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={14}
                              color={colors.slate400}
                            />
                          </View>
                        </View>

                        {rowNoShow && r.noShowReason ? (
                          <View style={styles.stepperNoShowBox}>
                            <Text style={styles.stepperNoShowTitle}>No-Show Registered</Text>
                            <Text style={styles.stepperNoShowReason}>Reason: {r.noShowReason}</Text>
                          </View>
                        ) : null}

                        {/* Collapsible Action Drawer */}
                        {isExpanded ? (
                          <View style={styles.stepperDrawer}>
                            {showPhysioButtons ? (
                              <>
                                {/* Lock / upcoming notice shown BEFORE action buttons */}
                                {!canActOnRow && blockedReason ? (
                                  <View style={[styles.lockBox, isUpcoming && styles.lockBoxUpcoming]}>
                                    <Ionicons
                                      name={isUpcoming ? 'time-outline' : 'lock-closed'}
                                      size={11}
                                      color={isUpcoming ? colors.slate600 : colors.slate500}
                                    />
                                    <Text style={[styles.lockText, isUpcoming && styles.lockTextUpcoming]}>
                                      {blockedReason}
                                    </Text>
                                  </View>
                                ) : null}

                                <View style={[styles.stepperDrawerContent, !canActOnRow && blockedReason ? { marginTop: 8 } : null]}>
                                  {/* Complete session is primary, full width (shown if not upcoming) */}
                                  {!isUpcoming ? (
                                    <Pressable
                                      style={[
                                        styles.stepperPrimaryBtn,
                                        (!canActOnRow || actBusy) && styles.stepperBtnDisabled
                                      ]}
                                      disabled={!canActOnRow || actBusy}
                                      onPress={() => {
                                        if (r.perSession) completeOneSession(r)
                                        else completeSession(b._id)
                                      }}
                                    >
                                      <Ionicons name="checkmark-circle-outline" size={14} color={colors.white} />
                                      <Text style={styles.stepperPrimaryBtnTxt}>
                                        {actBusy ? 'Saving...' : 'Mark Session Complete'}
                                      </Text>
                                    </Pressable>
                                  ) : null}

                                  {/* Reschedule & No-show are secondary, side-by-side */}
                                  <View style={styles.stepperSecondaryRow}>
                                    <Pressable
                                      style={[styles.stepperSecondaryBtn, styles.stepperReschedBtn]}
                                      onPress={() => openReschedule(r)}
                                    >
                                      <Ionicons name="calendar-outline" size={13} color={colors.brand} />
                                      <Text style={[styles.stepperSecondaryBtnTxt, { color: colors.brand }]}>Reschedule</Text>
                                    </Pressable>

                                    {!isUpcoming && r.perSession ? (
                                      <Pressable
                                        style={[
                                          styles.stepperSecondaryBtn,
                                          styles.stepperNoShowBtn,
                                          (!canActOnRow || actBusy) && styles.stepperBtnDisabled
                                        ]}
                                        disabled={!canActOnRow || actBusy}
                                        onPress={() => {
                                          setNoShowReason('')
                                          setNoShowRow(r)
                                        }}
                                      >
                                        <Ionicons name="close-circle-outline" size={13} color={colors.danger} />
                                        <Text style={[styles.stepperSecondaryBtnTxt, { color: colors.danger }]}>No-Show</Text>
                                      </Pressable>
                                    ) : null}
                                  </View>
                                </View>
                              </>
                            ) : null}

                            {/* Inline Note Editor */}
                            <View style={styles.timelineNoteDivider} />
                            <SessionNoteEditor row={r} onSaved={load} />
                          </View>
                        ) : (
                          /* Snippet preview if notes exist and collapsed */
                          r.notes?.text ? (
                            <View style={styles.noteSnippetWrap}>
                              <Ionicons name="document-text" size={11} color={colors.brand} />
                              <Text style={styles.noteSnippetText} numberOfLines={1}>{r.notes.text}</Text>
                            </View>
                          ) : null
                        )}
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Plan & Billing Tab ────────────────────────── */}
        {activeTab === 'finance' ? (
          <View style={styles.tabContentGap}>
            {/* Payment progress card */}
            <View style={styles.stripeProgressCard}>
              <View style={styles.stripeProgressHeader}>
                <View>
                  <Text style={styles.stripeProgressTitle}>
                    {isOnlinePayment ? 'Payment Progress' : 'Collection Progress'}
                  </Text>
                  <Text style={styles.stripeProgressSub}>
                    {isOnlinePayment
                      ? 'Online installment tracking dashboard'
                      : 'Offline collection tracking dashboard'}
                  </Text>
                </View>
                {outstanding > 0.009 ? (
                  <View style={[
                    styles.stripeOutstandingBadge,
                    isOnlinePayment && styles.stripeOutstandingBadgeOnline,
                  ]}>
                    <Text style={[
                      styles.stripeOutstandingBadgeTxt,
                      isOnlinePayment && styles.stripeOutstandingBadgeTxtOnline,
                    ]}>
                      ₹{outstanding.toFixed(2)} Outstanding
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Progress bar split */}
              <View style={styles.stripeSplitBar}>
                <View style={[styles.stripeSplitBarPaid, { width: `${paidPercent}%` }]} />
              </View>

              <View style={styles.stripeMetricsRow}>
                <View style={styles.stripeMetric}>
                  <View style={[styles.stripeMetricDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.stripeMetricLabel}>{isOnlinePayment ? 'Paid' : 'Collected'}</Text>
                  <Text style={styles.stripeMetricVal}>₹{totalPaid.toFixed(2)}</Text>
                </View>
                <View style={styles.stripeMetric}>
                  <View style={[styles.stripeMetricDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.stripeMetricLabel}>Outstanding</Text>
                  <Text style={styles.stripeMetricVal}>₹{outstanding.toFixed(2)}</Text>
                </View>
                <View style={styles.stripeMetric}>
                  <View style={[styles.stripeMetricDot, { backgroundColor: colors.slate400 }]} />
                  <Text style={styles.stripeMetricLabel}>Total Value</Text>
                  <Text style={styles.stripeMetricVal}>₹{totalAmount.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {b.serviceType === 'home' ? (
              showCreatePlan ? (
                <HomePlanFormPhysio booking={b} busy={busy} onSubmit={(payload) => createPlan(b._id, payload)} />
              ) : showPlanPending ? (
                <View style={styles.planPendingCard}>
                  <View style={styles.planPendingIconWrap}>
                    <Ionicons name="hourglass-outline" size={28} color={colors.warning} />
                  </View>
                  <Text style={styles.planPendingTitle}>Awaiting patient approval</Text>
                  <Text style={styles.planPendingBody}>
                    You submitted a plan with {b.sessions} session{b.sessions !== 1 ? 's' : ''} at ₹{b.amountPerSession}/session.
                    The patient will review and approve it.
                  </Text>
                  <View style={styles.planPendingKVs}>
                    <PlanKV label="Sessions" value={String(b.sessions ?? '—')} />
                    <PlanKV label="Fee/session" value={b.amountPerSession != null ? `₹${b.amountPerSession}` : '—'} />
                    {b.discountPercent != null ? <PlanKV label="Discount" value={`${b.discountPercent}%`} /> : null}
                    <PlanKV label="Total" value={paymentAmountLabel(b)} highlight />
                  </View>
                </View>
              ) : b.planStatus === 'approved' ? (
                <View style={styles.planApprovedCard}>
                  <View style={styles.planApprovedHead}>
                    <View style={styles.planApprovedIconWrap}>
                      <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planApprovedTitle}>Plan approved</Text>
                      <Text style={styles.planApprovedSub}>Patient accepted the plan. Sessions are active.</Text>
                    </View>
                  </View>
                  <View style={styles.planPendingKVs}>
                    <PlanKV label="Sessions" value={String(b.sessions ?? '—')} />
                    <PlanKV label="Fee/session" value={b.amountPerSession != null ? `₹${b.amountPerSession}` : '—'} />
                    {b.discountPercent != null ? <PlanKV label="Discount" value={`${b.discountPercent}%`} /> : null}
                    <PlanKV label="Mode" value={paymentModeLabel(b)} />
                    <PlanKV label="Total" value={paymentAmountLabel(b)} highlight />
                  </View>
                </View>
              ) : (
                <View style={styles.planNaCard}>
                  <Ionicons name="clipboard-outline" size={28} color={colors.slate300} />
                  <Text style={styles.planNaTxt}>No plan for this booking type.</Text>
                </View>
              )
            ) : null}

            {showInstallments ? (
              <InstallmentsPhysioCard
                title={isOfflinePlan ? 'Collections' : 'Installments'}
                subtitle={
                  isOfflinePlan
                    ? 'Record each cash/UPI hand-off.'
                    : 'Patient pays online per installment; each verified payment counts toward your payment milestones.'
                }
                summary={paymentSummary}
                payments={paymentsList}
                emptyMessage={isOfflinePlan ? 'No collections recorded yet.' : 'No online installments yet.'}
              >
                {isOfflinePlan && outstanding > 0.009 && b.planStatus === 'approved' ? (
                  <Pressable
                    style={styles.recordCollectionBtn}
                    onPress={() => {
                      const out = roundMoney2(Number(paymentSummary?.outstanding || 0))
                      const per = roundMoney2(Number(paymentSummary?.amountPerSession || 0))
                      const def = out <= 0 ? '' : per > 0 ? String(Math.min(per, out)) : String(out)
                      setRecordAmount(def)
                      setRecordNote('')
                      setRecordErr('')
                      setRecordCollectionOpen(true)
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={colors.white} />
                    <Text style={styles.recordCollectionBtnTxt}>Record collection</Text>
                  </Pressable>
                ) : null}
              </InstallmentsPhysioCard>
            ) : null}

            <View style={styles.sectionCard}>
              <SectionTitle title="Payment Details" hint="Financial parameters & transaction states." icon="card-outline" />
              <KV k="Sessions Count" v={b.sessions != null ? String(b.sessions) : '—'} />
              <KV k="Price per session" v={b.amountPerSession != null ? `₹${b.amountPerSession}` : '—'} />
              {b.discountPercent != null && b.discountPercent > 0 ? (
                <KV k="Discount" v={`${b.discountPercent}%`} />
              ) : null}
              {Number(b.distanceSurchargeAmount || 0) > 0 ? (
                <KV k="Distance surcharge" v={`₹${Number(b.distanceSurchargeAmount).toFixed(2)}`} />
              ) : null}
              <KV k="Total Plan Value" v={paymentAmountLabel(b)} bold highlight />
              <KV k="Payment Mode" v={paymentModeLabel(b)} cap bold highlight />
              <KV
                k="Outstanding Balance"
                v={`₹${outstanding.toFixed(2)}`}
                bold
                highlight
                highlightColor={outstanding > 0 ? colors.warningBg : colors.successBg}
                last
              />
              {b.offlinePaymentRejectReason && b.payment?.status === 'pending' ? (
                <View style={styles.warnBox}>
                  <Text style={styles.warnTitle}>Admin note</Text>
                  <Text style={styles.warnBody}>{b.offlinePaymentRejectReason}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── No-show modal ──────────────────────────── */}
        <Modal transparent visible={Boolean(noShowRow)} animationType="fade">
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => { setNoShowRow(null); setNoShowReason('') }} />
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                <View style={styles.modalIconWrap}>
                  <Ionicons name="person-remove-outline" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Mark no-show</Text>
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
                placeholder="Briefly describe the situation…"
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
          </View>
        </Modal>

        {/* ── Record collection modal ────────────────── */}
        <Modal transparent visible={recordCollectionOpen} animationType="slide">
          <View style={styles.modalRoot}>
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
              <Text style={styles.inputLabel}>Amount (₹)</Text>
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
          </View>
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

const KV = memo(function KV({ k, v, cap, bold, last, highlight, highlightColor }) {
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast, highlight && styles.kvRowHighlight]}>
      <Text style={styles.kvK}>{k}</Text>
      {highlight ? (
        <View style={[styles.kvPill, { backgroundColor: highlightColor || colors.brandSoft }]}>
          <Text style={[styles.kvPillTxt, { color: bold ? (highlightColor === colors.dangerBg ? colors.danger : colors.brand) : colors.textPrimary }]}>{v}</Text>
        </View>
      ) : (
        <Text style={[styles.kvV, bold && styles.kvBold, cap && styles.kvCap]}>{v}</Text>
      )}
    </View>
  )
})

const PlanKV = memo(function PlanKV({ label, value, highlight }) {
  return (
    <View style={styles.planKVRow}>
      <Text style={styles.planKVLabel}>{label}</Text>
      <Text style={[styles.planKVValue, highlight && styles.planKVValueHL]}>{value}</Text>
    </View>
  )
})

const styles = StyleSheet.create({
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
    ...bookingCardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 14,
    marginTop: 8,
  },
  premiumHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  premiumHeroServiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
  },
  premiumHeroServiceText: {
    fontFamily: font.bold,
    fontSize: 9,
    color: colors.brand,
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
  premiumAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 148, 136, 0.04)',
  },
  premiumAvatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 1,
  },
  premiumAvatarText: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.brand,
  },
  premiumPatientInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  premiumPatientName: {
    fontFamily: font.bold,
    fontSize: type.base,
    color: colors.textPrimary,
  },
  premiumPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  premiumPatientPhone: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.slate600,
  },
  premiumComplaintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    marginTop: 2,
  },
  premiumComplaintText: {
    fontFamily: font.medium,
    fontSize: 10,
    color: colors.slate700,
  },
  premiumHeroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginVertical: 10,
  },
  premiumHeroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  premiumHeroDateText: {
    fontFamily: font.semiBold,
    fontSize: type.sm,
    color: colors.slate800,
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
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.15)',
    backgroundColor: colors.white,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  premiumActionBtnDisabled: {
    opacity: 0.45,
  },
  premiumActionBtnTxt: {
    fontFamily: font.bold,
    fontSize: type.xs,
    color: colors.brand,
  },
  premiumActionBtnTxtDisabled: {
    color: colors.slate300,
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
    marginTop: 10,
    marginBottom: 10,
  },
  segmentedTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segmentedTabActive: {
    borderBottomColor: colors.brand,
  },
  segmentedTabTxt: {
    fontFamily: font.semiBold,
    fontSize: type.xs,
    color: colors.slate500,
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
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  sectionTitleBody: { flex: 1, minWidth: 0 },
  sectionTitleRight: { flexShrink: 0, marginTop: 2 },
  h2: { fontFamily: font.bold, fontSize: type.base, color: colors.textPrimary },
  sectionHint: { marginTop: 3, fontFamily: font.regular, fontSize: type.xs, color: colors.textSecondary, lineHeight: 16 },

  // ── Section cards ────────────────────────────────
  sectionCard: {
    ...bookingCardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
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
    gap: 6,
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(240,253,250,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.15)',
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 2,
  },
  milestoneRowMet: {},
  milestoneTxt: { fontFamily: font.medium, fontSize: type.xs, color: colors.amber800 },
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
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(241, 245, 249, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
  },
  noteEditorLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  noteEditorLabel: {
    fontFamily: font.semiBold,
    fontSize: type.xs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  noteEditorTs: { marginTop: 6, fontFamily: font.regular, fontSize: 9.5, color: colors.textTertiary },
  saveNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.brand,
    flexShrink: 0,
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
    ...bookingCardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: 16,
  },
  planPendingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  planPendingTitle: {
    fontFamily: font.bold,
    fontSize: type.lg,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  planPendingBody: {
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  planPendingKVs: {
    borderRadius: 12,
    ...innerPanelSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    fontSize: type.base,
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
    width: 26,
    alignItems: 'center',
    position: 'relative',
  },
  stepperLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 12,
    width: 2,
    backgroundColor: colors.slate200,
  },
  stepperLineFirst: {
    top: 13,
  },
  stepperLineLast: {
    bottom: 'auto',
    height: 13,
  },
  stepperLineDone: {
    backgroundColor: colors.success,
  },
  stepperNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepperNodeDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepperNodeNoShow: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  stepperNodeToday: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
    borderWidth: 1.5,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  stepperNodeTodayInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },
  stepperCard: {
    flex: 1,
    marginLeft: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...bookingCardSurface,
    padding: 12,
    shadowOpacity: Platform.OS === 'web' ? undefined : 0.04,
    elevation: 1,
  },
  stepperCardExpanded: {
    borderColor: colors.brand + '45',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  stepperCardDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
    borderColor: 'rgba(16, 185, 129, 0.12)',
  },
  stepperCardNoShow: {
    backgroundColor: 'rgba(239, 68, 68, 0.02)',
    borderColor: 'rgba(239, 68, 68, 0.12)',
  },
  stepperCardToday: {
    borderColor: 'rgba(13, 148, 136, 0.25)',
    backgroundColor: 'rgba(13, 148, 136, 0.02)',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
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
    fontSize: type.sm,
    color: colors.textPrimary,
  },
  stepperSessionNumDone: {
    color: colors.success,
  },
  stepperSessionDate: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.slate500,
    marginTop: 2,
  },
  stepperStatusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.slate100,
  },
  stepperStatusBadgeDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  stepperStatusBadgeNoShow: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  stepperStatusBadgeToday: {
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
  },
  stepperStatusText: {
    fontFamily: font.bold,
    fontSize: 8,
    color: colors.slate600,
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
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.white,
  },
  stepperSecondaryBtnTxt: {
    fontFamily: font.semiBold,
    fontSize: type.xs,
    color: colors.slate800,
  },
  stepperReschedBtn: {
    borderColor: 'rgba(13, 148, 136, 0.15)',
    backgroundColor: 'rgba(13, 148, 136, 0.02)',
  },
  stepperNoShowBtn: {
    borderColor: 'rgba(239, 68, 68, 0.15)',
    backgroundColor: 'rgba(239, 68, 68, 0.02)',
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
    ...bookingCardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
  },
  stripeProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stripeProgressTitle: {
    fontFamily: font.bold,
    fontSize: type.sm,
    color: colors.textPrimary,
  },
  stripeProgressSub: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.slate500,
    marginTop: 2,
  },
  stripeOutstandingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  stripeOutstandingBadgeOnline: {
    backgroundColor: colors.teal50,
    borderColor: 'rgba(13, 148, 136, 0.2)',
  },
  stripeOutstandingBadgeTxt: {
    fontFamily: font.bold,
    fontSize: 10,
    color: colors.warning,
  },
  stripeOutstandingBadgeTxtOnline: {
    color: colors.brand,
  },
  stripeSplitBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.slate100,
    overflow: 'hidden',
    marginBottom: 8,
  },
  stripeSplitBarPaid: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  stripeMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...innerPanelSurface,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  stripeMetric: {
    alignItems: 'flex-start',
  },
  stripeMetricDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  stripeMetricLabel: {
    fontFamily: font.regular,
    fontSize: 10,
    color: colors.slate500,
  },
  stripeMetricVal: {
    fontFamily: font.bold,
    fontSize: type.xs,
    color: colors.textPrimary,
    marginTop: 2,
  },
})
