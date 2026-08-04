import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { DoctorHeader } from '../../../components/DoctorHeader';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../supabase';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  amka: string;
  accessType: string;
  webId: string;
  folderUrl: string;
}

export default function DoctorAccessScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      // Φέρνουμε μόνο τους ασθενείς που έχουν δώσει πρόσβαση σε αυτόν τον γιατρό,
      // μαζί με τον τύπο πρόσβασης που έχουν ορίσει.
      const { data, error } = await supabase
        .from('access')
        .select(`
          access_type,
          patients (first_name, last_name, amka, web_id)
        `)
        .eq('doctor_amka', loggedInDoctorAmka);

      if (error) { console.error("Σφάλμα:", error.message); return; }
      if (data) {
        const formattedPatients: Patient[] = data
          .filter((row: any) => row.patients)
          .map((row: any) => ({
            id: row.patients.amka,
            first_name: row.patients.first_name,
            last_name: row.patients.last_name,
            amka: row.patients.amka,
            accessType: row.access_type,
            webId: row.patients.web_id,
            folderUrl: row.patients.web_id ? row.patients.web_id.replace('profile/card#me', 'public/') : ''
          }));
        setPatients(formattedPatients);
      }
    } catch (error) { console.error("Σφάλμα:", error); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

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
          pathname: '/doctor/history/[amka]',
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
