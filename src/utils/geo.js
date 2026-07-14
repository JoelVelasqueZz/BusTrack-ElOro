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

function pathTotalLength(path) {
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    total += haversine(path[i], path[i + 1])
  }
  return total
}

// La mayoría de las rutas son loops cerrados (ida+vuelta combinadas en un
// solo trazado, inicio y fin casi en el mismo punto). Si la parada queda
// "detrás" del bus en la numeración del trazado, no significa que esté a
// 0m — significa que el bus ya pasó y tiene que dar toda la vuelta para
// volver a llegar. Solo se envuelve así cuando el trazado realmente cierra
// (gap inicio/fin chico); si no, es una ruta abierta y no hay vuelta que dar.
const LOOP_GAP_METERS = 200

// Cuando ida y vuelta pasan cerca una de la otra (misma calle, sentido
// contrario), el bus y la parada pueden "engancharse" a tramos distintos
// del trazado combinado aunque estén físicamente pegados — el resultado es
// una distancia por trazado absurdamente mayor a la distancia real en línea
// recta. Si eso pasa (más de DETOUR_FACTOR veces la distancia recta), no es
// un rodeo real: es el trazado confundiendo el tramo. Se usa la distancia
// recta en su lugar.
const DETOUR_FACTOR = 5

export function computeEta({ busPosition, busSpeedKmh, stopPosition, path, thresholdMinutes = 2 }) {
  const speedKmh = Math.max(busSpeedKmh || 0, MIN_SPEED_KMH)
  const speedMetersPerMin = (speedKmh * 1000) / 60

  let distanceMeters
  if (path && path.length >= 2) {
    const busProjected = nearestPointOnPath(busPosition, path)
    const stopProjected = nearestPointOnPath(stopPosition, path)
    const busDistance = distanceAlongPath(path, busProjected)
    const stopDistance = distanceAlongPath(path, stopProjected)
    distanceMeters = stopDistance - busDistance
    if (distanceMeters < 0) {
      const loopGap = haversine(path[0], path[path.length - 1])
      distanceMeters = loopGap <= LOOP_GAP_METERS ? distanceMeters + pathTotalLength(path) : 0
    }

    const straightLineMeters = haversine(busPosition, stopPosition)
    if (distanceMeters > straightLineMeters * DETOUR_FACTOR) {
      distanceMeters = straightLineMeters
    }
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
