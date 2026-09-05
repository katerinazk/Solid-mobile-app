import React, { useEffect, useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { TYPOGRAPHY } from '../../constants/designSystem';
import { fetchPendingAccessRequestsForDoctor } from '../../services/accessRequests';

interface SentAccessRequest {
  id: string;
  patient_amka: string;
  access_type: string;
  patients: { first_name: string; last_name: string } | null;
}

interface Props {
  visible: boolean;
  doctorAmka: string;
  onClose: () => void;
}

// Τα αιτήματα που έχει στείλει ο γιατρός και δεν τα έχει αποδεχτεί ακόμα ο ασθενής. Κοινό
// component ώστε να ανοίγει το ίδιο ακριβώς παράθυρο από την αρχική και από τις Προσβάσεις.
export function SentRequestsModal({ visible, doctorAmka, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<SentAccessRequest[]>([]);

  useEffect(() => {
    if (!visible) return;

    let canceled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await fetchPendingAccessRequestsForDoctor(doctorAmka);
        if (canceled) return;
        if (error) {
          alert("Σφάλμα φόρτωσης αιτημάτων: " + error.message);
          return;
        }
        setRequests((data || []) as unknown as SentAccessRequest[]);
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => { canceled = true; };
  }, [visible, doctorAmka]);

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.addmodalOverlay}>
        <View style={styles.addmodalContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Αιτήματα Πρόσβασης</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
          ) : requests.length === 0 ? (
            <Text style={[styles.emptyText, { marginTop: 0, marginBottom: 10 }]}>Δεν υπάρχουν εκκρεμή αιτήματα.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {requests.map((item) => (
                <View key={item.id} style={localStyles.requestCard}>
                  <Text style={localStyles.requestPatientName}>
                    {item.patients?.first_name} {item.patients?.last_name}
                  </Text>
                  <Text style={localStyles.requestDetail}>ΑΜΚΑ: <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{item.patient_amka}</Text></Text>
                  <Text style={localStyles.requestDetail}>Τύπος πρόσβασης: <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{item.access_type}</Text></Text>
                  <Text style={[localStyles.requestDetail, { color: COLORS.danger, fontWeight: 'bold', marginTop: 6 }]}>Εκκρεμεί αποδοχή από τον ασθενή</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  requestCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: 12 },
  requestPatientName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  requestDetail: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginTop: 2 },
});
