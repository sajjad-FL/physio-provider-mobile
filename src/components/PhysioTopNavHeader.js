import { View } from 'react-native'
import Toast from 'react-native-toast-message'
import TopNavHeader from './ui/TopNavHeader'
import PhysioApprovalBanner from './physio/PhysioApprovalBanner'
import { useAuth } from '../context/AuthContext'
import { isRouteLockedWhilePending, usePhysioWorkspaceOptional } from '../context/PhysioWorkspaceContext'

export default function PhysioTopNavHeader({ navigation }) {
  const { logout } = useAuth()
  const ws = usePhysioWorkspaceOptional()
  const physioName = String(ws?.me?.name || 'Physiotherapist').trim()
  const pending = Boolean(ws?.me && ws?.platformApproved === false)

  const menuItems = [{ label: `Signed in as ${physioName}`, route: '__noop' }, { label: 'Profile', route: 'ProfileGlobal' }, { label: 'Hub', route: 'PhysioHubTab' }]
  const sideItems = [
    { label: 'Bookings', route: 'PhysioDashboard' },
    { label: 'Wallet', route: 'PhysioWalletTab' },
  ]

  const rootNav = navigation.getParent()?.getParent() || navigation

  const onNavigate = (route) => {
    if (route === '__noop') return
    if (pending && isRouteLockedWhilePending(route)) {
      Toast.show({ type: 'info', text1: 'Available after approval', text2: 'An admin is reviewing your application.' })
      return
    }
    if (route === 'ProfileGlobal') return rootNav.navigate('ProfileGlobal')
    if (route === 'PhysioDashboard') return navigation.navigate('PhysioDashboard', { screen: 'PhysioBookingsList' })
    return navigation.navigate(route)
  }

  return (
    <View>
      <TopNavHeader
        title="Workspace"
        subtitle="Sessions & availability"
        menuItems={menuItems}
        sideItems={sideItems}
        onNavigate={onNavigate}
        onLogout={() => logout(rootNav)}
      />
      {/* Web PhysioLayout shows this above every /physio/* page until approved. */}
      {pending ? (
        <View style={{ paddingTop: 12 }}>
          <PhysioApprovalBanner
            rejected={ws.rejected}
            onPressOnboarding={() => rootNav.navigate('PhysioOnboarding')}
            onPressProfile={() => rootNav.navigate('ProfileGlobal')}
          />
        </View>
      ) : null}
    </View>
  )
}
