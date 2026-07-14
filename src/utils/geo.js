const EARTH_RADIUS_M = 6371000
const MIN_SPEED_KMH = 5

const toRad = (deg) => (deg * Math.PI) / 180

export function haversine([lat1, lng1], [lat2, lng2]) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

function projectOnSegment([lat, lng], [lat1, lng1], [lat2, lng2]) {
  const dx = lng2 - lng1
  const dy = lat2 - lat1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return [lat1, lng1]

  let t = ((lng - lng1) * dx + (lat - lat1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return [lat1 + t * dy, lng1 + t * dx]
}

export function nearestPointOnPath(point, path) {
  if (!path || path.length === 0) {
    return { point, segmentIndex: 0, distanceFromPath: 0 }
  }
  if (path.length === 1) {
    return { point: path[0], segmentIndex: 0, distanceFromPath: haversine(point, path[0]) }
  }

  let best = null
  for (let i = 0; i < path.length - 1; i++) {
    const projected = projectOnSegment(point, path[i], path[i + 1])
    const distance = haversine(point, projected)
    if (!best || distance < best.distanceFromPath) {
      best = { point: projected, segmentIndex: i, distanceFromPath: distance }
    }
  }
  return best
}

export function distanceAlongPath(path, projected) {
  let distance = 0
  for (let i = 0; i < projected.segmentIndex; i++) {
    distance += haversine(path[i], path[i + 1])
  }
  distance += haversine(path[projected.segmentIndex], projected.point)
  return distance
}

export function computeEta({ busPosition, busSpeedKmh, stopPosition, path, thresholdMinutes = 2 }) {
  const speedKmh = Math.max(busSpeedKmh || 0, MIN_SPEED_KMH)
  const speedMetersPerMin = (speedKmh * 1000) / 60

  let distanceMeters
  if (path && path.length >= 2) {
    const busProjected = nearestPointOnPath(busPosition, path)
    const stopProjected = nearestPointOnPath(stopPosition, path)
    const busDistance = distanceAlongPath(path, busProjected)
    const stopDistance = distanceAlongPath(path, stopProjected)
    distanceMeters = Math.max(stopDistance - busDistance, 0)
  } else {
    distanceMeters = haversine(busPosition, stopPosition)
  }

  const etaMinutes = distanceMeters / speedMetersPerMin

  return {
    etaMinutes,
    distanceMeters,
    withinThreshold: etaMinutes <= thresholdMinutes,
  }
}
