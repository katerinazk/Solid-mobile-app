import { StyleSheet, Platform, StatusBar } from 'react-native';
import { COLORS } from './colors';
import { TYPOGRAPHY, SPACING, TOUCH } from './designSystem';

// Στυλ ειδικά για τις οθόνες του γιατρού (header, search, ιστορικό, πλαϊνό μενού)
export const doctorStyles = StyleSheet.create({
  /* Header της οθόνης γιατρού (menu + avatar) */
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, paddingTop: 10, marginBottom: 15 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, marginHorizontal: SPACING.sideMargin, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },

  /* Κουμπί "+ Αίτημα Πρόσβασης" */
  requestAccessButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.sideMargin,
    marginBottom: TOUCH.buttonGap,
    minHeight: TOUCH.buttonHeight,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAccessButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: TYPOGRAPHY.bodyText,
    marginLeft: 8,
  },

  dashboardLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  dashboardTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: 10, marginBottom: 10 },

  /* Οθόνη Ιστορικού ασθενή (κατηγορίες φακέλου) */
  historyHeader: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10, marginBottom: 10, minHeight: 40 },
  historyBackButton: { position: 'absolute', left: SPACING.sideMargin, top: 0 },
  historyTitle: { fontSize: TYPOGRAPHY.mainTitle, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  historyAmka: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: 'bold', color: COLORS.primary, paddingHorizontal: SPACING.sideMargin, marginTop: 10, marginBottom: SPACING.sectionGap },
  historyAmkaValue: { fontWeight: 'normal' },
  historyCategoryButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, justifyContent: 'center', borderRadius: 25, alignItems: 'center', marginBottom: TOUCH.buttonGap },
  historyCategoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },

  /* Οθόνη Διαγνώσεων */
  diagnosisCategoryRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: SPACING.sideMargin, marginBottom: SPACING.sectionGap },
  diagnosisCategoryButton: { minHeight: TOUCH.minTargetSize, justifyContent: 'center', paddingHorizontal: 24, borderRadius: 20, marginHorizontal: SPACING.groupGap },
  diagnosisCategoryButtonActive: { backgroundColor: COLORS.primary },
  diagnosisCategoryButtonInactive: { backgroundColor: COLORS.medium },
  diagnosisCategoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText, textAlign: 'center' },
  diagnosisSortButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, justifyContent: 'center', borderRadius: 25, alignItems: 'center', marginHorizontal: SPACING.sideMargin, marginBottom: TOUCH.buttonGap },
  diagnosisSortButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  diagnosisCard: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  diagnosisCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisCardTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, flex: 1, marginRight: 10 },
  diagnosisCardDetail: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginTop: 6 },
  diagnosisCardLabel: { fontWeight: 'bold' },

  container: {
    flex: 1,
    backgroundColor: COLORS.lightest,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

});
