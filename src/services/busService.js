import { ref, onValue, off } from 'firebase/database'
import { db } from '../firebase.js'

export function subscribeBuses(callback) {
  const busesRef = ref(db, 'buses')

  const handler = (snapshot) => {
    const value = snapshot.val() || {}
    const buses = Object.values(value).filter((bus) => bus.active)
    callback(buses)
  }

  onValue(busesRef, handler)

  return () => off(busesRef, 'value', handler)
}
