import React from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { Patient } from '../../../types/Patient';

export default function DoctorAccessScreen() {
  const { patients, loading } = useDoctorPatients();

  const renderPatientCard = ({ item }: { item: Patient }) => (
    <View style={styles.card}>
      <View style={styles.cardDetails}>
        <Text style={styles.patientName}>{item.first_name} {item.last_name}</Text>
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
          },
        })}
      >
        <Text style={styles.cardActionButtonText}>Προβολή Φακέλου</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={doctorStyles.container}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />

      <View style={doctorStyles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
        <TextInput style={doctorStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
      </View>

      <TouchableOpacity
        style={doctorStyles.requestAccessButton}
        onPress={() => Alert.alert('Αίτημα Πρόσβασης', 'Η λειτουργία έρχεται σύντομα.')}
      >
        <Ionicons name="add" size={20} color={COLORS.white} />
        <Text style={doctorStyles.requestAccessButtonText}>Αίτημα Πρόσβασης</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
        <FlatList style={{ flex: 1 }} data={patients} keyExtractor={(item) => item.id} renderItem={renderPatientCard} contentContainerStyle={styles.listContent} />
      )}
    </SafeAreaView>
  );
}
