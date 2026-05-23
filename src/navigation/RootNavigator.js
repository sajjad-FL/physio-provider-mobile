import { ActivityIndicator, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme/colors'
import LoginScreen from '../screens/LoginScreen'
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen'
import UnauthorizedScreen from '../screens/UnauthorizedScreen'
import ProfileScreen from '../screens/ProfileScreen'
import PlaceholderScreen from '../screens/PlaceholderScreen'
import PhysioAvailabilityScreen from '../screens/PhysioAvailabilityScreen'
import PhysioNotesScreen from '../screens/PhysioNotesScreen'
import PhysioDisputesScreen from '../screens/PhysioDisputesScreen'
import PhysioOnboardingScreen from '../screens/PhysioOnboardingScreen'
import PhysioVerificationRedirectScreen from '../screens/PhysioVerificationRedirectScreen'
import RegisterPhysioScreen from '../screens/RegisterPhysioScreen'
import PhysioTabNavigator from './PhysioTabNavigator'
import { defaultNativeStackScreenOptions } from './navLayout'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { ready } = useAuth()

  console.log('[RootNavigator.js] ready:', ready)

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.slate50 }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    )
  }

  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        ...defaultNativeStackScreenOptions,
        headerBackTitleVisible: false,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RegisterPhysio" component={RegisterPhysioScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Unauthorized" component={UnauthorizedScreen} options={{ title: 'Unauthorized' }} />
      <Stack.Screen name="PhysioTabs" component={PhysioTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="ProfileGlobal" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="PhysioAvailability" component={PhysioAvailabilityScreen} options={{ title: 'Availability' }} />
      <Stack.Screen name="PhysioNotes" component={PhysioNotesScreen} options={{ title: 'Clinical notes' }} />
      <Stack.Screen name="PhysioDisputes" component={PhysioDisputesScreen} options={{ title: 'Disputes' }} />
      <Stack.Screen name="PhysioOnboarding" component={PhysioOnboardingScreen} options={{ title: 'Onboarding' }} />
      <Stack.Screen name="PhysioVerification" component={PhysioVerificationRedirectScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}
