import { memo, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { api } from '../../api/client'
import {
  EMPTY_SESSION_PROGRESS,
  HOME_EXERCISES_OPTIONS,
  MOBILITY_OPTIONS,
  PAIN_MEDS_OPTIONS,
  SLEEP_OPTIONS,
  VS_LAST_VISIT_OPTIONS,
  validateSessionProgress,
} from '../../constants/assessmentForm'
import { colors } from '../../theme/colors'
import { font, type, leading } from '../../theme/typography'
import { formatBookingDateAndSlot } from '../../utils/date'
import { getPainBgColor, getPainColor, getPainLabel } from '../../utils/painScale'

function formatUpdated(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return null
  }
}

function FieldLabel({ label, hint, required }) {
  return (
    <>
      <Text style={styles.label}>
        {label.toUpperCase()}
        {required ? <Text style={{ color: colors.red500 }}> *</Text> : null}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  )
}

/** 0–10 buttons — mirrors web ProgressFieldControls ScalePicker. */
function ScalePicker({ label, hint, value, onChange, required }) {
  const has = value != null && Number.isFinite(Number(value))
  return (
    <View>
      <FieldLabel label={label} hint={hint} required={required} />
      <View style={styles.scaleRow}>
        {Array.from({ length: 11 }, (_, i) => {
          const selected = Number(value) === i && has
          return (
            <Pressable
              key={i}
              onPress={() => onChange(i)}
              style={[styles.scaleBtn, selected && { backgroundColor: getPainColor(i), borderColor: getPainColor(i) }]}
            >
              <Text style={[styles.scaleTxt, selected && { color: colors.white }]}>{i}</Text>
            </Pressable>
          )
        })}
      </View>
      {has ? (
        <View style={styles.scaleResult}>
          <Text style={[styles.scaleResultTxt, { color: getPainColor(Number(value)) }]}>{getPainLabel(Number(value))}</Text>
          <Text style={[styles.scaleResultPill, { backgroundColor: getPainBgColor(Number(value)) }]}>{value}/10</Text>
        </View>
      ) : null}
    </View>
  )
}

/** Single-select pills — mirrors web ChipGroup (tap again to clear). */
function ChipGroup({ label, options, value, onChange }) {
  return (
    <View>
      <FieldLabel label={label} />
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const on = value === opt.value
          return (
            <Pressable key={opt.value} onPress={() => onChange(on ? null : opt.value)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipTxt, on && { color: colors.white }]}>{opt.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Native port of web components/bookings/SessionNotesModal (per-visit progress scores). */
function SessionProgressModal({ open, row, booking, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_SESSION_PROGRESS })
  const [busy, setBusy] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [textFocused, setTextFocused] = useState(false)

  useEffect(() => {
    if (!open || !row) return
    const n = row.notes || {}
    let extra = n.text || ''
    if (n.painNow != null && extra) {
      const match = extra.match(/(?:^|\n)Notes: ([\s\S]+)$/)
      extra = match ? match[1] : ''
    }
    setForm({
      ...EMPTY_SESSION_PROGRESS,
      painNow: n.painNow ?? null,
      functionNow: n.functionNow ?? null,
      painOnMovement: n.painOnMovement ?? null,
      sleep: n.sleep || null,
      mobility: n.mobility || null,
      vsLastVisit: n.vsLastVisit || null,
      homeExercises: n.homeExercises || null,
      painMeds: n.painMeds || null,
      text: extra,
    })
    setUpdatedAt(n.updatedAt || null)
  }, [open, row])

  const baseline = booking?.assessmentData
  const baselineLine = useMemo(() => {
    if (!baseline) return null
    const parts = []
    if (baseline.painNow != null) parts.push(`Pain ${baseline.painNow}`)
    if (baseline.functionNow != null) parts.push(`Function ${baseline.functionNow}`)
    if (baseline.areas?.length) parts.push(baseline.areas.slice(0, 3).join(', '))
    return parts.length ? parts.join(' · ') : null
  }, [baseline])

  if (!row || !booking) return null

  const hasProgress = row.notes?.painNow != null || Boolean(row.notes?.text?.trim())
  const sessionLabel = row.complimentary ? row.label || 'Assessment' : row.n != null ? `Session #${row.n}` : 'Session'
  const updatedLabel = formatUpdated(updatedAt)
  const validationError = validateSessionProgress(form)
  const patch = (partial) => setForm((prev) => ({ ...prev, ...partial }))

  async function save() {
    if (validationError) {
      Toast.show({ type: 'error', text1: validationError })
      return
    }
    const targetId = row.sessionId || booking._id
    if (!targetId) {
      Toast.show({ type: 'error', text1: 'Cannot save: session reference missing.' })
      return
    }
    setBusy(true)
    try {
      const res = await api.patch(`/sessions/${targetId}/notes`, {
        painNow: form.painNow,
        functionNow: form.functionNow,
        painOnMovement: form.painOnMovement,
        sleep: form.sleep,
        mobility: form.mobility,
        vsLastVisit: form.vsLastVisit,
        homeExercises: form.homeExercises,
        painMeds: form.painMeds,
        text: form.text,
      })
      const n = res.data?.notes
      if (n?.updatedAt) setUpdatedAt(n.updatedAt)
      Toast.show({ type: 'success', text1: 'Session progress saved' })
      onSaved?.()
      onClose?.()
    } catch (e) {
      Toast.show({ type: 'error', text1: e.response?.data?.message || 'Could not save notes' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{hasProgress ? 'Update session progress' : 'Session progress'}</Text>
          <Text style={styles.desc}>{`${sessionLabel} · ${formatBookingDateAndSlot(row.date, row.time)}`}</Text>
          <Text style={styles.intro}>Update scores each visit so we can track recovery. Patient can view after you save.</Text>
          {baselineLine ? (
            <Text style={styles.baseline}>
              <Text style={{ fontFamily: font.semiBold }}>Baseline · </Text>
              {baselineLine}
            </Text>
          ) : null}

          <ScrollView style={styles.body} contentContainerStyle={{ gap: 16, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
            <ScalePicker label="Pain now" hint="0 = no pain · 10 = worst" value={form.painNow} onChange={(painNow) => patch({ painNow })} required />
            <ScalePicker
              label="Function / daily activity"
              hint="0 = cannot do daily tasks · 10 = normal"
              value={form.functionNow}
              onChange={(functionNow) => patch({ functionNow })}
              required
            />
            <ScalePicker label="Pain on movement" value={form.painOnMovement} onChange={(painOnMovement) => patch({ painOnMovement })} />
            <ChipGroup label="Sleep last night" options={SLEEP_OPTIONS} value={form.sleep} onChange={(sleep) => patch({ sleep })} />
            <ChipGroup label="Walking / mobility" options={MOBILITY_OPTIONS} value={form.mobility} onChange={(mobility) => patch({ mobility })} />
            <ChipGroup label="Compared to last visit" options={VS_LAST_VISIT_OPTIONS} value={form.vsLastVisit} onChange={(vsLastVisit) => patch({ vsLastVisit })} />
            <ChipGroup label="Home exercises done" options={HOME_EXERCISES_OPTIONS} value={form.homeExercises} onChange={(homeExercises) => patch({ homeExercises })} />
            <ChipGroup label="Pain meds today" options={PAIN_MEDS_OPTIONS} value={form.painMeds} onChange={(painMeds) => patch({ painMeds })} />
            <View>
              <Text style={styles.label}>
                EXTRA NOTES <Text style={{ fontFamily: font.regular, color: colors.slate400 }}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.ta, textFocused && styles.taFocused]}
                value={form.text}
                onChangeText={(text) => patch({ text })}
                onFocus={() => setTextFocused(true)}
                onBlur={() => setTextFocused(false)}
                multiline
                placeholder="Interventions, exercises given, follow-up…"
                placeholderTextColor={colors.slate400}
              />
            </View>
          </ScrollView>

          <Text style={styles.updated}>{updatedLabel ? `Last updated ${updatedLabel}` : 'Not saved yet'}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} disabled={busy} onPress={onClose}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, (busy || validationError) && { opacity: 0.5 }]} disabled={busy || Boolean(validationError)} onPress={save}>
              {busy ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.saveTxt}>Save progress</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default memo(SessionProgressModal)

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 16 },
  card: { maxHeight: '92%', borderRadius: 16, backgroundColor: colors.white, padding: 18 },
  title: { fontFamily: font.bold, fontSize: type.xl, lineHeight: leading.xl, color: colors.slate900 },
  desc: { marginTop: 2, fontFamily: font.regular, fontSize: type.base, color: colors.slate600 },
  intro: { marginTop: 10, fontFamily: font.regular, fontSize: type.xs, lineHeight: leading.xs, color: colors.slate500 },
  baseline: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    backgroundColor: colors.teal50,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.teal800,
    overflow: 'hidden',
  },
  body: { marginTop: 14, flexGrow: 0 },
  label: { fontFamily: font.semiBold, fontSize: type.sm, letterSpacing: 0.4, color: colors.slate500 },
  hint: { marginTop: 2, fontFamily: font.regular, fontSize: type.xs, color: colors.slate500 },
  scaleRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scaleBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleTxt: { fontFamily: font.bold, fontSize: type.xs, color: colors.slate700 },
  scaleResult: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scaleResultTxt: { fontFamily: font.medium, fontSize: type.xs },
  scaleResultPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, fontFamily: font.medium, fontSize: 10, color: colors.slate700, overflow: 'hidden' },
  chipRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipTxt: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.slate700 },
  ta: {
    marginTop: 8,
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.slate50,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font.regular,
    fontSize: type.base,
    color: colors.slate900,
    textAlignVertical: 'top',
  },
  taFocused: { borderColor: '#2dd4bf', backgroundColor: colors.white },
  updated: { marginTop: 12, fontFamily: font.regular, fontSize: type.xs, color: colors.slate400 },
  actions: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { borderRadius: 12, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 10 },
  cancelTxt: { fontFamily: font.semiBold, fontSize: type.base, color: colors.slate700 },
  saveBtn: { minWidth: 120, alignItems: 'center', borderRadius: 12, backgroundColor: colors.brand, paddingHorizontal: 16, paddingVertical: 10 },
  saveTxt: { fontFamily: font.semiBold, fontSize: type.base, color: colors.white },
})
