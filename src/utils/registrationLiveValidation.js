import { isPhysioDegreeOption } from '../constants/physioQualification'
import { isValidIdProofType } from '../constants/idProofTypes'
import { validateIndianMobile } from './phoneIndia'
import { validateAvatarFile, validateEmailOptional, validateFileAsset } from './onboardingValidation'

/** Returns '' when valid, otherwise an error message (registration form live feedback). */
export function validateRegistrationLiveField(name, value, ctx = {}) {
  const str = value === undefined || value === null ? '' : String(value)

  switch (name) {
    case 'name': {
      const t = str.trim()
      if (!t) return 'Full name is required'
      if (t.length < 2) return 'Name must be at least 2 characters'
      if (t.length > 120) return 'Name is too long'
      return ''
    }
    case 'phone': {
      const pv = validateIndianMobile(str)
      return pv.valid ? '' : pv.message
    }
    case 'password': {
      if (!str) return 'Password must be at least 6 characters'
      if (str.length < 6) return 'Password must be at least 6 characters'
      return ''
    }
    case 'email': {
      const t = str.trim()
      if (!t) return 'Email is required'
      const c = validateEmailOptional(t)
      return c.ok ? '' : c.message
    }
    case 'dob': {
      if (!str.trim()) return ''
      const d = new Date(str)
      if (Number.isNaN(d.getTime())) return 'Invalid date of birth'
      const now = new Date()
      if (d > now) return 'Date of birth cannot be in the future'
      const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      if (age < 18) return 'You must be at least 18 years old'
      if (age > 100) return 'Please check the date of birth'
      return ''
    }
    case 'gender': {
      const g = str.trim()
      if (!g) return ''
      if (!['female', 'male', 'other', 'prefer_not_to_say'].includes(g)) return 'Select a valid option'
      return ''
    }
    case 'location': {
      const t = str.trim()
      const lat = ctx.locationLat
      const lng = ctx.locationLng
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return 'Pick on map or use GPS to set your coverage area (required).'
      }
      if (!t) return 'Coverage / location is required'
      if (t.length < 2) return 'Location must be at least 2 characters'
      if (t.length > 300) return 'Location is too long'
      return ''
    }
    case 'avatar': {
      if (!value || typeof value !== 'object') return 'Passport size photo is required'
      const r = validateAvatarFile(value, { required: true })
      return r.ok ? '' : r.message
    }
    case 'degree': {
      const t = str.trim()
      if (!t) return 'Degree is required'
      if (!isPhysioDegreeOption(t)) return 'Select BPT or MPT'
      return ''
    }
    case 'university': {
      const t = str.trim()
      if (!t) return 'University is required'
      if (t.length > 200) return 'University name is too long'
      return ''
    }
    case 'year': {
      if (str === '') return 'Passing year is required'
      const y = Number(str)
      const current = new Date().getFullYear()
      if (!Number.isFinite(y)) return 'Enter a valid passing year'
      if (y < 1950 || y > current + 1) return `Passing year must be between 1950 and ${current + 1}`
      return ''
    }
    case 'registrationNumber': {
      const t = str.trim()
      if (!t) return ''
      if (t.length < 3) return 'Council registration number is too short'
      if (t.length > 80) return 'Council registration number is too long'
      return ''
    }
    case 'experience': {
      if (str === '') return 'Experience (years) is required'
      const e = Number(str)
      if (!Number.isFinite(e) || e < 0) return 'Enter a valid number of years'
      if (e > 80) return 'Enter a realistic experience value'
      return ''
    }
    case 'specialization': {
      const t = str.trim()
      if (!t) return 'Specialization is required'
      if (t.length < 2) return 'Specialization must be at least 2 characters'
      if (t.length > 120) return 'Specialization is too long'
      return ''
    }
    case 'serviceType': {
      if (str && !['online', 'home', 'both'].includes(str)) return 'Invalid service type'
      return ''
    }
    case 'areas': {
      const areaList = str
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (areaList.length === 0) return 'Add at least one service area'
      return ''
    }
    case 'idProofType': {
      const t = str.trim().toLowerCase()
      if (!t) return 'Select GOVT ID type (Aadhaar, PAN, Passport, or Voter ID)'
      return isValidIdProofType(t) ? '' : 'Select GOVT ID type (Aadhaar, PAN, Passport, or Voter ID)'
    }
    case 'certificate':
    case 'idProof':
    case 'registrationCertificate':
    case 'selfieWithId':
    case 'internshipCertificate': {
      if (!value || typeof value !== 'object') return ''
      const r = validateFileAsset(value, 'File')
      return r.ok ? '' : r.message
    }
    default:
      return ''
  }
}

export function hasVisibleFieldErrors(errors = {}) {
  return Object.values(errors).some(Boolean)
}
