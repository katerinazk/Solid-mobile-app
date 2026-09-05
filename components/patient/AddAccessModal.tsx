import React, { useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';
import { fetchDoctorByAmka } from '../../services/doctors';
import { addAccess, fetchAccessListForPatient } from '../../services/access';
import { updatePodAcl } from '../../services/solidPod';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Καλείται μετά από επιτυχή προσθήκη, ώστε η οθόνη που το άνοιξε να ανανεώσει τη λίστα της.
  onAdded?: () => void;
}

// Η φόρμα "Νέα Πρόσβαση" ζει σε κοινό component γιατί η προσθήκη δεν είναι απλή εγγραφή στη
// βάση: γράφει και το ACL του Pod. Δύο αντίγραφα θα ξέφευγαν αργά ή γρήγορα μεταξύ τους.
export function AddAccessModal({ visible, onClose, onAdded }: Props) {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();

  const [doctorAmka, setDoctorAmka] = useState('');
  const [accessType, setAccessType] = useState('Πλήρης Πρόσβαση');
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setDoctorAmka('');
    onClose();
  };

  const handleAddAccess = async () => {
    if (!doctorAmka) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του γιατρού.");
      return;
    }
    try {
      setSaving(true);

      const { data: doctorData, error: doctorError } = await fetchDoctorByAmka(doctorAmka);

      if (doctorError || !doctorData) {
        alert("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return;
      }

      const { error } = await addAccess(loggedInPatientAmka, doctorAmka, accessType);

      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      // Το updatePodAcl ξαναγράφει ΟΛΟ το ACL από αυτή τη λίστα, οπότε τη διαβάζουμε φρέσκια
      // εδώ: με μια παλιά/άδεια λίστα θα σβήναμε τις προσβάσεις των υπόλοιπων γιατρών.
      const { data: accessList } = await fetchAccessListForPatient(loggedInPatientAmka);

      await updatePodAcl({
        activePatientFolderUrl,
        accessToken,
        accessList: accessList || [],
        newDoctorWebId: doctorData.web_id,
        accessType,
      });
      alert(`Η πρόσβαση στον Δρ. ${doctorData.last_name} δόθηκε επιτυχώς!`);
      setDoctorAmka('');
      onClose();
      onAdded?.();
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={handleClose}>
      <View style={styles.addmodalOverlay}>
        <View style={styles.addmodalContent}>
          <Text style={styles.addmodalTitle}>Νέα Πρόσβαση</Text>

          <Text style={loginStyles.inputLabel}>ΑΜΚΑ Γιατρού</Text>
          <TextInput
            style={loginStyles.loginInput}
            placeholder="11 ψηφία"
            keyboardType="numeric"
            value={doctorAmka}
            onChangeText={setDoctorAmka}
          />

          <Text style={loginStyles.inputLabel}>Τύπος Πρόσβασης</Text>
          <View style={{ flexDirection: 'row', marginBottom: 20 }}>
            <TouchableOpacity
              style={[styles.modalButton, { flex: 1, marginRight: 5, backgroundColor: accessType === 'Πλήρης Πρόσβαση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
              onPress={() => setAccessType('Πλήρης Πρόσβαση')}
            >
              <Text style={{ color: accessType === 'Πλήρης Πρόσβαση' ? COLORS.white : COLORS.text, textAlign: 'center' }}>Πλήρης</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { flex: 1, marginLeft: 5, backgroundColor: accessType === 'Μόνο Ανάγνωση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
              onPress={() => setAccessType('Μόνο Ανάγνωση')}
            >
              <Text style={{ color: accessType === 'Μόνο Ανάγνωση' ? COLORS.white : COLORS.text, textAlign: 'center' }}>Μόνο Ανάγνωση</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalButtonsGroup}>
            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Ακύρωση</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddAccess} disabled={saving}>
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Εντάξει</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
