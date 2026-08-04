import { StyleSheet, Platform, StatusBar } from 'react-native';
import { COLORS } from './colors';

// Κοινά στυλ (λίστες, κάρτες, modals) - χρησιμοποιούνται τόσο από την οθόνη
// του ασθενή όσο και από του γιατρού.
export const sharedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightest,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 20 },
  addButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  addButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: COLORS.light, borderRadius: 15, padding: 20, marginBottom: 15, elevation: 2 },
  cardDetails: { marginBottom: 15 },
  patientName: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 5 },
  cardLabel: { fontSize: 14, color: COLORS.text },
  cardValue: { fontWeight: 'bold', color: COLORS.text },
  cardActionButton: { backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: 25, alignItems: 'center' },
  cardActionButtonText: { color: COLORS.white, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.lightest, borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '60%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.medium, paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  fileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.light, padding: 15, borderRadius: 10, marginBottom: 10 },
  fileName: { fontSize: 16, color: COLORS.text },
  emptyText: { textAlign: 'center', marginTop: 50, color: COLORS.text },
  addmodalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Ημιδιάφανο μαύρο φόντο
  },
  addmodalContent: {
    width: '85%',
    backgroundColor: COLORS.lightest,
    borderRadius: 15,
    padding: 20,
    elevation: 5, // Σκιά για Android
    shadowColor: '#000', // Σκιά για iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addmodalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: COLORS.text,
    textAlign: 'center',
  },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 8,
    padding: 10,
    height: 100,
    textAlignVertical: 'top', // Σημαντικό για Android
    marginBottom: 20,
    color: COLORS.text,
  },
  modalButtonsGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: COLORS.lightest,
    borderWidth: 1,
    borderColor: COLORS.medium,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});
