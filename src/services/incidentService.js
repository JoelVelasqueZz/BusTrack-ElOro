import { ref, set, serverTimestamp } from 'firebase/database'
import { db } from '../firebase.js'

export function reportIncident(busId, { type, note }) {
  return set(ref(db, `buses/${busId}/incident`), {
    type,
    note: note?.trim() || null,
    reportedAt: serverTimestamp(),
  })
}

export function resolveIncident(busId) {
  return set(ref(db, `buses/${busId}/incident`), null)
}
