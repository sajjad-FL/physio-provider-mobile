import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../theme/colors'
import { font, type, leading } from '../../theme/typography'

export default function PhysioApprovalBanner({ rejected, onPressOnboarding, onPressProfile }) {
  return (
    <View
      style={[
        styles.wrap,
        rejected ? { borderColor: '#fecaca', backgroundColor: '#fef2f2' } : { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
      ]}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.iconBox,
            rejected ? { backgroundColor: '#fee2e2' } : { backgroundColor: colors.amber100 },
          ]}
        >
          <Text style={styles.iconTxt}>{rejected ? '⚠' : '⏳'}</Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, rejected ? { color: '#7f1d1d' } : { color: colors.amber950 }]}>
            {rejected ? 'Profile not approved' : 'Your profile is under approval'}
          </Text>
          {rejected ? (
            <>
              <Text style={styles.p}>
                Your application was rejected. Update your documents and details, then resubmit from onboarding — or contact support if you need help.
              </Text>
              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.btnPri]} onPress={onPressOnboarding}>
                  <Text style={styles.btnPriTxt}>Review & resubmit</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnOut]} onPress={onPressProfile}>
                  <Text style={styles.btnOutTxt}>Edit profile</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.p}>
                An admin is reviewing your application. Bookings, wallet, and availability stay locked until you&apos;re approved. You can still update your profile and onboarding documents.
              </Text>
              <Text style={styles.tip}>Tip: complete every onboarding step to speed up review.</Text>
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: { fontSize: 18 },
  body: { flex: 1 },
  title: { fontFamily: font.semiBold, fontSize: type.lg, lineHeight: leading.lg },
  p: { marginTop: 8, fontFamily: font.regular, fontSize: type.base, lineHeight: leading.base, color: colors.slate900 },
  tip: { marginTop: 10, fontFamily: font.medium, fontSize: type.sm, lineHeight: leading.sm, color: colors.amber800 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnPri: { backgroundColor: '#b91c1c' },
  btnPriTxt: { color: '#fff', fontFamily: font.semiBold, fontSize: type.base },
  btnOut: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  btnOutTxt: { color: '#7f1d1d', fontFamily: font.semiBold, fontSize: type.base },
})
