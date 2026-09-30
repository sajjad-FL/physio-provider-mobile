export function getPainColor(val) {
  if (val <= 3) return '#10b981'
  if (val <= 6) return '#f59e0b'
  if (val <= 8) return '#f97316'
  return '#ef4444'
}

export function getPainBgColor(val) {
  if (val <= 3) return 'rgba(16, 185, 129, 0.15)'
  if (val <= 6) return 'rgba(245, 158, 11, 0.15)'
  if (val <= 8) return 'rgba(249, 115, 22, 0.15)'
  return 'rgba(239, 68, 68, 0.15)'
}

export function getPainLabel(val) {
  if (val <= 3) return 'Mild'
  if (val <= 6) return 'Moderate'
  if (val <= 8) return 'Severe'
  return 'Extreme'
}

export function getPainEmoji(val) {
  if (val <= 3) return '😊'
  if (val <= 6) return '😐'
  if (val <= 8) return '😟'
  return '😫'
}

export function getClinicalGuideTitle(val) {
  if (val <= 3) return 'Mild Discomfort'
  if (val <= 6) return 'Moderate Pain'
  if (val <= 8) return 'Severe Pain'
  return 'Extreme Pain'
}

export function getClinicalGuideDesc(val) {
  if (val <= 3) {
    return 'Rehab focus: gentle mobility exercises and light active stretching to recover joint range of motion. Safe for home routines.'
  }
  if (val <= 6) {
    return 'Rehab focus: progressive load management, active stabilization, and customized strength routines.'
  }
  if (val <= 8) {
    return 'Rehab focus: passive pain-relief modalities, gentle manual therapy, and joint mobilization. Avoid loading.'
  }
  return 'Rehab focus: strict pain control, postural unloading, and emergency-safe gentle manual care under direct senior oversight.'
}
