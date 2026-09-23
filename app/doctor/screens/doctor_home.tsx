import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { SentRequestsModal } from '../../../components/doctor/SentRequestsModal';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { ACCESS_FULL, ACCESS_READ_ONLY } from '../../../constants/accessTypes';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { fetchAccessEntry } from '../../../services/access';
import { hasPendingAccessRequest, createAccessRequest } from '../../../services/accessRequests';
import { useRecordSearch } from '../../../utils/recordSearch';
import { Patient } from '../../../types/Patient';
import { askConfirm, showMessage } from '../../../utils/appMessage';

export default function DoctorHomeScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const { patients, loading, error: patientsError, refresh } = useDoctorPatients();
  const [doctor, setDoctor] = useState<{ last_name: string } | null>(null);

  const [openingFolderFor, setOpeningFolderFor] = useState<string | null>(null);
  const [isSentRequestsModalVisible, setIsSentRequestsModalVisible] = useState(false);
  // Χωρίς αυτό, ένα γρήγορο διπλό πάτημα (ή διπλό "Ναι" στην επιβεβαίωση) θα έστελνε δύο
  // αιτήματα αλλαγής πρόσβασης για τον ίδιο ασθενή.
  const [requestingChangeFor, setRequestingChangeFor] = useState<string | null>(null);

  // Αίτημα αλλαγής τύπου πρόσβασης σε ασθενή που ήδη έχει πρόσβαση. Με μόνο δύο δυνατούς
  // τύπους (Πλήρης/Μόνο Ανάγνωση) δεν χρειάζεται φόρμα επιλογής - το "Αλλαγή" ζητάει
  // κατευθείαν τον άλλο τύπο από τον τρέχοντα, με απλή ερώτηση ναι/όχι. Δεν αλλάζει τίποτα
  // αμέσως - στέλνει αίτημα που πρέπει να εγκρίνει ο ασθενής, όπως κάθε αίτημα πρόσβασης.
  const requestAccessTypeChange = async (patient: Patient) => {
    const nextType = patient.accessType === ACCESS_FULL ? ACCESS_READ_ONLY : ACCESS_FULL;

    const confirmed = await askConfirm({
      message: `Θέλετε να ζητήσετε αλλαγή από "${patient.accessType}" σε "${nextType}";`,
    });
    if (!confirmed) return;

    // Το ίδιο κουμπί μένει ανενεργό μέχρι να ολοκληρωθεί το αίτημα - χωρίς αυτό, ένα δεύτερο
    // πάτημα όσο περιμένουμε την απάντηση θα έστελνε το αίτημα δύο φορές.
    if (requestingChangeFor === patient.amka) return;
    setRequestingChangeFor(patient.amka);

    try {
      const { data: pendingRequest } = await hasPendingAccessRequest(loggedInDoctorAmka, patient.amka);
      if (pendingRequest) {
        showMessage("Υπάρχει ήδη εκκρεμές αίτημα πρόσβασης για αυτόν τον ασθενή.");
        return;
      }

      const { error } = await createAccessRequest(loggedInDoctorAmka, patient.amka, nextType);
      if (error) {
        showMessage("Σφάλμα: " + error.message);
        return;
      }

      showMessage("Το αίτημα στάλθηκε επιτυχώς!");
    } catch {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setRequestingChangeFor(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchDoctorByAmka(loggedInDoctorAmka);
        setDoctor(data);
      } catch {
        // Αν αποτύχει, απλά δεν εμφανίζεται το επίθετο στο καλωσόρισμα.
      }
    })();
  }, []);

  // Η αναζήτηση εδώ ψάχνει ΜΟΝΟ μέσα σε όσους ασθενείς έχει ήδη πρόσβαση ο γιατρός - το
  // αίτημα για νέο ασθενή γίνεται πλέον από ξεχωριστή οθόνη (βλ. openAddAccess).
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible, searching, results: foundPatients } =
    useRecordSearch(patients, (item) => [item.first_name, item.last_name, item.amka]);

  const openAddAccess = () => {
    router.push(ROUTES.DOCTOR_ADD_ACCESS);
  };

  // Η λίστα προσβάσεων φορτώνεται μία φορά, οπότε μπορεί να έχει παλιώσει: ο ασθενής μπορεί
  // να κατάργησε ή να άλλαξε την πρόσβαση όσο ο γιατρός κοιτούσε την οθόνη. Ξαναρωτάμε τη
  // βάση τη στιγμή του πατήματος - η επιλογή του ασθενή υπερισχύει πάντα.
  const openPatientFolder = async (patient: Patient) => {
    try {
      setOpeningFolderFor(patient.amka);

      const { data: entry, error } = await fetchAccessEntry(patient.amka, loggedInDoctorAmka);

      if (error) {
        showMessage("Δεν ήταν δυνατός ο έλεγχος της πρόσβασης. Δοκιμάστε ξανά.");
        return;
      }

      if (!entry || !entry.acl_synced) {
        showMessage("Ο ασθενής κατάργησε την πρόσβασή σας. Δοκιμάστε ξανά αργότερα.");
        refresh();
        return;
      }

      if (entry.access_type !== patient.accessType) {
        showMessage(`Ο ασθενής άλλαξε τον τύπο πρόσβασης σε "${entry.access_type}". Δοκιμάστε ξανά.`);
        refresh();
        return;
      }

      // Η πρόσβαση υπάρχει στη βάση, αλλά ο ασθενής μπορεί να μην έχει συνδέσει ποτέ Pod: τότε
      // δεν υπάρχει φάκελος να ανοίξει. Ξαναφορτώνουμε τη λίστα, γιατί μπορεί απλώς να έχει
      // παλιώσει και ο ασθενής να συνδέθηκε στο μεταξύ.
      if (!patient.webId) {
        showMessage("Ο ασθενής δεν έχει συνδέσει ακόμη προσωπικό χώρο (Pod), οπότε δεν υπάρχει ιατρικός φάκελος να ανοίξει.");
        refresh();
        return;
      }

      router.push({
        pathname: ROUTES.DOCTOR_MED_HISTORY,
        params: {
          amka: patient.amka,
          firstName: patient.first_name,
          lastName: patient.last_name,
          webId: patient.webId,
          birthDate: patient.birthDate,
          accessType: entry.access_type,
        },
      });
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setOpeningFolderFor(null);
    }
  };

  const renderPatientCard = (patient: Patient) => (
    <View key={patient.amka} style={[sharedStyles.card, { backgroundColor: COLORS.lightest }]}>
      <View style={sharedStyles.cardDetails}>
        <Text style={[sharedStyles.patientName, { color: COLORS.primary }]}>{patient.first_name} {patient.last_name}</Text>
        <Text style={sharedStyles.cardLabel}>AMKA: <Text style={sharedStyles.cardValue}>{patient.amka}</Text></Text>
        {/* Το "Αλλαγή" σαν μικρό περιγραμμένο κουμπί, σπρωγμένο τέρμα δεξιά - στέλνει αίτημα
            (χρειάζεται έγκριση του ασθενή), δεν αλλάζει τίποτα αμέσως, οπότε μένει
            δευτερεύον/περιγραμμένο αντί για γεμάτο σαν το "Προβολή Φακέλου". */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={sharedStyles.cardLabel}>Τύπος πρόσβασης: <Text style={sharedStyles.cardValue}>{patient.accessType}</Text></Text>
          <TouchableOpacity
            style={localStyles.changeAccessButton}
            onPress={() => requestAccessTypeChange(patient)}
            disabled={requestingChangeFor === patient.amka}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {requestingChangeFor === patient.amka ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={localStyles.changeAccessButtonText}>Αλλαγή</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={sharedStyles.cardActionButton}
        onPress={() => openPatientFolder(patient)}
        disabled={openingFolderFor === patient.amka}
      >
        {openingFolderFor === patient.amka
          ? <ActivityIndicator size="small" color={COLORS.white} />
          : <Text style={sharedStyles.cardActionButtonText}>Προβολή Φακέλου</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      {/* Κενό στην κορυφή. Εδώ καθόταν το εικονίδιο του προφίλ, που έφυγε: τα στοιχεία
          του χρήστη έχουν πλέον δική τους καρτέλα, τον Λογαριασμό. */}
      <View style={{ height: SPACING.topMargin }} />

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={localStyles.welcome}>Καλωσορίσατε Δρ. {doctor?.last_name || ''}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
        {/* Ίδιο μπλε φόντο/γραμματοσειρά με τους τίτλους των υπόλοιπων οθονών (historyHeader/
            historyTitle) - εδώ όμως ΔΕΝ μένει σταθερός στην κορυφή, γιατί είναι μέσα στο
            ScrollView: κυλάει μαζί με το υπόλοιπο περιεχόμενο, όχι μόνος του πάνω από αυτό. */}
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Προσβάσεις</Text>
        </View>

        <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
          {/* Ίδιο μοτίβο με τις Προσβάσεις του ασθενή: δύο κουμπιά δίπλα-δίπλα κάτω από τον
              τίτλο. Το αίτημα προς νέο ασθενή έχει τη δική του οθόνη, με την αναζήτηση σε ΟΛΗ
              τη βάση ασθενών - εδώ μένει μόνο η αναζήτηση μέσα σε όσους έχει ήδη πρόσβαση. */}
          <View style={localStyles.actionRow}>
            <TouchableOpacity
              style={[localStyles.actionButton, { flex: 1, marginRight: SPACING.groupGap, position: 'relative' }]}
              onPress={openAddAccess}
            >
              {/* Απόλυτη θέση αριστερά αντί για μέρος της κεντραρισμένης γραμμής: έτσι το "+"
                  μένει σταθερά κολλημένο στην αριστερή άκρη του κουμπιού, ανεξάρτητα από το
                  πλάτος/τις γραμμές του κειμένου - που παραμένει κανονικά κεντραρισμένο. */}
              <Ionicons name="add" size={20} color={COLORS.white} style={{ position: 'absolute', left: 22 }} />
              <Text style={[localStyles.actionButtonText, { marginLeft: 10 }]}>{'Αίτημα\nΠρόσβασης'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[localStyles.actionButton, { flex: 1 }]} onPress={() => setIsSentRequestsModalVisible(true)}>
              <Text style={localStyles.actionButtonText}>{'Εκκρεμή\nΑιτήματα'}</Text>
            </TouchableOpacity>
          </View>

          <RecordSearchBar
            label="Αναζήτηση ασθενή:"
            value={searchQuery}
            onChange={setSearchQuery}
            visible={searchVisible}
            containerStyle={{ marginBottom: SPACING.sectionGap }}
          />

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
          ) : patientsError ? (
            <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left', color: COLORS.danger }]}>
              Αποτυχία φόρτωσης προσβάσεων: {patientsError}
            </Text>
          ) : foundPatients.length === 0 ? (
            <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left' }]}>
              {searching ? 'Δεν βρέθηκε ασθενής με αυτά τα στοιχεία.' : 'Δεν έχετε πρόσβαση σε κανέναν ασθενή.'}
            </Text>
          ) : (
            foundPatients.map(renderPatientCard)
          )}
        </View>

        <View style={[styles.historyHeader, { marginTop: SPACING.sectionGap }]}>
          <Text style={styles.historyTitle}>Ειδοποιήσεις</Text>
        </View>

        <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
          <Text style={[sharedStyles.emptyText, { marginTop: 0, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
        </View>
      </ScrollView>

      <SentRequestsModal
        visible={isSentRequestsModalVisible}
        doctorAmka={loggedInDoctorAmka}
        onClose={() => setIsSentRequestsModalVisible(false)}
      />

    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  welcome: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap },
  // Τα δύο κουμπιά δίπλα-δίπλα, ίδιο σχήμα με τις Προσβάσεις του ασθενή.
  actionRow: { flexDirection: 'row', marginBottom: SPACING.sectionGap },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  actionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText, textAlign: 'center', flexShrink: 1 },
  changeAccessButton: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginLeft: SPACING.groupGap,
  },
  changeAccessButtonText: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary },
});
