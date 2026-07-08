import { ref, runTransaction } from 'firebase/database'
import { db } from '../firebase.js'

export async function assignBusUnit(routeId, numero) {
  const counterRef = ref(db, `unitCounters/${routeId}_${numero}`)
  const result = await runTransaction(counterRef, (current) => (current || 0) + 1)
  const suffix = result.snapshot.val()
  return {
    busId: `${routeId}-${numero}-${suffix}`,
    unitLabel: `${numero}-${suffix}`,
  }
}
