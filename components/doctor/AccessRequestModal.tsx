import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { TYPOGRAPHY } from '../../constants/designSystem';
import { fetchPatientByAmka } from '../../services/patients';
import { hasPendingAccessRequest, createAccessRequest } from '../../services/accessRequests';
import { fetchAccessEntry } from '../../services/access';
import { InvitePatientModal } from './InvitePatientModal';

interface Props {
  visible: boolean;
  doctorAmka: string;
  // Προσυμπληρωμένο ΑΜΚΑ όταν ο γιατρός ξεκινάει το αίτημα από συγκεκριμένη καρτέλα ασθενή.
  initialAmka?: string;
  hasAccessTo: (patientAmka: string) => boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

// Το modal "Αίτημα Πρόσβασης" - κοινό ανάμεσα στην αρχική οθόνη και στις Προσβάσεις του
// γιατρού, ώστε η λογική ελέγχων (υπάρχει ο ασθενής / έχω ήδη πρόσβαση / υπάρχει ήδη
// εκκρεμές αίτημα) να ζει σε ένα μόνο σημείο.
export function AccessRequestModal({ visible, doctorAmka, initialAmka, hasAccessTo, onClose, onSubmitted }: Props) {
  const [patientAmka, setPatientAmka] = useState(initialAmka || '');
  const [accessType, setAccessType] = useState('Πλήρης Πρόσβαση');
  const [submitting, setSubmitting] = useState(false);
  const [inviteAmka, setInviteAmka] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPatientAmka(initialAmka || '');
      setAccessType('Πλήρης Πρόσβαση');
    }
  }, [visible, initialAmka]);

  // Ο ασθενής δεν έχει λογαριασμό: αντί για σκέτο "δεν βρέθηκε", προτείνουμε στον γιατρό να
  // τον καλέσει να εγγραφεί. Κλείνουμε πρώτα αυτό το παράθυρο για να ανοίξει το επόμενο.
  const promptInvite = (amka: string) => {
    Alert.alert(
      "Δεν χρησιμοποιεί την εφαρμογή",
      "Ο ασθενής με αυτό το ΑΜΚΑ δεν χρησιμοποιεί την εφαρμογή. Θέλετε να του στείλετε πρόσκληση να τη χρησιμοποιήσει;",
      [
        { text: "Όχι", style: "cancel" },
        {
          text: "Ναι",
          onPress: () => {
            onClose();
            setInviteAmka(amka);
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!patientAmka.trim()) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του ασθενή.");
      return;
    }

    try {
      setSubmitting(true);

      const { data: patientData, error: patientError } = await fetchPatientByAmka(patientAmka.trim());
      if (patientError || !patientData) {
        promptInvite(patientAmka.trim());
        return;
      }

      // Πρώτα η λίστα της οθόνης (άμεση απάντηση) και μετά η βάση, που είναι η αυθεντία: αν η
      // λίστα δεν είχε προλάβει να φορτώσει, ο έλεγχος από μόνος του θα περνούσε λάθος.
      const { data: existingAccess } = await fetchAccessEntry(patientAmka.trim(), doctorAmka);
      if (existingAccess && !existingAccess.acl_synced) {
        // Η πρόσβαση υπάρχει στη βάση αλλά ο γιατρός δεν έχει μπει ακόμα στο ACL του Pod, οπότε
        // ο φάκελος δεν του εμφανίζεται - χωρίς εξήγηση θα έμοιαζε με σφάλμα.
        alert("Ο ασθενής σας έχει ήδη δώσει πρόσβαση. Ο φάκελός του θα εμφανιστεί μόλις συνδεθεί ξανά στην εφαρμογή.");
        return;
      }
      if (hasAccessTo(patientAmka.trim()) || existingAccess) {
        alert("Έχετε ήδη πρόσβαση σε αυτόν τον ασθενή.");
        return;
      }

      const { data: pendingRequest } = await hasPendingAccessRequest(doctorAmka, patientAmka.trim());
      if (pendingRequest) {
        alert("Υπάρχει ήδη εκκρεμές αίτημα πρόσβασης για αυτόν τον ασθενή.");
        return;
      }

      const { error } = await createAccessRequest(doctorAmka, patientAmka.trim(), accessType);
      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      alert("Το αίτημα πρόσβασης στάλθηκε επιτυχώς!");
      onSubmitted?.();
      onClose();
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.addmodalOverlay}>
        <View style={styles.addmodalContent}>
          <View style={{ marginBottom: 20 }}>
            <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Αίτημα{'\n'}Πρόσβασης</Text>
            <TouchableOpacity
              onPress={onClose}
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
            value={patientAmka}
            onChangeText={setPatientAmka}
          />

          <Text style={loginStyles.inputLabel}>Τύπος Πρόσβασης</Text>
          <TouchableOpacity
            style={[loginStyles.loginInput, localStyles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            onPress={() => setAccessType((prev) => prev === 'Πλήρης Πρόσβαση' ? 'Μόνο Ανάγνωση' : 'Πλήρης Πρόσβαση')}
          >
            <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{accessType}</Text>
            <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Εντάξει</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    <InvitePatientModal
      visible={inviteAmka !== null}
      patientAmka={inviteAmka || ''}
      onClose={() => setInviteAmka(null)}
    />
    </>
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
