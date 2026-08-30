import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { doctorStyles } from '../../constants/doctorStyles';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { SPACING, TYPOGRAPHY } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { fetchDoctorByAmka } from '../../services/doctors';

interface DoctorProfile {
  first_name: string;
  last_name: string;
  amka: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: SPACING.sectionGap }}>
      <Text style={{ fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: TYPOGRAPHY.bodyText, color: COLORS.text }}>{value}</Text>
    </View>
  );
}

export default function DoctorProfileScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchDoctorByAmka(loggedInDoctorAmka);
        setDoctor(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Λογαριασμός</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : !doctor ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν βρέθηκαν στοιχεία.</Text>
      ) : (
        <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap }}>
          <ProfileField label="Όνομα" value={doctor.first_name} />
          <ProfileField label="Επίθετο" value={doctor.last_name} />
          <ProfileField label="ΑΜΚΑ" value={doctor.amka} />
          <ProfileField label="Ειδικότητα" value={doctor.specialty || '-'} />
          <ProfileField label="Τηλέφωνο" value={doctor.phone || '-'} />
          <ProfileField label="Email" value={doctor.email || '-'} />

          <TouchableOpacity style={[styles.addButton, { borderRadius: 25, width: '70%', alignSelf: 'center' }]}>
            <Text style={styles.addButtonText}>Επεξεργασία</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
