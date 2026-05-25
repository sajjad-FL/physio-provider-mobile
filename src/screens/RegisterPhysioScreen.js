import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { api, postFormData } from '../api/client'
import AppHeader from '../components/AppHeader'
import MapPickerModal from '../components/booking/MapPickerModal'
import EarningsEstimatorWidget from '../components/EarningsEstimatorWidget'
import GovtIdDocumentSection from '../components/physio/GovtIdDocumentSection'
import MultiInternshipDocRow from '../components/physio/MultiInternshipDocRow'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import DropdownField from '../components/ui/DropdownField'
import Input from '../components/ui/Input'
import PhysioNameInput from '../components/ui/PhysioNameInput'
import { ID_PROOF_TYPE_OPTIONS } from '../constants/idProofTypes'
import { PHYSIO_DEGREE_OPTIONS } from '../constants/physioQualification'
import { colors } from '../theme/colors'
import { r } from '../theme/radius'
import { font, type, leading } from '../theme/typography'
import { normalizeIndianPhone, validateIndianMobile } from '../utils/phoneIndia'
import {
  validateAvatarFile,
  validateBasicSection,
  validateDocumentsStep,
  validateFileAsset,
  validatePracticeSection,
  validateQualificationSection,
  validateRegistrationAccount,
} from '../utils/onboardingValidation'
import { extractApiFieldErrors, normalizeRegistrationApiErrors } from '../utils/apiFieldErrors'
import { appendFormDataFile, appendFormDataFiles, isUploadableDocument, normalizePickedDocument } from '../utils/physioFormMultipart'
import { pickMultipleDocuments } from '../utils/physioDocumentPicker'
import { formatPhysioDisplayName } from '../utils/physioDisplayName'
import { DOB_PICKER_MIN, defaultDobPickerDate } from '../utils/date'
import { reverseGeocodeToAddress } from '../utils/geocode'
import {
  hasVisibleFieldErrors,
  validateRegistrationLiveField,
} from '../utils/registrationLiveValidation'

const STEPS = [
  { n: 1, title: 'Account & basic' },
  { n: 2, title: 'Qualification' },
  { n: 3, title: 'Practice' },
  { n: 4, title: 'Documents' },
  { n: 5, title: 'Review' },
]

const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

/** Inline dropdown — omit empty placeholder row used by legacy modal list. */
const GENDER_DROPDOWN_OPTIONS = GENDER_OPTIONS.filter((o) => o.value !== '')

const SERVICE_TYPE_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'home', label: 'Home visit' },
  { value: 'both', label: 'Both' },
]

const DEGREE_DROPDOWN_OPTIONS = PHYSIO_DEGREE_OPTIONS.map((d) => ({ value: d, label: d }))

function formatYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDobToDate(ymd) {
  const s = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, mo, d] = s.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

function ErrorBanner({ formError, fieldErrors }) {
  const entries = Object.entries(fieldErrors || {}).filter(([, v]) => Boolean(v))
  if (!formError && entries.length === 0) return null
  return (
    <View style={styles.errorBanner}>
      {formError ? <Text style={styles.errorBannerTitle}>{formError}</Text> : null}
      {entries.map(([k, v]) => (
        <Text key={k} style={styles.errorBannerItem}>
          • {v}
        </Text>
      ))}
    </View>
  )
}

function DocRow({ title, subtitle, asset, error, onPick, isOptional = false }) {
  const mime = String(asset?.mimeType || '').toLowerCase()
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(String(asset?.name || ''))
  const displayName = asset?.uri
    ? asset.name && String(asset.name).trim()
      ? asset.name
      : 'Selected file'
    : null

  return (
    <Pressable 
      onPress={onPick}
      style={({ pressed }) => [
        styles.docRowPremium,
        asset?.uri ? styles.docRowUploaded : styles.docRowEmpty,
        error ? styles.docRowError : null,
        pressed && styles.docRowPressed
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Pick file for ${title}`}
    >
      <View style={styles.docRowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.docTitlePremium}>{title}</Text>
          {subtitle ? <Text style={styles.docSubPremium}>{subtitle}</Text> : null}
        </View>
        
        {/* Status Badge */}
        {asset?.uri ? (
          <View style={styles.badgeSuccess}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.badgeSuccessText}>Ready</Text>
          </View>
        ) : isOptional ? (
          <View style={styles.badgeOptional}>
            <Text style={styles.badgeOptionalText}>Optional</Text>
          </View>
        ) : (
          <View style={styles.badgeRequired}>
            <Text style={styles.badgeRequiredText}>Required</Text>
          </View>
        )}
      </View>

      {asset?.uri ? (
        <View style={styles.docPreviewContainer}>
          {isImage ? (
            <Image source={{ uri: asset.uri }} style={styles.docThumbPremium} accessibilityIgnoresInvertColors />
          ) : (
            <View style={styles.docIconWrapPremium}>
              <Ionicons name={isPdf ? 'document-text' : 'document-attach'} size={24} color={colors.brand} />
            </View>
          )}
          <View style={styles.docDetailsCol}>
            <Text style={styles.docNamePremium} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.tapToReplace}>Tap anywhere to replace file</Text>
          </View>
        </View>
      ) : (
        <View style={styles.uploadPromptRow}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.brand} />
          <Text style={styles.uploadPromptText}>Tap to choose a file</Text>
        </View>
      )}
      
      {error ? <Text style={styles.fieldErr}>{error}</Text> : null}
    </Pressable>
  )
}

export default function RegisterPhysioScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  const fadeAnim = useRef(new Animated.Value(1)).current
  const progressAnim = useRef(new Animated.Value(0.2)).current

  useEffect(() => {
    fadeAnim.setValue(0)
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [step])

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step / 5,
      duration: 300,
      useNativeDriver: false,
    }).start()
  }, [step, progressAnim])

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [location, setLocation] = useState('')
  const [locationLat, setLocationLat] = useState(null)
  const [locationLng, setLocationLng] = useState(null)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [mapPin, setMapPin] = useState({ lat: 26.14, lng: 91.74 })
  const [locating, setLocating] = useState(false)
  const [locationLookupBusy, setLocationLookupBusy] = useState(false)

  const [avatarAsset, setAvatarAsset] = useState(null)

  const [degree, setDegree] = useState('')
  const [university, setUniversity] = useState('')
  const [year, setYear] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')

  const [experience, setExperience] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [serviceType, setServiceType] = useState('both')
  const [areas, setAreas] = useState('')

  const [fCertificate, setFCertificate] = useState(null)
  const [fIdProof, setFIdProof] = useState(null)
  const [fRegCert, setFRegCert] = useState(null)
  const [fSelfie, setFSelfie] = useState(null)
  const [fInternships, setFInternships] = useState([])
  const [idProofType, setIdProofType] = useState('')
  const [qualificationAgreed, setQualificationAgreed] = useState(false)

  const [ndaPolicy, setNdaPolicy] = useState({
    requireQualificationDeclaration: true,
    declarationText: '',
  })

  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')

  const [keyboardInset, setKeyboardInset] = useState(0)
  const [dobPickerVisible, setDobPickerVisible] = useState(false)
  const maxDob = useMemo(() => new Date(), [])
  const [pickerTempDate, setPickerTempDate] = useState(() => defaultDobPickerDate(new Date()))

  const clearErrors = useCallback(() => {
    setFieldErrors({})
    setFormError('')
  }, [])

  const patchField = useCallback(
    (fieldName, value, extra = {}) => {
      const err = validateRegistrationLiveField(fieldName, value, {
        locationLat,
        locationLng,
        ...extra,
      })
      setFieldErrors((prev) => {
        const next = { ...prev, [fieldName]: err }
        if (!err) delete next[fieldName]
        if (!hasVisibleFieldErrors(next)) {
          setFormError('')
        }
        return next
      })
    },
    [locationLat, locationLng],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/platform/physio-nda')
        if (cancelled) return
        setNdaPolicy({
          requireQualificationDeclaration: data.requireQualificationDeclaration !== false,
          declarationText: data.declarationText || '',
        })
      } catch {
        if (!cancelled) {
          setNdaPolicy({ requireQualificationDeclaration: true, declarationText: '' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = (e) => {
      const h = e?.endCoordinates?.height
      setKeyboardInset(Number.isFinite(h) ? h : 0)
    }
    const onHide = () => setKeyboardInset(0)
    const subShow = Keyboard.addListener(showEvt, onShow)
    const subHide = Keyboard.addListener(hideEvt, onHide)
    return () => {
      subShow.remove()
      subHide.remove()
    }
  }, [])

  async function applyCoverageFromCoords(lat, lng) {
    setLocationLat(lat)
    setLocationLng(lng)
    setLocationLookupBusy(true)
    setFieldErrors((prev) => ({ ...prev, location: '' }))
    try {
      const label = await reverseGeocodeToAddress(lat, lng)
      if (label) {
        setLocation(label)
        patchField('location', label, { locationLat: lat, locationLng: lng })
        return label
      }
      setLocation('')
      patchField('location', '', { locationLat: lat, locationLng: lng })
      Toast.show({
        type: 'error',
        text1: 'Address lookup failed',
        text2: 'Try a nearby point on the map or check your internet connection.',
      })
      return ''
    } finally {
      setLocationLookupBusy(false)
    }
  }

  function openMapPicker() {
    const lat = Number.isFinite(locationLat) ? locationLat : 26.14
    const lng = Number.isFinite(locationLng) ? locationLng : 91.74
    setMapPin({ lat, lng })
    setMapPickerOpen(true)
  }

  async function applyMapPin() {
    const lat = Number(mapPin?.lat)
    const lng = Number(mapPin?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Toast.show({ type: 'error', text1: 'Pick a valid location on the map' })
      return
    }
    setMapPickerOpen(false)
    const label = await applyCoverageFromCoords(lat, lng)
    if (label) {
      Toast.show({ type: 'success', text1: 'Coverage area updated' })
    }
  }

  async function useMyLocationForMapPicker() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Location permission denied' })
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        Toast.show({ type: 'error', text1: 'Could not read GPS coordinates' })
        return
      }
      setMapPin({ lat, lng })
      Toast.show({ type: 'success', text1: 'Map moved to your location' })
    } catch (e) {
      Toast.show({ type: 'error', text1: e.message || 'Could not read GPS' })
    } finally {
      setLocating(false)
    }
  }

  async function useGpsForCoverage() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Location permission denied' })
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const label = await applyCoverageFromCoords(pos.coords.latitude, pos.coords.longitude)
      if (label) {
        Toast.show({ type: 'success', text1: 'Location captured' })
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: e.message || 'Could not read GPS' })
    } finally {
      setLocating(false)
    }
  }

  async function addInternshipCertificates() {
    const picked = await pickMultipleDocuments('Internship certificate')
    if (!picked.length) return
    setFInternships((prev) => [...prev, ...picked])
    patchField('internshipCertificate', picked[0])
    setFieldErrors((prev) => ({ ...prev, internshipCertificate: '' }))
  }

  function removeInternshipCertificate(index) {
    setFInternships((prev) => prev.filter((_, i) => i !== index))
  }

  async function pickDoc(label, setter, avatar = false, fieldKey = null) {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: avatar ? ['image/*'] : ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      })
      if (res?.canceled === true || res?.assets == null) return
      const raw = Array.isArray(res.assets) && res.assets.length > 0 ? res.assets[0] : null
      const legacy =
        !raw &&
        typeof res.uri === 'string' &&
        res.uri
          ? {
              uri: res.uri,
              name: res.name,
              mimeType: res.mimeType,
              size: res.size,
            }
          : null
      const wrappedRaw = raw || legacy
      const wrapped = normalizePickedDocument(wrappedRaw)
      if (!wrapped?.uri) {
        Toast.show({
          type: 'error',
          text1: 'Could not read that file',
          text2: 'Try another file or pick from device storage (not cloud-only).',
        })
        return
      }
      const v = avatar ? validateAvatarFile(wrapped) : validateFileAsset(wrapped, label)
      if (!v.ok) {
        Toast.show({ type: 'error', text1: v.message })
        return
      }
      setter(wrapped)
      if (avatar) {
        patchField('avatar', wrapped)
      } else if (fieldKey) {
        patchField(fieldKey, wrapped)
      }
    } catch (e) {
      Toast.show({ type: 'error', text1: e.message || 'Could not pick file' })
    }
  }

  function computeCoords() {
    if (Number.isFinite(locationLat) && Number.isFinite(locationLng)) {
      return { lat: locationLat, lng: locationLng }
    }
    return { lat: NaN, lng: NaN }
  }

  function computeAccountBasicErrors() {
    const { lat, lng } = computeCoords()
    const e1 = validateRegistrationAccount({ phone, password })
    const e2 = validateBasicSection({
      name,
      email,
      location,
      dob: dob || undefined,
      gender,
    })
    const merged = { ...e1.errors, ...e2.errors }
    const av = validateAvatarFile(avatarAsset, { required: true })
    if (!av.ok) merged.avatar = av.message
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      merged.location =
        merged.location ||
        'Pick on map or use GPS to set your coverage area (required).'
    } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      merged.location = merged.location || 'Invalid map location'
    }
    return merged
  }

  function tryGoToStep(targetStep) {
    if (targetStep === step) return
    if (targetStep > 1 && targetStep > step) {
      const merged = computeAccountBasicErrors()
      if (Object.keys(merged).length) {
        setFieldErrors(merged)
        setFormError('Complete Account & basic before continuing')
        Toast.show({ type: 'error', text1: 'Complete Account & basic before continuing' })
        return
      }
    }
    setStep(targetStep)
    clearErrors()
  }

  async function goNext(fromStep) {
    clearErrors()
    setSaving(true)
    try {
      if (fromStep === 1) {
        const merged = computeAccountBasicErrors()
        if (Object.keys(merged).length) {
          setFieldErrors(merged)
          setFormError('Fix the errors below before continuing')
          Toast.show({ type: 'error', text1: 'Check step 1' })
          return
        }
      }
      if (fromStep === 2) {
        const { errors } = validateQualificationSection({ degree, university, year, registrationNumber })
        if (Object.keys(errors).length) {
          setFieldErrors(errors)
          setFormError('Fix the errors below before continuing')
          return
        }
      }
      if (fromStep === 3) {
        const { errors } = validatePracticeSection({
          experience,
          specialization,
          serviceType,
          areas,
        })
        if (Object.keys(errors).length) {
          setFieldErrors(errors)
          setFormError('Fix the errors below before continuing')
          return
        }
      }
      if (fromStep === 4) {
        const { errors, ok } = validateDocumentsStep(
          { fCertificate, fIdProof, fRegCert, fSelfie, fInternships },
          {},
          {
            requireQualificationDeclaration: ndaPolicy.requireQualificationDeclaration,
            declarationAccepted: qualificationAgreed,
            idProofType,
          },
        )
        if (!ok) {
          setFieldErrors(errors)
          setFormError('Upload all required documents')
          Toast.show({ type: 'error', text1: 'Complete documents step' })
          return
        }
        const checks = [
          [fCertificate, 'BPT/MPT pass certificate'],
          [fIdProof, 'GOVERNMENT ID'],
          [fSelfie, 'Selfie with ID'],
        ]
        for (const [file, label] of checks) {
          const r = validateFileAsset(file, label)
          if (!r.ok) {
            setFieldErrors({ file: r.message })
            setFormError(r.message)
            return
          }
        }
        if (fRegCert) {
          const r = validateFileAsset(fRegCert, 'NCAHP/IAP registration certificate')
          if (!r.ok) {
            setFieldErrors({ file: r.message })
            setFormError(r.message)
            return
          }
        }
        for (const file of fInternships) {
          const r = validateFileAsset(file, 'Internship certificate')
          if (!r.ok) {
            setFieldErrors({ file: r.message })
            setFormError(r.message)
            return
          }
        }
      }
      setStep(Math.min(5, fromStep + 1))
      clearErrors()
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (ndaPolicy.requireQualificationDeclaration && !qualificationAgreed) {
      setFormError('Confirm the qualification declaration')
      Toast.show({ type: 'error', text1: 'Confirm the qualification declaration' })
      return
    }
    const merged = computeAccountBasicErrors()
    Object.assign(merged, validateRegistrationAccount({ phone, password }).errors)
    Object.assign(
      merged,
      validateQualificationSection({ degree, university, year, registrationNumber }).errors,
    )
    Object.assign(
      merged,
      validatePracticeSection({ experience, specialization, serviceType, areas }).errors,
    )
    const { errors: docErrors, ok: docsOk } = validateDocumentsStep(
      { fCertificate, fIdProof, fRegCert, fSelfie, fInternships },
      {},
      {
        requireQualificationDeclaration: ndaPolicy.requireQualificationDeclaration,
        declarationAccepted: qualificationAgreed,
        idProofType,
      },
    )
    Object.assign(merged, docErrors)
    if (Object.keys(merged).length) {
      setFieldErrors(merged)
      setFormError('Fix the errors below before submitting')
      Toast.show({ type: 'error', text1: 'Complete all required fields and documents' })
      if (merged.certificate || merged.internshipCertificate || merged.idProof || merged.selfieWithId) {
        setStep(4)
      } else if (merged.degree || merged.university || merged.year) {
        setStep(2)
      } else if (merged.experience || merged.specialization || merged.areas) {
        setStep(3)
      } else {
        setStep(1)
      }
      return
    }
    if (!docsOk) {
      setStep(4)
      return
    }
    const { lat, lng } = computeCoords()
    setSaving(true)
    clearErrors()
    try {
      const fd = new FormData()
      const pv = validateIndianMobile(phone)
      if (!pv.valid) {
        Toast.show({ type: 'error', text1: pv.message })
        return
      }
      fd.append('phone', pv.normalized)
      fd.append('password', password)
      fd.append('name', formatPhysioDisplayName(name))
      fd.append('email', email.trim().toLowerCase())
      if (dob) fd.append('dob', dob)
      if (gender) fd.append('gender', gender)
      fd.append('location', location.trim())
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        fd.append('lat', String(lat))
        fd.append('lng', String(lng))
      }
      fd.append('degree', degree.trim())
      fd.append('university', university.trim())
      fd.append('year', String(year))
      fd.append('registrationNumber', registrationNumber.trim())
      fd.append('experience', String(experience))
      fd.append('specialization', specialization.trim())
      fd.append('serviceType', serviceType)
      fd.append('areas', areas)

      const fileChecks = [
        [avatarAsset, 'avatar', 'Passport size photo'],
        [fCertificate, 'certificate', 'BPT/MPT pass certificate'],
        [fIdProof, 'idProof', 'GOVERNMENT ID'],
        [fSelfie, 'selfieWithId', 'Selfie with ID'],
      ]
      for (const [asset, , label] of fileChecks) {
        if (!isUploadableDocument(asset)) {
          Toast.show({ type: 'error', text1: `${label} is missing`, text2: 'Go back to Documents and re-select the file.' })
          setStep(4)
          return
        }
      }
      if (!fInternships.some(isUploadableDocument)) {
        Toast.show({ type: 'error', text1: 'Internship certificate is missing', text2: 'Add at least one internship certificate.' })
        setStep(4)
        return
      }

      let attached = 0
      if (await appendFormDataFile(fd, 'avatar', avatarAsset)) attached += 1
      if (await appendFormDataFile(fd, 'certificate', fCertificate)) attached += 1
      if (await appendFormDataFile(fd, 'idProof', fIdProof)) attached += 1
      fd.append('idProofType', String(idProofType).trim().toLowerCase())
      if (fRegCert) await appendFormDataFile(fd, 'registrationCertificate', fRegCert)
      if (await appendFormDataFile(fd, 'selfieWithId', fSelfie)) attached += 1
      attached += await appendFormDataFiles(fd, 'internshipCertificate', fInternships)
      if (attached < 5) {
        Toast.show({
          type: 'error',
          text1: 'Could not attach documents',
          text2: 'Re-select your files on the Documents step and try again.',
        })
        setStep(4)
        return
      }
      fd.append('qualificationDeclaration', qualificationAgreed ? 'true' : 'false')

      await postFormData('/auth/register-physio', fd)

      Toast.show({
        type: 'success',
        text1: 'Application submitted',
        text2: 'Sign in after an admin approves your account.',
      })
      navigation.replace('Login')
    } catch (e) {
      const data = e.response?.data
      const rawErrors = extractApiFieldErrors(data)
      if (Object.keys(rawErrors).length) {
        const normalized = normalizeRegistrationApiErrors(rawErrors)
        setFieldErrors(normalized)
        setFormError(data?.message || 'Please fix the errors below')
        Toast.show({
          type: 'error',
          text1: rawErrors.feeMin
            ? 'Server update required — contact support or retry after deploy'
            : data?.message || 'Registration failed',
        })
      } else {
        Toast.show({ type: 'error', text1: data?.message || e.message || 'Registration failed' })
      }
    } finally {
      setSaving(false)
    }
  }

  function openDobPicker() {
    setPickerTempDate(parseDobToDate(dob) || defaultDobPickerDate(maxDob))
    setDobPickerVisible(true)
  }

  function applyPickedDob(date) {
    const ymd = formatYmd(date)
    setDob(ymd)
    patchField('dob', ymd)
  }

  const coveragePinned = Number.isFinite(locationLat) && Number.isFinite(locationLng)

  /** Space for footer row + safe area + keyboard so fields can scroll above the keyboard (esp. Android). */
  const footerReserve = step < 5 ? 88 + insets.bottom : 0
  const keyboardPad =
    Platform.OS === 'android' ? keyboardInset : Math.min(100, Math.round(keyboardInset * 0.4))
  const scrollBottomPad = 24 + footerReserve + keyboardPad

  const kavOffset = Math.max(insets.top, 8) + 52

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={kavOffset}
      enabled={Platform.OS === 'ios'}
    >
      <AppHeader
        title="Register"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
        right={
          <Pressable
            onPress={() => navigation.navigate('Login')}
            hitSlop={10}
            style={styles.headerSignIn}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={styles.headerLink}>Sign in</Text>
            <Ionicons name="log-in-outline" size={18} color={colors.brand} />
          </Pressable>
        }
      />
      <View style={styles.mainCol}>
        {/* Ambient Top Background Halo Glow */}
        <View style={styles.ambientHeaderGlow} pointerEvents="none" />
        <View style={styles.ambientHeaderGlow2} pointerEvents="none" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[styles.scrollPad, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollFlex}
      >
        <Text style={styles.h1}>Register as a physiotherapist</Text>
        <Text style={styles.lead}>
          Same steps as on the web. After submit, an admin reviews your application before you can work on the
          platform.
        </Text>
        <View style={{ height: 16 }} />
        <View style={styles.premiumProgressContainer}>
          <View style={styles.progressTextRow}>
            <Text style={styles.progressSub}>STEP {step} OF 5</Text>
            <Text style={styles.progressTitle}>{STEPS[step - 1].title}</Text>
          </View>
          
          <View style={styles.progressTrack}>
            <Animated.View 
              style={[
                styles.progressBar, 
                { 
                  width: progressAnim.interpolate({
                    inputRange: [0.2, 1],
                    outputRange: ['20%', '100%'],
                  }) 
                }
              ]} 
            />
          </View>

          <View style={styles.miniStepsRow}>
            {STEPS.map((s) => {
              const isActive = step === s.n
              const isCompleted = step > s.n
              return (
                <Pressable
                  key={s.n}
                  onPress={() => tryGoToStep(s.n)}
                  style={[
                    styles.miniStepDot,
                    isActive && styles.miniStepDotActive,
                    isCompleted && styles.miniStepDotCompleted,
                  ]}
                  hitSlop={8}
                >
                  <Text style={[
                    styles.miniStepText,
                    isActive && styles.miniStepTextActive,
                    isCompleted && styles.miniStepTextCompleted,
                  ]}>
                    {s.n}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={{ height: 16 }} />
        <ErrorBanner formError={formError} fieldErrors={fieldErrors} />

        {step === 1 && (
          <Card padding="lg" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account & basic info</Text>
            <View style={{ height: 14 }} />
            <PhysioNameInput
              value={name}
              onChangeText={(v) => {
                setName(v)
                patchField('name', v)
              }}
              error={fieldErrors.name}
              placeholder="Your name"
              returnKeyType="next"
              blurOnSubmit={false}
            />
            <Animated.View style={{ opacity: fadeAnim }}>
            <View style={{ height: 12 }} />
            <Input
              label="Phone Number"
              keyboardType="phone-pad"
              textContentType="none"
              autoComplete="off"
              importantForAutofill="no"
              autoCorrect={false}
              value={phone}
              onChangeText={(v) => {
                setPhone(v)
                patchField('phone', v)
              }}
              error={fieldErrors.phone}
              placeholder="Enter mobile number"
              returnKeyType="next"
              blurOnSubmit={false}
            />
            <View style={{ height: 12 }} />
            <Input
              label="Password (min 6)"
              secureTextEntry
              textContentType="none"
              autoComplete="off"
              importantForAutofill="no"
              autoCorrect={false}
              value={password}
              onChangeText={(v) => {
                setPassword(v)
                patchField('password', v)
              }}
              error={fieldErrors.password}
              placeholder="Enter password"
              returnKeyType="next"
              blurOnSubmit={false}
            />
            <View style={{ height: 12 }} />
            <Input
              label="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(v) => {
                setEmail(v)
                patchField('email', v)
              }}
              error={fieldErrors.email}
              placeholder="Enter email address"
            />
            <View style={{ height: 12 }} />
            {Platform.OS !== 'web' ? (
              <View>
                <Text style={styles.pickLabel}>Date of birth</Text>
                <Pressable
                  onPress={openDobPicker}
                  style={[styles.pickField, fieldErrors.dob ? styles.pickFieldErr : null]}
                  accessibilityRole="button"
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.brand} style={styles.pickFieldIcon} />
                  <Text style={[styles.pickFieldText, styles.pickFieldTextFlex, !dob ? styles.pickPlaceholder : null]}>
                    {dob || 'Select date of birth'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                </Pressable>
                {fieldErrors.dob ? <Text style={styles.fieldErr}>{fieldErrors.dob}</Text> : null}
              </View>
            ) : (
              <Input
                label="Date of birth (YYYY-MM-DD)"
                value={dob}
                onChangeText={(v) => {
                  setDob(v)
                  patchField('dob', v)
                }}
                error={fieldErrors.dob}
                placeholder="YYYY-MM-DD"
              />
            )}
            <View style={{ height: 12 }} />
            <View style={{ marginBottom: 12 }}>
              <DropdownField
                label="Gender"
                value={gender}
                placeholder="Select gender"
                options={GENDER_DROPDOWN_OPTIONS}
                onSelect={(v) => {
                  setGender(v)
                  patchField('gender', v)
                }}
                variant="inline"
              />
              {fieldErrors.gender ? <Text style={styles.fieldErr}>{fieldErrors.gender}</Text> : null}
            </View>
            <Text style={styles.sectionTitle}>Coverage / location</Text>
            <Text style={styles.help}>
              Patients see this when booking. Use Pick on map or Use GPS — you cannot type the address manually.
            </Text>
            <View style={{ height: 10 }} />
            <View style={styles.mapActionRow}>
              <Pressable
                style={[styles.mapActionBtn, locationLookupBusy && styles.mapActionBtnDisabled]}
                onPress={openMapPicker}
                disabled={locationLookupBusy}
              >
                <Ionicons name="map" size={16} color={colors.brand} />
                <Text style={styles.mapActionBtnTxt}>Pick on map</Text>
              </Pressable>
              <Pressable
                style={[styles.mapActionBtn, (locating || locationLookupBusy) && styles.mapActionBtnDisabled]}
                onPress={useGpsForCoverage}
                disabled={locating || locationLookupBusy}
              >
                <Ionicons name="locate-outline" size={16} color={colors.brand} />
                <Text style={styles.mapActionBtnTxt}>
                  {locating || locationLookupBusy ? 'Locating…' : 'Use GPS'}
                </Text>
              </Pressable>
            </View>
            <View style={{ height: 12 }} />
            <Text style={styles.pickLabel}>Selected coverage area</Text>
            <View
              style={[
                styles.locationReadonly,
                fieldErrors.location ? styles.locationReadonlyErr : null,
                coveragePinned && location ? styles.locationReadonlySet : null,
              ]}
            >
              {locationLookupBusy ? (
                <>
                  <ActivityIndicator size="small" color={colors.brand} style={styles.locationReadonlyIcon} />
                  <Text style={[styles.locationReadonlyText, styles.locationReadonlyPlaceholder]}>
                    Looking up address…
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={location ? 'location' : 'location-outline'}
                    size={18}
                    color={location ? colors.brand : colors.textTertiary}
                    style={styles.locationReadonlyIcon}
                  />
                  <Text
                    style={[styles.locationReadonlyText, !location ? styles.locationReadonlyPlaceholder : null]}
                    numberOfLines={5}
                  >
                    {location || 'No location selected yet — pick on map or use GPS'}
                  </Text>
                </>
              )}
            </View>
            {fieldErrors.location ? <Text style={styles.fieldErr}>{fieldErrors.location}</Text> : null}

            <View style={{ height: 16 }} />
            <Text style={styles.pickLabel}>Passport size photo with clear background</Text>
            <Text style={styles.help}>Required — upload a clear passport-style photo.</Text>
            {avatarAsset?.uri ? (
              <Image source={{ uri: avatarAsset.uri }} style={styles.avatar} />
            ) : null}
            <Button
              title={avatarAsset ? 'Change photo' : 'Choose photo'}
              variant="outline"
              onPress={() => pickDoc('Passport size photo', setAvatarAsset, true)}
            />
            {fieldErrors.avatar ? <Text style={styles.fieldErr}>{fieldErrors.avatar}</Text> : null}
            </Animated.View>
          </Card>
        )}

        <Animated.View style={{ opacity: fadeAnim }}>
        {step === 2 && (
          <Card padding="lg" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Qualification</Text>
            <View style={{ height: 14 }} />
            <View style={{ marginBottom: 12 }}>
              <DropdownField
                label="Degree"
                value={degree}
                placeholder="Select degree"
                options={DEGREE_DROPDOWN_OPTIONS}
                onSelect={(v) => {
                  setDegree(v)
                  patchField('degree', v)
                }}
                variant="inline"
              />
              {fieldErrors.degree ? <Text style={styles.fieldErr}>{fieldErrors.degree}</Text> : null}
            </View>
            <View style={{ height: 12 }} />
            <Input
              label="University"
              value={university}
              onChangeText={(v) => {
                setUniversity(v)
                patchField('university', v)
              }}
              error={fieldErrors.university}
              placeholder="Enter university or college"
            />
            <View style={{ height: 12 }} />
            <Input
              label="Passing year"
              keyboardType="number-pad"
              value={year}
              onChangeText={(v) => {
                setYear(v)
                patchField('year', v)
              }}
              error={fieldErrors.year}
              placeholder="e.g. 2018"
            />
            <View style={{ height: 12 }} />
            <Input
              label="NCAHP/IAP registration no. (optional)"
              value={registrationNumber}
              onChangeText={(v) => {
                setRegistrationNumber(v)
                patchField('registrationNumber', v)
              }}
              error={fieldErrors.registrationNumber}
              placeholder="Enter NCAHP/IAP registration number"
            />
          </Card>
        )}

        {step === 3 && (
          <Card padding="lg" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Practice details</Text>
            <View style={{ height: 14 }} />
            <Input
              label="Experience (years)"
              keyboardType="decimal-pad"
              value={experience}
              onChangeText={(v) => {
                setExperience(v)
                patchField('experience', v)
              }}
              error={fieldErrors.experience}
              placeholder="e.g. 5"
            />
            <View style={{ height: 12 }} />
            <Input
              label="Specialization"
              value={specialization}
              onChangeText={(v) => {
                setSpecialization(v)
                patchField('specialization', v)
              }}
              error={fieldErrors.specialization}
              placeholder="e.g. Orthopaedic, sports injury"
            />
            <View style={{ height: 12 }} />
            <View style={{ marginBottom: 12 }}>
              <DropdownField
                label="Service type"
                value={serviceType}
                placeholder="Select service type"
                options={SERVICE_TYPE_OPTIONS}
                onSelect={(v) => {
                  setServiceType(v)
                  patchField('serviceType', v)
                }}
                variant="inline"
              />
              {fieldErrors.serviceType ? <Text style={styles.fieldErr}>{fieldErrors.serviceType}</Text> : null}
            </View>
            <View style={{ height: 12 }} />
            <Input
              label="Areas (comma-separated)"
              value={areas}
              onChangeText={(v) => {
                setAreas(v)
                patchField('areas', v)
              }}
              placeholder="e.g. Guwahati, Beltola"
              error={fieldErrors.areas}
            />
            <EarningsEstimatorWidget />
          </Card>
        )}

        {step === 4 && (
          <Card padding="lg" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Documents</Text>
            <Text style={styles.help}>PDF or image, max 2MB each.</Text>
            <DocumentSecurityWidget />
            <View style={{ height: 12 }} />
            <DocRow
              title="BPT/MPT pass certificate"
              subtitle="Degree or marksheet."
              asset={fCertificate}
              error={fieldErrors.certificate}
              onPick={() => pickDoc('BPT/MPT pass certificate', setFCertificate, false, 'certificate')}
            />
            <View style={{ height: 16 }} />
            <MultiInternshipDocRow
              assets={fInternships}
              error={fieldErrors.internshipCertificate}
              onAdd={addInternshipCertificates}
              onRemove={removeInternshipCertificate}
            />
            <View style={{ height: 16 }} />
            <GovtIdDocumentSection
              idProofType={idProofType}
              onSelectIdType={(v) => {
                setIdProofType(v)
                patchField('idProofType', v)
              }}
              idProofAsset={fIdProof}
              onPickIdProof={() => pickDoc('GOVERNMENT ID', setFIdProof, false, 'idProof')}
              error={{ idProofType: fieldErrors.idProofType, idProof: fieldErrors.idProof }}
              useDropdown
            />
            <View style={{ height: 16 }} />
            <DocRow
              title="Selfie with ID"
              subtitle="Face visible next to same ID."
              asset={fSelfie}
              error={fieldErrors.selfieWithId}
              onPick={() => pickDoc('Selfie with ID', setFSelfie, false, 'selfieWithId')}
            />
            <View style={{ height: 16 }} />
            <DocRow
              title="NCAHP/IAP registration certificate"
              subtitle="If registered, upload your certificate."
              asset={fRegCert}
              error={fieldErrors.registrationCertificate}
              onPick={() => pickDoc('NCAHP/IAP registration certificate', setFRegCert, false, 'registrationCertificate')}
              isOptional
            />
            <View style={{ height: 20 }} />
            <Text style={styles.sectionTitle}>Qualification declaration</Text>
            <Text style={styles.declaration}>
              {ndaPolicy.declarationText ||
                'I confirm that all qualifications and documents I submit to PhysiOkhom are accurate. Misrepresentation may result in removal from the platform and legal consequences.'}
            </Text>
            <Pressable style={styles.checkRow} onPress={() => setQualificationAgreed((v) => !v)}>
              <View style={[styles.checkBox, qualificationAgreed ? styles.checkBoxOn : null]}>
                {qualificationAgreed ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
              </View>
              <Text style={styles.checkLabel}>I have read and agree to the declaration above.</Text>
            </Pressable>
            {fieldErrors.qualificationDeclaration ? (
              <Text style={styles.fieldErr}>{fieldErrors.qualificationDeclaration}</Text>
            ) : null}
            {fieldErrors.file ? <Text style={styles.fieldErr}>{fieldErrors.file}</Text> : null}
          </Card>
        )}

        {step === 5 && (
          <Card padding="lg" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Review details</Text>
            <Text style={styles.help}>Verify your application details before submitting.</Text>
            <View style={{ height: 16 }} />
            
            <Text style={styles.reviewSectionHeader}>BASIC INFO</Text>
            <ReviewLine label="Phone" value={normalizeIndianPhone(phone) || '—'} />
            <ReviewLine label="Full name" value={formatPhysioDisplayName(name) || '—'} />
            <ReviewLine label="Email" value={email || '—'} />
            <ReviewLine label="DOB" value={dob || '—'} />
            <ReviewLine label="Gender" value={gender ? (gender.charAt(0).toUpperCase() + gender.slice(1)) : '—'} />
            <View style={{ height: 16 }} />
            <Text style={styles.reviewSectionHeader}>PROFESSIONAL INFO</Text>
            <ReviewLine label="Degree" value={degree || '—'} />
            <ReviewLine label="University" value={university || '—'} />
            <ReviewLine label="Passing year" value={year || '—'} />
            <ReviewLine label="Specialization" value={specialization || '—'} />
            <ReviewLine label="Experience" value={experience !== '' ? `${experience} yrs` : '—'} />
            <ReviewLine label="Coverage" value={location || '—'} />
            <ReviewLine label="Coverage on map" value={coveragePinned ? 'Set' : 'Not set'} />
            
            <View style={{ height: 16 }} />
            <Text style={styles.reviewSectionHeader}>ATTACHED DOCUMENTS</Text>
            <View style={styles.reviewDocsGrid}>
              <ReviewDocBadge label="Passport photo" present={Boolean(avatarAsset)} name={avatarAsset?.name} />
              <ReviewDocBadge label="BPT/MPT Cert" present={Boolean(fCertificate)} name={fCertificate?.name} />
              <ReviewDocBadge label="Internship" present={fInternships.length > 0} name={`${fInternships.length} file(s)`} />
              <ReviewDocBadge label="Govt ID" present={Boolean(fIdProof)} name={fIdProof?.name} />
              <ReviewDocBadge label="Selfie with ID" present={Boolean(fSelfie)} name={fSelfie?.name} />
              <ReviewDocBadge label="NCAHP/IAP (Opt)" present={Boolean(fRegCert)} name={fRegCert?.name} isOptional />
            </View>
            
            <View style={{ height: 20 }} />
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
              <Text style={styles.infoBannerText}>
                Your application will be reviewed by an administrator. This usually takes 24-48 hours.
              </Text>
            </View>
            
            <View style={{ height: 20 }} />
            <Button title={saving ? 'Submitting…' : 'Submit application'} onPress={handleSubmit} loading={saving} />
          </Card>
        )}
        </Animated.View>

      </ScrollView>

      {step < 5 ? (
          <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 12) }]}>
            {step > 1 ? (
              <Button
                title="Back"
                variant="outline"
                onPress={() => {
                  setStep((s) => Math.max(1, s - 1))
                  clearErrors()
                }}
              />
            ) : (
              <View style={{ width: 88 }} />
            )}
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Button
                title={saving ? '…' : step === 4 ? 'Continue to review' : 'Save & continue'}
                onPress={() => goNext(step)}
                loading={saving}
              />
            </View>
          </View>
        ) : null}
      </View>

      {Platform.OS === 'ios' && (
        <Modal transparent visible={dobPickerVisible} animationType="fade">
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => setDobPickerVisible(false)} />
            <View style={[styles.modalSheet, { paddingBottom: Math.max(16, insets.bottom) }]}>
              <View style={styles.modalToolbar}>
                <Pressable hitSlop={12} onPress={() => setDobPickerVisible(false)}>
                  <Text style={styles.modalBtn}>Cancel</Text>
                </Pressable>
                <Pressable
                  hitSlop={12}
                  onPress={() => {
                    applyPickedDob(pickerTempDate)
                    setDobPickerVisible(false)
                  }}
                >
                  <Text style={[styles.modalBtn, styles.modalBtnPrimary]}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pickerTempDate}
                mode="date"
                display="spinner"
                themeVariant="light"
                onChange={(_, date) => date && setPickerTempDate(date)}
                maximumDate={maxDob}
                minimumDate={DOB_PICKER_MIN}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && dobPickerVisible ? (
        <DateTimePicker
          value={pickerTempDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setDobPickerVisible(false)
            if (event?.type === 'dismissed') return
            if (date) applyPickedDob(date)
          }}
          maximumDate={maxDob}
          minimumDate={DOB_PICKER_MIN}
        />
      ) : null}

      <MapPickerModal
        visible={mapPickerOpen}
        pin={mapPin}
        geoBusy={locating}
        onClose={() => setMapPickerOpen(false)}
        onPick={setMapPin}
        onUseMyLocation={useMyLocationForMapPicker}
        onUseLocation={applyMapPin}
      />
    </KeyboardAvoidingView>
  )
}

function ReviewLine({ label, value }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewVal} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

function ReviewDocBadge({ label, present, name, isOptional }) {
  return (
    <View style={[styles.reviewDocBadge, present ? styles.reviewDocBadgeReady : styles.reviewDocBadgeEmpty]}>
      <Ionicons 
        name={present ? "checkmark-circle" : (isOptional ? "remove-circle" : "alert-circle")} 
        size={14} 
        color={present ? colors.success : (isOptional ? colors.textTertiary : colors.danger)} 
      />
      <View style={styles.reviewDocBadgeTextCol}>
        <Text style={styles.reviewDocBadgeLabel}>{label}</Text>
        <Text style={styles.reviewDocBadgeFileName} numberOfLines={1}>
          {present ? (name || 'Attached') : (isOptional ? 'Not attached' : 'Required')}
        </Text>
      </View>
    </View>
  )
}

function DocumentSecurityWidget() {
  return (
    <View style={styles.securityWidget}>
      <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.securityTitle}>Secure Document Upload</Text>
        <Text style={styles.securityDesc}>
          Credentials are encrypted and kept strictly confidential. Only verified administrators have clearance to view files.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  scrollPad: { paddingHorizontal: 16, paddingTop: 10 },
  headerSignIn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLink: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.brand },
  h1: { fontFamily: font.bold, fontSize: type['2xl'], color: colors.ink, letterSpacing: -0.3 },
  lead: { marginTop: 6, fontFamily: font.regular, fontSize: type.sm, color: colors.inkMuted, lineHeight: leading.sm },
  stepRow: { flexDirection: 'row', gap: 10, paddingVertical: 6, paddingRight: 8, alignItems: 'center' },
  stepChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: r.full, borderWidth: 1, minHeight: 38, flexShrink: 0, justifyContent: 'center' },
  stepChipOff: { backgroundColor: 'rgba(255, 255, 255, 0.45)', borderColor: 'rgba(13, 148, 136, 0.15)' },
  stepChipOn: { backgroundColor: colors.brand, borderColor: colors.brand, shadowColor: colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  stepChipText: { fontFamily: font.semiBold, fontSize: type.xs, color: colors.inkMuted },
  stepChipTextOn: { color: colors.white },
  sectionCard: {
    marginBottom: 16,
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  sectionTitle: { fontFamily: font.bold, fontSize: type.lg, color: colors.ink },
  help: { marginTop: 4, fontFamily: font.regular, fontSize: type.sm, color: colors.textSecondary, lineHeight: leading.sm },
  pickLabel: { marginBottom: 6, fontFamily: font.semiBold, fontSize: type.sm, color: colors.inkMuted },
  pickField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(241, 245, 249, 0.5)',
    minHeight: 46,
  },
  pickFieldErr: { borderColor: colors.danger },
  pickFieldText: { fontFamily: font.regular, fontSize: type.base, color: colors.ink },
  pickFieldTextFlex: { flex: 1 },
  pickFieldIcon: { marginRight: 8 },
  pickPlaceholder: { color: colors.textTertiary },
  textArea: {
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    borderRadius: 14,
    padding: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    fontFamily: font.regular,
    fontSize: type.base,
    color: colors.ink,
    backgroundColor: 'rgba(241, 245, 249, 0.5)',
  },
  textAreaFocused: {
    borderColor: colors.brand,
    backgroundColor: colors.white,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  textAreaErr: { borderColor: colors.danger },
  mapActionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  mapActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.2)',
    backgroundColor: colors.white,
  },
  mapActionBtnDisabled: { opacity: 0.6 },
  mapActionBtnTxt: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.brand },
  locationReadonly: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    borderRadius: 12,
    backgroundColor: 'rgba(241, 245, 249, 0.5)',
  },
  locationReadonlySet: {
    borderColor: 'rgba(13, 148, 136, 0.2)',
    backgroundColor: colors.white,
  },
  locationReadonlyErr: { borderColor: colors.danger },
  locationReadonlyIcon: { marginTop: 1 },
  locationReadonlyText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: type.base,
    color: colors.ink,
    lineHeight: leading.sm,
  },
  locationReadonlyPlaceholder: {
    color: colors.textTertiary,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 16, borderWidth: 2, borderColor: colors.brandSoft },
  
  // Premium DocRow dropzones
  docRowPremium: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  docRowEmpty: {
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
    borderColor: 'rgba(13, 148, 136, 0.12)',
    borderStyle: 'dashed',
  },
  docRowUploaded: {
    backgroundColor: colors.white,
    borderColor: 'rgba(13, 148, 136, 0.15)',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  docRowError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  docRowPressed: {
    opacity: 0.85,
    backgroundColor: colors.slate100,
  },
  docRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  docTitlePremium: { fontFamily: font.bold, fontSize: type.base, color: colors.ink },
  docSubPremium: { marginTop: 2, fontFamily: font.regular, fontSize: type.xs, color: colors.textSecondary },
  
  // Badges
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeSuccessText: { fontFamily: font.semiBold, fontSize: 10, color: colors.success },
  badgeOptional: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  badgeOptionalText: { fontFamily: font.medium, fontSize: 10, color: colors.slate500 },
  badgeRequired: {
    backgroundColor: colors.rose50,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.1)',
  },
  badgeRequiredText: { fontFamily: font.semiBold, fontSize: 10, color: colors.danger },

  // Upload previews
  docPreviewContainer: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.slate50,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate100,
  },
  docThumbPremium: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  docIconWrapPremium: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docDetailsCol: {
    flex: 1,
  },
  docNamePremium: { fontFamily: font.medium, fontSize: type.sm, color: colors.ink },
  tapToReplace: { fontFamily: font.regular, fontSize: 10, color: colors.brand, marginTop: 1 },
  uploadPromptRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  uploadPromptText: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.brand },

  declaration: {
    marginTop: 8,
    fontFamily: font.regular,
    fontSize: type.sm,
    color: colors.inkMuted,
    lineHeight: leading.sm,
    padding: 12,
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14 },
  checkBox: {
    marginTop: 2,
    width: 24,
    height: 24,
    borderRadius: r.sm,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkLabel: { flex: 1, fontFamily: font.regular, fontSize: type.sm, color: colors.inkMuted, lineHeight: leading.sm },
  fieldErr: { marginTop: 5, fontFamily: font.regular, fontSize: type.xs, color: colors.danger },
  errorBanner: {
    marginBottom: 14,
    padding: 14,
    borderRadius: r.xl,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  errorBannerTitle: { fontFamily: font.semiBold, fontSize: type.sm, color: colors.danger, marginBottom: 6 },
  errorBannerItem: { fontFamily: font.regular, fontSize: type.xs, color: colors.danger, marginTop: 2 },
  mainCol: { flex: 1, position: 'relative', overflow: 'hidden' },
  scrollFlex: { flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(13, 148, 136, 0.08)',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  reviewLabel: { fontFamily: font.regular, fontSize: type.sm, color: colors.inkMuted },
  reviewVal: { flex: 1, fontFamily: font.semiBold, fontSize: type.sm, color: colors.ink, textAlign: 'right' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: r['2xl'],
    borderTopRightRadius: r['2xl'],
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  modalToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  modalBtn: { fontFamily: font.medium, fontSize: type.sm, color: colors.textSecondary },
  modalBtnPrimary: { fontFamily: font.bold, color: colors.brand },
  ambientHeaderGlow: {
    position: 'absolute',
    top: -120,
    left: -60,
    right: -60,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(162, 240, 239, 0.15)',
    zIndex: 0,
  },
  ambientHeaderGlow2: {
    position: 'absolute',
    top: -50,
    left: '20%',
    width: '60%',
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(13, 107, 107, 0.04)',
    zIndex: 0,
  },

  // Premium progress tracker styles
  premiumProgressContainer: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.08)',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
    marginBottom: 16,
  },
  progressTextRow: {
    marginBottom: 10,
  },
  progressSub: {
    fontFamily: font.bold,
    fontSize: 10,
    color: colors.brand,
    letterSpacing: 1.2,
  },
  progressTitle: {
    fontFamily: font.bold,
    fontSize: type.lg,
    color: colors.ink,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.slate200,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  miniStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  miniStepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStepDotActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  miniStepDotCompleted: {
    backgroundColor: colors.brandSoft,
    borderColor: 'rgba(13, 148, 136, 0.2)',
  },
  miniStepText: {
    fontFamily: font.semiBold,
    fontSize: type.sm,
    color: colors.slate400,
  },
  miniStepTextActive: {
    color: colors.white,
  },
  miniStepTextCompleted: {
    color: colors.brand,
  },

  // Review section header
  reviewSectionHeader: {
    fontFamily: font.bold,
    fontSize: type.sm,
    color: colors.brand,
    letterSpacing: 1.0,
    marginTop: 10,
    marginBottom: 8,
  },
  reviewDocsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  reviewDocBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    width: '48%',
    minHeight: 44,
  },
  reviewDocBadgeReady: {
    backgroundColor: colors.successBg,
    borderColor: 'rgba(16, 185, 129, 0.12)',
  },
  reviewDocBadgeEmpty: {
    backgroundColor: colors.slate50,
    borderColor: colors.slate200,
  },
  reviewDocBadgeTextCol: {
    flex: 1,
  },
  reviewDocBadgeLabel: {
    fontFamily: font.semiBold,
    fontSize: 9,
    color: colors.slate500,
  },
  reviewDocBadgeFileName: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.ink,
    marginTop: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.teal50,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brandSoft,
  },
  infoBannerText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: type.sm,
    color: colors.teal800,
    lineHeight: leading.sm,
  },

  // Security widget styles
  securityWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.slate50,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginTop: 6,
    marginBottom: 12,
  },
  securityTitle: {
    fontFamily: font.bold,
    fontSize: type.sm,
    color: colors.ink,
  },
  securityDesc: {
    fontFamily: font.regular,
    fontSize: type.xs,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 1,
  },
})
