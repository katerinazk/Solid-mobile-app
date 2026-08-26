import { StyleSheet } from 'react-native';
import { COLORS } from './colors';
import { TYPOGRAPHY } from './designSystem';

// Κοινά στυλ για τις οθόνες login/εγγραφής (ασθενή & γιατρού)
export const loginStyles = StyleSheet.create({
  loginContainer: { flex: 1, backgroundColor: COLORS.lightest, padding: 20, justifyContent: 'center' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  loginCard: { backgroundColor: COLORS.light, padding: 30, borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  loginTitle: { fontSize: TYPOGRAPHY.mainTitle, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 5 },
  loginSubtitle: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, textAlign: 'center', marginBottom: 40 },
  inputLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  loginInput: { backgroundColor: COLORS.lightest, borderRadius: 10, padding: 15, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginBottom: 30 },
  solidLoginButton: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  solidLoginButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
