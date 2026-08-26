import React, { useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={{ fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.text }}>Οι Προσβάσεις μου</Text>
        <TouchableOpacity onPress={logout}>
          <Ionicons name="log-out-outline" size={36} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.addButton, { marginHorizontal: SPACING.sideMargin, marginBottom: TOUCH.buttonGap }]} onPress={() => setIsAddAccessModalVisible(true)}>
        <Text style={styles.addButtonText}>+ Προσθήκη Πρόσβασης</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
        accessList.length === 0 ? (
          <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν έχετε δώσει πρόσβαση σε κανέναν γιατρό.</Text>
        ) : (
          <FlatList
            data={accessList}
            keyExtractor={(item) => item.doctor_amka}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardDetails}>
                  <Text style={styles.patientName}>
                    Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
                  </Text>
                  <Text style={styles.cardLabel}>Ειδικότητα: <Text style={styles.cardValue}>{item.doctors?.specialty}</Text></Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                    <Text style={styles.cardLabel}>Τύπος πρόσβασης: </Text>
                    <TouchableOpacity
                      onPress={() => handleChangeAccessType(item.doctor_amka, item.access_type)}
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: item.access_type === 'Πλήρης Πρόσβαση' ? COLORS.primary : COLORS.medium,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                        marginTop: 5,
                      }}
                    >
                      <Text style={{ color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText }}>
                        {item.access_type} ✎
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity style={[styles.cardActionButton, { backgroundColor: COLORS.danger }]} onPress={() => handleDeleteAccess(item.doctor_amka)}>
                  <Text style={styles.cardActionButtonText}>Κατάργηση</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )
      )}

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
