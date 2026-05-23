const REGISTRATION_ERROR_KEYS = new Set([
  'phone',
  'password',
  'email',
  'name',
  'location',
  'lat',
  'lng',
  'dob',
  'gender',
  'address',
  'degree',
  'university',
  'year',
  'registrationNumber',
  'experience',
  'specialization',
  'serviceType',
  'areas',
  'feeMin',
  'feeMax',
  'avatar',
  'certificate',
  'idProof',
  'idProofType',
  'registrationCertificate',
  'selfieWithId',
  'internshipCertificate',
  'qualificationDeclaration',
  'file',
])

/** Supports `{ errors: {...} }` and legacy flat `{ field: "message" }` bodies. */
export function extractApiFieldErrors(data) {
  if (!data || typeof data !== 'object') return {}
  if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
    return { ...data.errors }
  }
  const out = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'message' || key === 'errors') continue
    if (typeof value === 'string' && value.trim()) out[key] = value.trim()
  }
  return out
}

/** Drop stale production-only fields and map old messages to current UX copy. */
export function normalizeRegistrationApiErrors(errors = {}) {
  const next = { ...errors }
  delete next.feeMin
  delete next.feeMax

  if (next.password === 'Password must be at least 8 characters') {
    next.password = 'Password must be at least 6 characters'
  }
  if (next.certificate === 'Qualification certificate is required') {
    next.certificate = 'BPT/MPT pass certificate is required'
  }
  if (next.idProof === 'ID proof is required') {
    next.idProof = 'GOVERNMENT ID is required'
  }
  if (next.registrationCertificate === 'Registration certificate is required') {
    delete next.registrationCertificate
  }
  if (next.idProofType === 'Select ID type (Aadhaar, PAN, Passport, or Voter ID)') {
    next.idProofType = 'Select GOVT ID type (Aadhaar, PAN, Passport, or Voter ID)'
  }

  return Object.fromEntries(Object.entries(next).filter(([key]) => REGISTRATION_ERROR_KEYS.has(key)))
}

export function registrationApiFailureMessage(errors = {}, fallback = 'Registration failed') {
  if (errors.feeMin) {
    return 'The server still requires fee per session. Deploy the latest physio-server, then try again.'
  }
  return fallback
}
