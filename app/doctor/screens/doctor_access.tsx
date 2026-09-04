import React, { useState, useMemo } from 'react';
import { Text, View, FlatList, ScrollView, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { AccessRequestModal } from '../../../components/doctor/AccessRequestModal';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { Patient } from '../../../types/Patient';
import { fetchPendingAccessRequestsForDoctor, cancelAccessRequest } from '../../../services/accessRequests';

export default function DoctorAccessScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const { patients, loading } = useDoctorPatients();

  const [searchQuery, setSearchQuery] = useState('');

  const filteredPatients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return patients;
    return patients.filter((p) =>
      p.first_name?.toLowerCase().includes(query) ||
      p.last_name?.toLowerCase().includes(query) ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(query) ||
      p.amka?.toLowerCase().includes(query)
    );
  }, [patients, searchQuery]);

  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);

  interface SentAccessRequest {
    id: string;
    patient_amka: string;
    access_type: string;
    patients: { first_name: string; last_name: string } | null;
  }

  const [isSentRequestsModalVisible, setIsSentRequestsModalVisible] = useState(false);
  const [loadingSentRequests, setLoadingSentRequests] = useState(false);
  const [sentRequests, setSentRequests] = useState<SentAccessRequest[]>([]);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);

  const openSentRequestsModal = async () => {
    setIsSentRequestsModalVisible(true);
    try {
      setLoadingSentRequests(true);
      const { data, error } = await fetchPendingAccessRequestsForDoctor(loggedInDoctorAmka);
      if (error) {
        alert("Σφάλμα φόρτωσης αιτημάτων: " + error.message);
        return;
      }
      setSentRequests((data || []) as unknown as SentAccessRequest[]);
    } finally {
      setLoadingSentRequests(false);
    }
  };

  const handleCancelSentRequest = (request: SentAccessRequest) => {
    Alert.alert(
      "Ακύρωση Αιτήματος",
      "Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτό το αίτημα πρόσβασης;",
      [
        { text: "Όχι", style: "cancel" },
        {
          text: "Ακύρωση Αιτήματος",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelingRequestId(request.id);
              const { error } = await cancelAccessRequest(request.id);
              if (error) {
                alert("Σφάλμα: " + error.message);
                return;
              }
              setSentRequests((prev) => prev.filter((r) => r.id !== request.id));
            } catch (error) {
              alert("Απρόσμενο σφάλμα.");
            } finally {
              setCancelingRequestId(null);
            }
          }
        }
      ]
    );
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

      <TouchableOpacity
        style={doctorStyles.requestAccessButton}
        onPress={openSentRequestsModal}
      >
        <Text style={doctorStyles.requestAccessButtonText}>Αιτήματα</Text>
      </TouchableOpacity>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={[doctorStyles.dashboardTitle, { marginBottom: SPACING.sectionGap }]}>Προσβάσεις</Text>
        <View style={{ width: '70%', alignSelf: 'center' }}>
          <Text style={doctorStyles.dashboardLabel}>Αναζήτηση ασθενή:</Text>

          <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
            <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
            <TextInput
              style={doctorStyles.searchInput}
              placeholder="Αναζήτηση..."
              placeholderTextColor={COLORS.primary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : filteredPatients.length === 0 ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>
          {searchQuery.trim() ? 'Δεν βρέθηκε ασθενής με αυτά τα στοιχεία.' : 'Δεν έχετε πρόσβαση σε κανέναν ασθενή.'}
        </Text>
      ) : (
        <FlatList style={{ flex: 1 }} data={filteredPatients} keyExtractor={(item) => item.id} renderItem={renderPatientCard} contentContainerStyle={styles.listContent} />
      )}

      <AccessRequestModal
        visible={isRequestModalVisible}
        doctorAmka={loggedInDoctorAmka}
        hasAccessTo={(patientAmka) => patients.some((p) => p.amka === patientAmka)}
        onClose={() => setIsRequestModalVisible(false)}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isSentRequestsModalVisible}
        onRequestClose={() => setIsSentRequestsModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Αιτήματα Πρόσβασης</Text>
              <TouchableOpacity onPress={() => setIsSentRequestsModalVisible(false)} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {loadingSentRequests ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : sentRequests.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 0, marginBottom: 10 }]}>Δεν υπάρχουν εκκρεμή αιτήματα.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {sentRequests.map((item) => (
                  <View key={item.id} style={localStyles.requestCard}>
                    <Text style={localStyles.requestPatientName}>
                      {item.patients?.first_name} {item.patients?.last_name}
                    </Text>
                    <Text style={localStyles.requestDetail}>ΑΜΚΑ: <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{item.patient_amka}</Text></Text>
                    <Text style={localStyles.requestDetail}>Τύπος πρόσβασης: <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{item.access_type}</Text></Text>
                    <Text style={[localStyles.requestDetail, { color: COLORS.danger, fontWeight: 'bold', marginTop: 6 }]}>Εκκρεμεί αποδοχή από τον ασθενή</Text>

                    <TouchableOpacity
                      style={localStyles.cancelRequestButton}
                      onPress={() => handleCancelSentRequest(item)}
                      disabled={cancelingRequestId === item.id}
                    >
                      {cancelingRequestId === item.id ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={localStyles.cancelRequestButtonText}>Ακύρωση</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  requestCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: 12 },
  requestPatientName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  requestDetail: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginTop: 2 },
  cancelRequestButton: { backgroundColor: COLORS.danger, minHeight: TOUCH.buttonHeight, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  cancelRequestButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
