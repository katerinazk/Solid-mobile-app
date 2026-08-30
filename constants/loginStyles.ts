import { StyleSheet } from 'react-native';
import { COLORS } from './colors';
import { TYPOGRAPHY, SPACING, TOUCH } from './designSystem';

// Κοινά στυλ για τις οθόνες login/εγγραφής (ασθενή & γιατρού)
export const loginStyles = StyleSheet.create({
  loginContainer: { flex: 1, backgroundColor: COLORS.lightest, padding: SPACING.sideMargin, justifyContent: 'center' },
  backButton: { position: 'absolute', top: SPACING.topMargin, left: SPACING.sideMargin, zIndex: 10 },
  loginCard: { padding: 10 },
  loginTitle: { fontSize: TYPOGRAPHY.mainTitle, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center', marginBottom: 5 },
  loginSubtitle: { fontSize: TYPOGRAPHY.subtitle, color: COLORS.primary, textAlign: 'center', marginBottom: 40 },
  inputLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  loginInput: { backgroundColor: COLORS.white, borderRadius: 10, padding: 15, minHeight: TOUCH.minTargetSize, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginBottom: 30 },
  solidLoginButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  solidLoginButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
