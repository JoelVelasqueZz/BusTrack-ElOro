import { ref, onValue, off, set } from 'firebase/database'
import { db } from '../firebase.js'

export function subscribeRoutes(callback) {
  const routesRef = ref(db, 'routes')

  const handler = (snapshot) => {
    const value = snapshot.val() || {}
    const routes = Object.entries(value).map(([id, route]) => ({ id, ...route }))
    callback(routes)
  }

  onValue(routesRef, handler)

  return () => off(routesRef, 'value', handler)
}

export function saveRecordedPath(routeId, points) {
  return set(ref(db, `routes/${routeId}/path`), points)
}
