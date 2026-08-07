import { StyleSheet, Platform, StatusBar } from 'react-native';
import { COLORS } from './colors';

// Στυλ ειδικά για τις οθόνες του γιατρού (header, search, ιστορικό, πλαϊνό μενού)
export const doctorStyles = StyleSheet.create({
  /* Header της οθόνης γιατρού (menu + avatar) */
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 15 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, marginHorizontal: 20, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: 16, color: COLORS.text },

  /* Κουμπί "+ Αίτημα Πρόσβασης" */
  requestAccessButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    marginHorizontal: 20,
    marginBottom: 15,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAccessButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },

  dashboardLabel: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  dashboardTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginTop: 10, marginBottom: 10 },

  /* Οθόνη Ιστορικού ασθενή (κατηγορίες φακέλου) */
  historyHeader: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: 10, marginBottom: 10, minHeight: 40 },
  historyBackButton: { position: 'absolute', left: 20, top: 0 },
  historyTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  historyAmka: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary, paddingHorizontal: 20, marginTop: 10, marginBottom: 20 },
  historyAmkaValue: { fontWeight: 'normal' },
  historyCategoryButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginBottom: 15 },
  historyCategoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },

  /* Οθόνη Διαγνώσεων */
  diagnosisCategoryRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 20 },
  diagnosisCategoryButton: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, marginHorizontal: 8 },
  diagnosisCategoryButtonActive: { backgroundColor: COLORS.primary },
  diagnosisCategoryButtonInactive: { backgroundColor: COLORS.medium },
  diagnosisCategoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 14 },
  diagnosisSortButton: { backgroundColor: COLORS.lightest, borderWidth: 1, borderColor: COLORS.primary, paddingVertical: 12, borderRadius: 25, alignItems: 'center', marginHorizontal: 20, marginBottom: 15 },
  diagnosisSortButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 15 },
  diagnosisCard: { backgroundColor: COLORS.light, borderRadius: 15, padding: 16, marginHorizontal: 20, marginBottom: 12 },
  diagnosisCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisCardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, flex: 1, marginRight: 10 },
  diagnosisCardDetail: { fontSize: 13, color: COLORS.text, marginTop: 6 },
  diagnosisCardLabel: { fontWeight: 'bold' },

  container: {
    flex: 1,
    backgroundColor: COLORS.lightest,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  /* Πλαϊνό μενού γιατρού (drawer) */
  menuOverlay: { flex: 1, flexDirection: 'row' },
  menuPanel: {
    width: '75%',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 60,
    paddingBottom: 40,
  },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  menuItems: { alignItems: 'center', marginTop: 40 },
  menuItemText: { color: COLORS.white, fontSize: 20, fontWeight: 'bold', marginVertical: 18 },
  menuLogoutButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
  menuLogoutText: { color: COLORS.white, fontSize: 16, fontWeight: '600', marginLeft: 8 },
});
