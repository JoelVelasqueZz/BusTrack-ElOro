import { useEffect, useState } from 'react'

const THRESHOLD_KEY = 'bustrack_notify_minutes'
const DEFAULT_THRESHOLD = 2
const MIN_THRESHOLD = 1
const MAX_THRESHOLD = 15

function isValidThreshold(value) {
  return Number.isFinite(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD
}

function readStoredThreshold() {
  const raw = Number(localStorage.getItem(THRESHOLD_KEY))
  return isValidThreshold(raw) ? raw : DEFAULT_THRESHOLD
}

export function useNotifyThreshold() {
  const [thresholdMinutes, setThresholdMinutes] = useState(readStoredThreshold)

  useEffect(() => {
    localStorage.setItem(THRESHOLD_KEY, String(thresholdMinutes))
  }, [thresholdMinutes])

  const setThreshold = (value) => {
    const parsed = Number(value)
    if (isValidThreshold(parsed)) setThresholdMinutes(parsed)
  }

  return { thresholdMinutes, setThreshold }
}
