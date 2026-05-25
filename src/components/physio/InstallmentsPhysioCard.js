import { Platform, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme/colors'
import { font, type } from '../../theme/typography'

const cardSurface = Platform.select({
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

function formatRupees(n) {
  const v = Number(n || 0)
  return `₹${v.toFixed(2)}`
}

function formatDt(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABEL = {
  pending: 'Pending',
  paid: 'Paid',
  collected: 'Collected',
  verified: 'Verified',
  rejected: 'Rejected',
  refunded: 'Refunded',
}

const STATUS_STYLES = {
  pending: { bg: colors.warningBg, border: colors.warningBorder, text: colors.warning, icon: 'time-outline' },
  paid: { bg: colors.successBg, border: 'rgba(16, 185, 129, 0.15)', text: colors.success, icon: 'checkmark-circle-outline' },
  collected: { bg: colors.brandSoft, border: 'rgba(13, 148, 136, 0.15)', text: colors.brand, icon: 'cash-outline' },
  verified: { bg: colors.brandSoft, border: 'rgba(13, 148, 136, 0.15)', text: colors.brand, icon: 'shield-checkmark-outline' },
  rejected: { bg: colors.dangerBg, border: colors.dangerBorder, text: colors.danger, icon: 'close-circle-outline' },
  refunded: { bg: colors.slate100, border: colors.slate200, text: colors.slate500, icon: 'refresh-outline' },
}

export default function InstallmentsPhysioCard({
  title,
  subtitle,
  summary,
  payments,
  emptyMessage,
  children,
}) {
  const s = summary || {}
  const totalAmount = Number(s.totalAmount || 0)
  const totalPaid = Number(s.totalPaid || 0)
  const totalCollected = Number(s.totalCollected || 0)
  const effectivePaid = totalPaid + totalCollected
  const outstanding = Math.max(0, totalAmount - effectivePaid)
  const sessionsCount = Number(s.sessionsCount || 0)
  const milestoneStatus = Array.isArray(s.milestoneStatus) ? s.milestoneStatus : null
  const paidPct = totalAmount > 0 ? effectivePaid / totalAmount : 0

  // Next unmet milestone
  const nextMilestone = milestoneStatus
    ? milestoneStatus.find((m) => !m.met)
    : null
  const allMet = milestoneStatus ? milestoneStatus.every((m) => m.met) : false

  const rows = Array.isArray(payments)
    ? [...payments].sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
    : []

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h2}>{title}</Text>
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        </View>
        {children ? <View style={{ flexShrink: 0 }}>{children}</View> : null}
      </View>
      <View style={styles.summaryRow}>
        <View style={styles.sumBox}>
          <Text style={styles.sumL}>Paid</Text>
          <Text style={styles.sumV}>
            {formatRupees(effectivePaid)}{' '}
            <Text style={styles.sumMuted}>of {formatRupees(totalAmount)}</Text>
          </Text>
        </View>
        <View style={styles.sumBox}>
          <Text style={styles.sumL}>Outstanding</Text>
          <Text style={styles.sumV}>{formatRupees(outstanding)}</Text>
        </View>
        <View style={[styles.sumBox, allMet && styles.sumBoxMet]}>
          <Text style={styles.sumL}>Payment milestone</Text>
          {milestoneStatus ? (
            allMet ? (
              <Text style={[styles.sumV, styles.sumVMet]}>All met</Text>
            ) : (
              <Text style={styles.sumV}>
                Session {nextMilestone.bySession}{' '}
                <Text style={styles.sumMuted}>— {Math.round(nextMilestone.requiredPct * 100)}% req.</Text>
              </Text>
            )
          ) : (
            <Text style={styles.sumV}>
              {Math.round(paidPct * 100)}%{' '}
              <Text style={styles.sumMuted}>paid</Text>
            </Text>
          )}
        </View>
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>{emptyMessage}</Text>
        </View>
      ) : (
        rows.map((p) => {
          const st = STATUS_STYLES[p.status] || {
            bg: colors.slate100,
            border: colors.slate200,
            text: colors.slate700,
            icon: 'ellipse-outline',
          }
          // Determine transaction icon by payment mode
          const modeLower = String(p.mode || '').toLowerCase()
          let modeIcon = 'card-outline'
          if (modeLower.includes('cash')) {
            modeIcon = 'cash-outline'
          } else if (modeLower.includes('upi') || modeLower.includes('gpay') || modeLower.includes('phonepe') || modeLower.includes('phone portrait')) {
            modeIcon = 'phone-portrait-outline'
          } else if (modeLower.includes('net') || modeLower.includes('bank') || modeLower.includes('neft')) {
            modeIcon = 'business-outline'
          }

          return (
            <View key={p._id} style={styles.line}>
              {/* Left: Mode Badge */}
              <View style={[styles.lineBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                <Ionicons name={modeIcon} size={12} color={st.text} />
              </View>

              {/* Center: Details */}
              <View style={styles.lineCenter}>
                <Text style={styles.lineMode}>{p.mode ? String(p.mode) : '—'}</Text>
                <Text style={styles.lineWhen}>{formatDt(p.verifiedAt || p.collectedAt || p.createdAt)}</Text>
                {p.note ? <Text style={styles.lineNote}>{p.note}</Text> : null}
                {p.status === 'rejected' && p.rejectReason ? (
                  <View style={styles.rejectBox}>
                    <Ionicons name="warning-outline" size={10} color={colors.danger} />
                    <Text style={styles.rejectText}>{p.rejectReason}</Text>
                  </View>
                ) : null}
              </View>

              {/* Right: Amount & Status Badge */}
              <View style={styles.lineRight}>
                <Text style={styles.lineAmt}>{formatRupees(p.amount)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                  <Ionicons name={st.icon} size={9} color={st.text} style={{ marginRight: 3 }} />
                  <Text style={[styles.statusBadgeTxt, { color: st.text }]}>
                    {STATUS_LABEL[p.status] || p.status}
                  </Text>
                </View>
              </View>
            </View>
          )
        })
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 16,
  },
  headRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  h2: { fontFamily: font.bold, fontSize: type.base, color: colors.slate900 },
  sub: { marginTop: 4, fontFamily: font.regular, fontSize: type.xs, color: colors.slate500, lineHeight: 15 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sumBox: {
    flexGrow: 1,
    minWidth: '28%',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...innerPanelSurface,
  },
  sumBoxMet: { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
  sumL: { fontFamily: font.bold, fontSize: 9, color: colors.slate500, textTransform: 'uppercase', letterSpacing: 0.5 },
  sumV: { marginTop: 6, fontFamily: font.extraBold, fontSize: type.base, color: colors.slate900 },
  sumVMet: { color: '#15803d' },
  sumMuted: { fontFamily: font.regular, fontSize: type.xs, color: colors.slate500 },
  empty: {
    marginTop: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    ...innerPanelSurface,
  },
  emptyTxt: { fontFamily: font.medium, fontSize: type.xs, color: colors.slate500 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  lineBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineCenter: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  lineMode: {
    fontFamily: font.bold,
    fontSize: type.xs,
    color: colors.slate800,
    textTransform: 'capitalize',
  },
  lineWhen: {
    fontFamily: font.medium,
    fontSize: 9.5,
    color: colors.slate500,
  },
  lineNote: {
    fontFamily: font.regular,
    fontSize: 10,
    color: colors.slate500,
    marginTop: 2,
    fontStyle: 'italic',
  },
  rejectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  rejectText: {
    fontFamily: font.medium,
    fontSize: 9.5,
    color: colors.danger,
    flex: 1,
  },
  lineRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  lineAmt: {
    fontFamily: font.extraBold,
    fontSize: type.sm,
    color: colors.slate900,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeTxt: {
    fontFamily: font.bold,
    fontSize: 8,
    textTransform: 'uppercase',
  },
})
