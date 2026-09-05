import React, { useState, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { AccessRequestModal } from '../../../components/doctor/AccessRequestModal';
import { SentRequestsModal } from '../../../components/doctor/SentRequestsModal';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { Patient } from '../../../types/Patient';

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
  const [isSentRequestsModalVisible, setIsSentRequestsModalVisible] = useState(false);

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
        onPress={() => setIsSentRequestsModalVisible(true)}
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

      <SentRequestsModal
        visible={isSentRequestsModalVisible}
        doctorAmka={loggedInDoctorAmka}
        onClose={() => setIsSentRequestsModalVisible(false)}
      />
    </SafeAreaView>
  );
}
