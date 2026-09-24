import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { fetchPatientByAmka } from '../../services/patients';
import { hasPendingAccessRequest, createAccessRequest } from '../../services/accessRequests';
import { fetchAccessEntry } from '../../services/access';
import { InvitePatientModal } from './InvitePatientModal';
import { ACCESS_FULL, GRANTABLE_ACCESS_TYPES } from '../../constants/accessTypes';
import { SelectField } from '../SelectField';
import { askConfirm, showMessage } from '../../utils/appMessage';
import { friendlyErrorMessage } from '../../utils/networkError';

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
  const [accessType, setAccessType] = useState(ACCESS_FULL);
  const [submitting, setSubmitting] = useState(false);
  const [inviteAmka, setInviteAmka] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPatientAmka(initialAmka || '');
      setAccessType(ACCESS_FULL);
    }
  }, [visible, initialAmka]);

  // Η ερώτηση επιστρέφει Promise, ώστε η ροή να περιμένει την απάντηση.
  // Το νέο παράθυρο δεν έχει τίτλο, οπότε ο πρώτος παράγοντας δεν εμφανίζεται πια. Μένει στην
  // υπογραφή ώστε να μην αλλάξουν όλα τα σημεία που καλούν, και για να διαβάζεται η πρόθεση.
  const confirmDialog = (title: string, message: string): Promise<boolean> =>
    askConfirm({ message });

  // Ο ασθενής δεν έχει λογαριασμό: αντί για σκέτο "δεν βρέθηκε", προτείνουμε στον γιατρό να
  // τον καλέσει να εγγραφεί. Κλείνουμε πρώτα αυτό το παράθυρο για να ανοίξει το επόμενο.
  const promptInvite = async (amka: string) => {
    const confirmed = await askConfirm({
      message: "Ο ασθενής με αυτό το ΑΜΚΑ δεν χρησιμοποιεί την εφαρμογή. Θέλετε να του στείλετε πρόσκληση να τη χρησιμοποιήσει;",
    });
    if (!confirmed) return;

    onClose();
    setInviteAmka(amka);
  };

  const handleSubmit = async () => {
    if (!patientAmka.trim()) {
      showMessage("Παρακαλώ εισάγετε το ΑΜΚΑ του ασθενή.");
      return;
    }

    try {
      setSubmitting(true);

      const { data: patientData, error: patientError } = await fetchPatientByAmka(patientAmka.trim());
      if (patientError || !patientData) {
        promptInvite(patientAmka.trim());
        return;
      }

      // Η βάση είναι η αυθεντία - η λίστα της οθόνης μπορεί να έχει παλιώσει. Αν το ερώτημα
      // αποτύχει, πέφτουμε πίσω σε αυτήν για να μη σταλεί αίτημα σε ασθενή που ήδη μας έχει.
      const { data: existingAccess, error: accessError } = await fetchAccessEntry(patientAmka.trim(), doctorAmka);

      if (accessError && hasAccessTo(patientAmka.trim())) {
        showMessage("Έχετε ήδη πρόσβαση σε αυτόν τον ασθενή.");
        return;
      }

      if (existingAccess && !existingAccess.acl_synced) {
        // Η πρόσβαση υπάρχει στη βάση αλλά ο γιατρός δεν έχει μπει ακόμα στο ACL του Pod, οπότε
        // ο φάκελος δεν του εμφανίζεται - χωρίς εξήγηση θα έμοιαζε με σφάλμα.
        showMessage("Ο ασθενής σας έχει ήδη δώσει πρόσβαση. Ο φάκελός του θα εμφανιστεί μόλις συνδεθεί ξανά στην εφαρμογή.");
        return;
      }

      if (existingAccess) {
        // Με ίδιο δικαίωμα το αίτημα δεν έχει νόημα. Με διαφορετικό (τυπικά: έχει "Μόνο
        // Ανάγνωση" και θέλει "Πλήρης Πρόσβαση") επιτρέπεται, αφού το επιβεβαιώσει ο γιατρός.
        if (existingAccess.access_type === accessType) {
          showMessage("Έχετε ήδη πρόσβαση σε αυτόν τον ασθενή.");
          return;
        }

        const proceed = await confirmDialog(
          "Υπάρχει ήδη πρόσβαση",
          `Έχετε ήδη πρόσβαση "${existingAccess.access_type}" στον φάκελο αυτού του ασθενή. Θέλετε να ζητήσετε "${accessType}";`,
        );
        if (!proceed) return;
      }

      const { data: pendingRequest } = await hasPendingAccessRequest(doctorAmka, patientAmka.trim());
      if (pendingRequest) {
        showMessage("Υπάρχει ήδη εκκρεμές αίτημα πρόσβασης για αυτόν τον ασθενή.");
        return;
      }

      const { error } = await createAccessRequest(doctorAmka, patientAmka.trim(), accessType);
      if (error) {
        showMessage(friendlyErrorMessage(error, "Σφάλμα."));
        return;
      }

      showMessage("Το αίτημα πρόσβασης στάλθηκε επιτυχώς!");
      onSubmitted?.();
      onClose();
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
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
          {/* Κλειδωμένο όταν το αίτημα ξεκινά από συγκεκριμένη καρτέλα ασθενή: το ΑΜΚΑ είναι
              εκείνου που διάλεξε ο γιατρός, και αν άλλαζε εδώ το αίτημα θα πήγαινε σε άλλον
              άνθρωπο από αυτόν που βλέπει. Πληκτρολογείται μόνο όταν ξεκινά από το μηδέν. */}
          <TextInput
            style={[loginStyles.loginInput, localStyles.input, !!initialAmka && localStyles.lockedInput]}
            keyboardType="numeric"
            value={patientAmka}
            onChangeText={setPatientAmka}
            editable={!initialAmka}
          />

          <SelectField
            label="Τύπος Πρόσβασης"
            inputStyle={localStyles.input}
            value={accessType}
            onChange={setAccessType}
            options={GRANTABLE_ACCESS_TYPES}
          />

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
  // Κλειδωμένο πεδίο: το φόντο δείχνει ότι δεν πληκτρολογείται, ενώ το κείμενο μένει μαύρο
  // ώστε το ΑΜΚΑ να διαβάζεται κανονικά.
  lockedInput: { backgroundColor: COLORS.light, color: COLORS.text },
});
