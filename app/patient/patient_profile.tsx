import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { doctorStyles } from '../../constants/doctorStyles';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { SPACING, TYPOGRAPHY } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { fetchPatientByAmka, updatePatient } from '../../services/patients';

interface PatientProfile {
  first_name: string;
  last_name: string;
  amka: string;
  birth_date: string | null;
  sex: string | null;
  blood_type: string | null;
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

export default function PatientProfileScreen() {
  const { loggedInPatientAmka } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<PatientProfile | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formSex, setFormSex] = useState('');
  const [formBloodType, setFormBloodType] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const loadPatient = async () => {
    try {
      setLoading(true);
      const { data } = await fetchPatientByAmka(loggedInPatientAmka);
      setPatient(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatient();
  }, []);

  const startEditing = () => {
    if (!patient) return;
    setFormFirstName(patient.first_name || '');
    setFormLastName(patient.last_name || '');
    setFormBirthDate(patient.birth_date || '');
    setFormSex(patient.sex || '');
    setFormBloodType(patient.blood_type || '');
    setFormPhone(patient.phone || '');
    setFormEmail(patient.email || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formFirstName.trim() || !formLastName.trim()) {
      alert("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα και Επίθετο.");
      return;
    }
    try {
      setSaving(true);
      const { error } = await updatePatient(loggedInPatientAmka, {
        first_name: formFirstName.trim(),
        last_name: formLastName.trim(),
        birth_date: formBirthDate.trim(),
        sex: formSex.trim(),
        blood_type: formBloodType.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
      });

      if (error) {
        alert("Σφάλμα αποθήκευσης: " + error.message);
        return;
      }

      await loadPatient();
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
      ) : !patient ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν βρέθηκαν στοιχεία.</Text>
      ) : isEditing ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap, paddingBottom: SPACING.bottomMargin }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={localStyles.label}>Όνομα</Text>
          <TextInput style={localStyles.input} value={formFirstName} onChangeText={setFormFirstName} />

          <Text style={localStyles.label}>Επίθετο</Text>
          <TextInput style={localStyles.input} value={formLastName} onChangeText={setFormLastName} />

          <Text style={localStyles.label}>ΑΜΚΑ</Text>
          <TextInput style={[localStyles.input, { color: COLORS.medium }]} value={patient.amka} editable={false} />

          <Text style={localStyles.label}>Ημερομηνία Γέννησης</Text>
          <TextInput style={localStyles.input} value={formBirthDate} onChangeText={setFormBirthDate} placeholder="π.χ. 1990-07-22" />

          <Text style={localStyles.label}>Φύλο</Text>
          <TextInput style={localStyles.input} value={formSex} onChangeText={setFormSex} />

          <Text style={localStyles.label}>Ομάδα Αίματος</Text>
          <TextInput style={localStyles.input} value={formBloodType} onChangeText={setFormBloodType} />

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
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap, paddingBottom: SPACING.bottomMargin }}>
          <ProfileField label="Όνομα" value={patient.first_name} />
          <ProfileField label="Επίθετο" value={patient.last_name} />
          <ProfileField label="ΑΜΚΑ" value={patient.amka} />
          <ProfileField label="Ημερομηνία Γέννησης" value={patient.birth_date || '-'} />
          <ProfileField label="Φύλο" value={patient.sex || '-'} />
          <ProfileField label="Ομάδα Αίματος" value={patient.blood_type || '-'} />
          <ProfileField label="Τηλέφωνο" value={patient.phone || '-'} />
          <ProfileField label="Email" value={patient.email || '-'} />

          <TouchableOpacity
            style={[styles.addButton, { borderRadius: 25, width: '70%', alignSelf: 'center' }]}
            onPress={startEditing}
          >
            <Text style={styles.addButtonText}>Επεξεργασία</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  label: { ...loginStyles.inputLabel, color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle },
  input: { ...loginStyles.loginInput, backgroundColor: COLORS.lightest, borderRadius: 25 },
});
