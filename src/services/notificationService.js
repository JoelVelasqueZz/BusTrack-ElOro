import { LocalNotifications } from '@capacitor/local-notifications'

let lastNotifiedBusId = null

export async function requestPermission() {
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

export async function notifyBusNear(busNumber, minutes, busId) {
  if (lastNotifiedBusId === busId) return
  lastNotifiedBusId = busId

  await LocalNotifications.schedule({
    notifications: [
      {
        id: Date.now() % 2147483647,
        title: 'Bus cerca',
        body: `El bus ${busNumber} llega en ~${Math.max(Math.round(minutes), 0)} min`,
      },
    ],
  })
}

export function resetNotificationGuard() {
  lastNotifiedBusId = null
}
