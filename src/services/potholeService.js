import { ref, push, serverTimestamp } from 'firebase/database'
import { db } from '../firebase.js'

export function reportPothole({ lat, lng, magnitude, busId }) {
  return push(ref(db, 'potholes'), {
    lat,
    lng,
    magnitude,
    busId,
    reportedAt: serverTimestamp(),
  })
}
