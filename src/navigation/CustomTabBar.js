import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/colors'
import { font } from '../theme/typography'
import { figmaTokens, figmaShadowCard } from '../theme/figmaTokens'
import { setBottomTabBarHeight } from './tabBarMetrics'

export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets()
  const bottomInset = insets.bottom || 12

  return (
    <View
      style={[styles.bar, { bottom: bottomInset }]}
      onLayout={(event) => setBottomTabBarHeight(event.nativeEvent.layout.height + bottomInset)}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const focused = state.index === index

        const label = options.tabBarLabel ?? options.title ?? route.name
        const icon = options.tabBarIcon?.({
          color: focused ? figmaTokens.primary : colors.slate400,
          size: 22,
          focused,
        })
        const badge = options.tabBarBadge

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) {
            navigation.navigate({ name: route.name, merge: true })
          }
        }

        return (
          <Pressable
            key={route.key}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
          >
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              {icon}
              {badge != null && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>{String(badge)}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, focused ? styles.labelActive : styles.labelInactive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingVertical: 8,
    ...figmaShadowCard,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabPressed: { opacity: 0.65 },

  iconWrap: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: figmaTokens.mintSoft,
  },

  label: {
    fontFamily: font.semiBold,
    fontSize: 9,
    marginTop: 2,
  },
  labelActive: { color: figmaTokens.primary },
  labelInactive: { color: colors.slate400 },

  badge: {
    position: 'absolute',
    top: 0,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  badgeText: {
    fontFamily: font.bold,
    fontSize: 9,
    color: colors.white,
    lineHeight: 12,
  },
})
