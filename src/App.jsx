import { RoleProvider, useRole } from './context/RoleContext.jsx'
import { RoleSelector } from './components/RoleSelector.jsx'
import { ConductorView } from './components/conductor/ConductorView.jsx'
import { PassengerView } from './components/passenger/PassengerView.jsx'

function AppContent() {
  const { role } = useRole()

  if (role === 'conductor') {
    return <ConductorView />
  }

  if (role === 'pasajero') {
    return <PassengerView />
  }

  return <RoleSelector />
}

function App() {
  return (
    <RoleProvider>
      <AppContent />
    </RoleProvider>
  )
}

export default App
