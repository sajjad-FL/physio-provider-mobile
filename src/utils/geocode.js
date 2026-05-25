import * as Location from 'expo-location'
import { getMapboxAccessToken } from '../config/mapbox'

function formatExpoGeocodeResult(g) {
  if (!g) return ''
  const parts = [
    g.name,
    g.street,
    g.streetNumber,
    g.subregion,
    g.district,
    g.city,
    g.region,
    g.postalCode,
    g.country,
  ]
    .filter(Boolean)
    .map((x) => String(x).trim())
  return [...new Set(parts)].join(', ')
}

async function mapboxReverseGeocode(lat, lng) {
  const token = getMapboxAccessToken()
  if (!token) return ''
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return ''
  const data = await res.json()
  return String(data.features?.[0]?.place_name || '').trim()
}

async function expoReverseGeocode(lat, lng) {
  try {
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
    return formatExpoGeocodeResult(geo?.[0])
  } catch {
    return ''
  }
}

async function nominatimReverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'PhysiOkhomProvider/1.0',
      },
    })
    if (!res.ok) return ''
    const data = await res.json()
    return String(data.display_name || '').trim()
  } catch {
    return ''
  }
}

/** Resolve coordinates to a human-readable address (Mapbox → device geocoder → OSM). */
export async function reverseGeocodeToAddress(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return ''

  const mapbox = await mapboxReverseGeocode(la, ln)
  if (mapbox) return mapbox

  const expo = await expoReverseGeocode(la, ln)
  if (expo) return expo

  const osm = await nominatimReverseGeocode(la, ln)
  if (osm) return osm

  return ''
}
