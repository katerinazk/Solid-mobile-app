import React, { useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { ROUTES } from '../../../constants/routes';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { SPACING, TYPOGRAPHY } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { Patient } from '../../../types/Patient';
import { fetchPatientByAmka } from '../../../services/patients';
import { hasPendingAccessRequest, createAccessRequest } from '../../../services/accessRequests';

export default function DoctorAccessScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const { patients, loading } = useDoctorPatients();

  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [requestPatientAmka, setRequestPatientAmka] = useState('');
  const [requestAccessType, setRequestAccessType] = useState('Πλήρης Πρόσβαση');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const closeRequestModal = () => {
    setIsRequestModalVisible(false);
    setRequestPatientAmka('');
    setRequestAccessType('Πλήρης Πρόσβαση');
  };

  const handleSubmitAccessRequest = async () => {
    if (!requestPatientAmka.trim()) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του ασθενή.");
      return;
    }

    try {
      setSubmittingRequest(true);

      const { data: patientData, error: patientError } = await fetchPatientByAmka(requestPatientAmka.trim());
      if (patientError || !patientData) {
        alert("Δεν βρέθηκε ασθενής με αυτό το ΑΜΚΑ.");
        return;
      }

      const alreadyHasAccess = patients.some((p) => p.amka === requestPatientAmka.trim());
      if (alreadyHasAccess) {
        alert("Έχετε ήδη πρόσβαση σε αυτόν τον ασθενή.");
        return;
      }

      const { data: pendingRequest } = await hasPendingAccessRequest(loggedInDoctorAmka, requestPatientAmka.trim());
      if (pendingRequest) {
        alert("Υπάρχει ήδη εκκρεμές αίτημα πρόσβασης για αυτόν τον ασθενή.");
        return;
      }

      const { error } = await createAccessRequest(loggedInDoctorAmka, requestPatientAmka.trim(), requestAccessType);
      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      alert("Το αίτημα πρόσβασης στάλθηκε επιτυχώς!");
      closeRequestModal();
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  const renderPatientCard = ({ item }: { item: Patient }) => (
    <View style={[styles.card, { backgroundColor: COLORS.lightest }]}>
      <View style={styles.cardDetails}>
        <Text style={[styles.patientName, { color: COLORS.primary }]}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.cardLabel}>AMKA: <Text style={styles.cardValue}>{item.amka}</Text></Text>
        <Text style={styles.cardLabel}>Τύπος πρόσβασης: <Text style={styles.cardValue}>{item.accessType}</Text></Text>
      </View>
      <TouchableOpacity
        style={styles.cardActionButton}
        onPress={() => router.push({
          pathname: ROUTES.DOCTOR_MED_HISTORY,
          params: {
            amka: item.amka,
            firstName: item.first_name,
            lastName: item.last_name,
            webId: item.webId,
            birthDate: item.birthDate,
            accessType: item.accessType,
          },
        })}
      >
        <Text style={styles.cardActionButtonText}>Προβολή Φακέλου</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />

      <TouchableOpacity
        style={doctorStyles.requestAccessButton}
        onPress={() => setIsRequestModalVisible(true)}
      >
        <Ionicons name="add" size={20} color={COLORS.white} />
        <Text style={doctorStyles.requestAccessButtonText}>Αίτημα Πρόσβασης</Text>
      </TouchableOpacity>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={[doctorStyles.dashboardTitle, { marginBottom: SPACING.sectionGap }]}>Προσβάσεις</Text>
        <View style={{ width: '70%', alignSelf: 'center' }}>
          <Text style={doctorStyles.dashboardLabel}>Αναζήτηση ασθενή:</Text>

          <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
            <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
            <TextInput style={doctorStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
          </View>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
        <FlatList style={{ flex: 1 }} data={patients} keyExtractor={(item) => item.id} renderItem={renderPatientCard} contentContainerStyle={styles.listContent} />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isRequestModalVisible}
        onRequestClose={closeRequestModal}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Αίτημα{'\n'}Πρόσβασης</Text>
              <TouchableOpacity
                onPress={closeRequestModal}
                style={{ position: 'absolute', top: 0, right: 0 }}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>ΑΜΚΑ Ασθενούς</Text>
            <TextInput
              style={[loginStyles.loginInput, localStyles.input]}
              keyboardType="numeric"
              value={requestPatientAmka}
              onChangeText={setRequestPatientAmka}
            />

            <Text style={loginStyles.inputLabel}>Τύπος Πρόσβασης</Text>
            <TouchableOpacity
              style={[loginStyles.loginInput, localStyles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setRequestAccessType((prev) => prev === 'Πλήρης Πρόσβαση' ? 'Μόνο Ανάγνωση' : 'Πλήρης Πρόσβαση')}
            >
              <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{requestAccessType}</Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSubmitAccessRequest}
              disabled={submittingRequest}
            >
              {submittingRequest ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Εντάξει</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
  },
});
