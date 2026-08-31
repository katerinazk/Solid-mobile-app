import React, { useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { usePatientAccessList } from '../../../hooks/usePatientAccessList';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { addAccess, deleteAccess, updateAccessType } from '../../../services/access';
import { updatePodAcl, removeDoctorFromAcl } from '../../../services/solidPod';

export default function PatientHomeScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl, logout } = useAuth();
  const { accessList, setAccessList, loading, setLoading, refresh } = usePatientAccessList();

  const [isAddAccessModalVisible, setIsAddAccessModalVisible] = useState(false);
  const [newDoctorAmka, setNewDoctorAmka] = useState('');
  const [newAccessType, setNewAccessType] = useState('Πλήρης Πρόσβαση');

  const handleAddAccess = async () => {
    if (!newDoctorAmka) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του γιατρού.");
      return;
    }
    try {
      setLoading(true);

      const { data: doctorData, error: doctorError } = await fetchDoctorByAmka(newDoctorAmka);

      if (doctorError || !doctorData) {
        alert("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return;
      }

      const { error } = await addAccess(loggedInPatientAmka, newDoctorAmka, newAccessType);

      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      await updatePodAcl({
        activePatientFolderUrl,
        accessToken,
        accessList,
        newDoctorWebId: doctorData.web_id,
        accessType: newAccessType,
      });
      alert(`Η πρόσβαση στον Δρ. ${doctorData.last_name} δόθηκε επιτυχώς!`);
      setNewDoctorAmka('');
      setIsAddAccessModalVisible(false);
      refresh();
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccess = async (doctorAmka: string) => {
    Alert.alert("Κατάργηση", "Θέλετε να αφαιρέσετε αυτή την πρόσβαση;", [
      { text: "Ακύρωση", style: "cancel" },
      {
        text: "Κατάργηση",
        style: "destructive",
        onPress: async () => {
          const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
          const doctorWebId = doctorEntry?.doctors?.web_id;
          const { error } = await deleteAccess(loggedInPatientAmka, doctorAmka);

          if (!error) {
            if (doctorWebId) {
              await removeDoctorFromAcl({
                activePatientFolderUrl,
                accessToken,
                accessList,
                doctorWebId,
              });
            }
            setAccessList(prev => prev.filter(a => a.doctor_amka !== doctorAmka));
            alert("Η πρόσβαση καταργήθηκε επιτυχώς!");
          }
        }
      }
    ]);
  };

  const handleChangeAccessType = async (doctorAmka: string, currentType: string) => {
    const newType = currentType === 'Πλήρης Πρόσβαση' ? 'Μόνο Ανάγνωση' : 'Πλήρης Πρόσβαση';

    const { error } = await updateAccessType(loggedInPatientAmka, doctorAmka, newType);

    if (error) { alert("Σφάλμα: " + error.message); return; }

    const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
    if (doctorEntry?.doctors?.web_id) {
      await updatePodAcl({
        activePatientFolderUrl,
        accessToken,
        accessList,
        newDoctorWebId: doctorEntry.doctors.web_id,
        accessType: newType,
      });
    }

    setAccessList(prev => prev.map(a =>
      a.doctor_amka === doctorAmka ? { ...a, access_type: newType } : a
    ));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => alert('Η λειτουργία έρχεται σύντομα.')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="menu" size={28} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={accessList}
        keyExtractor={(item) => item.doctor_amka}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin, flexGrow: 1 }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => setIsAddAccessModalVisible(true)}>
                <Text style={styles.addButtonText}>+ Προσθήκη Πρόσβασης</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}>
                <Text style={styles.addButtonText}>Αιτήματα</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              <Text style={[localStyles.sectionTitle, { marginBottom: SPACING.sectionGap }]}>Προσβάσεις</Text>
              <View style={{ width: '70%', alignSelf: 'center' }}>
                <Text style={localStyles.searchLabel}>Αναζήτηση γιατρού:</Text>
                <View style={[localStyles.searchContainer, { marginHorizontal: 0 }]}>
                  <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <TextInput style={localStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
                </View>
              </View>
            </View>

            <TouchableOpacity style={localStyles.sortButton} onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}>
              <Text style={localStyles.sortButtonText}>↕  Όλες οι προσβάσεις</Text>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν έχετε δώσει πρόσβαση σε κανέναν γιατρό.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={localStyles.card}>
            <Text style={localStyles.doctorName}>
              Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
            </Text>
            <Text style={localStyles.specialty}>{item.doctors?.specialty}</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={localStyles.typeLabel}>Τύπος πρόσβασης: </Text>
              <TouchableOpacity
                style={localStyles.typePill}
                onPress={() => handleChangeAccessType(item.doctor_amka, item.access_type)}
              >
                <Text style={localStyles.typePillText}>{item.access_type}</Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={localStyles.removeButton} onPress={() => handleDeleteAccess(item.doctor_amka)}>
              <Text style={localStyles.removeButtonText}>Κατάργηση</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Modal Προσθήκης Πρόσβασης */}
      <Modal animationType="slide" transparent={true} visible={isAddAccessModalVisible} onRequestClose={() => setIsAddAccessModalVisible(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Νέα Πρόσβαση</Text>

            <Text style={loginStyles.inputLabel}>ΑΜΚΑ Γιατρού</Text>
            <TextInput
              style={loginStyles.loginInput}
              placeholder="11 ψηφία"
              keyboardType="numeric"
              value={newDoctorAmka}
              onChangeText={setNewDoctorAmka}
            />

            <Text style={loginStyles.inputLabel}>Τύπος Πρόσβασης</Text>
            <View style={{ flexDirection: 'row', marginBottom: 20 }}>
              <TouchableOpacity
                style={[styles.modalButton, { flex: 1, marginRight: 5, backgroundColor: newAccessType === 'Πλήρης Πρόσβαση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
                onPress={() => setNewAccessType('Πλήρης Πρόσβαση')}
              >
                <Text style={{ color: newAccessType === 'Πλήρης Πρόσβαση' ? COLORS.white : COLORS.text, textAlign: 'center' }}>Πλήρης</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { flex: 1, marginLeft: 5, backgroundColor: newAccessType === 'Μόνο Ανάγνωση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
                onPress={() => setNewAccessType('Μόνο Ανάγνωση')}
              >
                <Text style={{ color: newAccessType === 'Μόνο Ανάγνωση' ? COLORS.white : COLORS.text, textAlign: 'center' }}>Μόνο Ανάγνωση</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsAddAccessModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddAccess} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Εντάξει</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  sectionTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap },
  searchLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, marginHorizontal: SPACING.sideMargin, paddingHorizontal: 15, marginBottom: SPACING.sectionGap, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  sortButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, justifyContent: 'center', alignItems: 'center', borderRadius: 25, marginHorizontal: SPACING.sideMargin, marginBottom: SPACING.sectionGap },
  sortButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  card: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  doctorName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  specialty: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2, marginBottom: SPACING.groupGap },
  typeLabel: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  typePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8 },
  typePillText: { color: COLORS.primary, fontWeight: '600', fontSize: TYPOGRAPHY.secondaryText },
  removeButton: { backgroundColor: COLORS.danger, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  removeButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
