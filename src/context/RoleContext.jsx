import { createContext, useContext, useState, useEffect } from 'react'

const RoleContext = createContext(null)

const DEVICE_ID_KEY = 'bustrack_device_id'
const ROLE_KEY = 'bustrack_role'

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

export function RoleProvider({ children }) {
  const [deviceId] = useState(getOrCreateDeviceId)
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY) || null)

  useEffect(() => {
    if (role) {
      localStorage.setItem(ROLE_KEY, role)
    } else {
      localStorage.removeItem(ROLE_KEY)
    }
  }, [role])

  const clearRole = () => setRole(null)

  return (
    <RoleContext.Provider value={{ role, setRole, clearRole, deviceId }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const context = useContext(RoleContext)
  if (!context) {
    throw new Error('useRole debe usarse dentro de RoleProvider')
  }
  return context
}
