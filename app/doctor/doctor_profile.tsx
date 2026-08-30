import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { doctorStyles } from '../../constants/doctorStyles';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { SPACING, TYPOGRAPHY } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { fetchDoctorByAmka, updateDoctor } from '../../services/doctors';

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

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formSpecialty, setFormSpecialty] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const loadDoctor = async () => {
    try {
      setLoading(true);
      const { data } = await fetchDoctorByAmka(loggedInDoctorAmka);
      setDoctor(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctor();
  }, []);

  const startEditing = () => {
    if (!doctor) return;
    setFormFirstName(doctor.first_name || '');
    setFormLastName(doctor.last_name || '');
    setFormSpecialty(doctor.specialty || '');
    setFormPhone(doctor.phone || '');
    setFormEmail(doctor.email || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formFirstName.trim() || !formLastName.trim()) {
      alert("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα και Επίθετο.");
      return;
    }
    try {
      setSaving(true);
      const { error } = await updateDoctor(loggedInDoctorAmka, {
        first_name: formFirstName.trim(),
        last_name: formLastName.trim(),
        specialty: formSpecialty.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
      });

      if (error) {
        alert("Σφάλμα αποθήκευσης: " + error.message);
        return;
      }

      await loadDoctor();
      setIsEditing(false);
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity
          onPress={() => (isEditing ? setIsEditing(false) : router.back())}
          style={doctorStyles.historyBackButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>{isEditing ? 'Επεξεργασία\nΛογαριασμού' : 'Λογαριασμός'}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : !doctor ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν βρέθηκαν στοιχεία.</Text>
      ) : isEditing ? (
        <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap }}>
          <Text style={localStyles.label}>Όνομα</Text>
          <TextInput style={localStyles.input} value={formFirstName} onChangeText={setFormFirstName} />

          <Text style={localStyles.label}>Επίθετο</Text>
          <TextInput style={localStyles.input} value={formLastName} onChangeText={setFormLastName} />

          <Text style={localStyles.label}>ΑΜΚΑ</Text>
          <TextInput style={[localStyles.input, { color: COLORS.medium }]} value={doctor.amka} editable={false} />

          <Text style={localStyles.label}>Ειδικότητα</Text>
          <TextInput style={localStyles.input} value={formSpecialty} onChangeText={setFormSpecialty} />

          <Text style={localStyles.label}>Τηλέφωνο</Text>
          <TextInput style={localStyles.input} value={formPhone} onChangeText={setFormPhone} keyboardType="numeric" />

          <Text style={localStyles.label}>Email</Text>
          <TextInput style={localStyles.input} value={formEmail} onChangeText={setFormEmail} keyboardType="email-address" autoCapitalize="none" />

          <TouchableOpacity
            style={[styles.addButton, { borderRadius: 25, width: '70%', alignSelf: 'center', marginTop: SPACING.groupGap }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Αποθήκευση</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap }}>
          <ProfileField label="Όνομα" value={doctor.first_name} />
          <ProfileField label="Επίθετο" value={doctor.last_name} />
          <ProfileField label="ΑΜΚΑ" value={doctor.amka} />
          <ProfileField label="Ειδικότητα" value={doctor.specialty || '-'} />
          <ProfileField label="Τηλέφωνο" value={doctor.phone || '-'} />
          <ProfileField label="Email" value={doctor.email || '-'} />

          <TouchableOpacity
            style={[styles.addButton, { borderRadius: 25, width: '70%', alignSelf: 'center' }]}
            onPress={startEditing}
          >
            <Text style={styles.addButtonText}>Επεξεργασία</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  label: { ...loginStyles.inputLabel, color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle },
  input: { ...loginStyles.loginInput, backgroundColor: COLORS.lightest, borderRadius: 25 },
});
