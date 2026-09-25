import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../constants/colors';
import { doctorStyles } from '../../constants/doctorStyles';
import { loginStyles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName, uploadAttachment } from '../../services/solidPod';
import { todayIsoDate } from '../../utils/podRecords';
import { resolveRecordAuthor } from '../../utils/recordAuthor';
import { saveRecordEdit } from '../../services/recordRevisions';
import { notifyRecordChange } from '../../services/notifications';
import { MedicalCodePicker } from '../../components/MedicalCodePicker';
import { RecordFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../components/RecordFormScreen';
import { MedicalCode, codeFromRecord } from '../../services/medicalCodes';
import { SelectField } from '../../components/SelectField';
import { EXAM_TYPES, EXAM_STATUS_OPTIONS, EXAM_STATUS_PENDING, EXAM_STATUS_COMPLETED } from '../../constants/medicalOptions';
import { RecordLinkPicker } from '../../components/RecordLinkPicker';
import { LinkedRecord, parseLinkedRecords, filterExistingLinks } from '../../services/historyRecords';
import { showMessage } from '../../utils/appMessage';
import { friendlyErrorMessage } from '../../utils/networkError';

export default function ExamFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    firstName: string;
    lastName: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχουσας εξέτασης.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editType?: string;
    editStatus?: string;
    editCompletedDate?: string;
    editResultFile?: string;
    editCreatedDate?: string;
    // Οι σύνδεσμοι προς άλλες εγγραφές ιστορικού, ως JSON πίνακας.
    editLinks?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka, role, loggedInPatientAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Εξετάσεις') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [type, setType] = useState(params.editType || '');
  // Μόνο ο ασθενής επιλέγει κατάσταση. Ο γιατρός παραγγέλνει εξέταση, δεν την εκτελεί.
  const [statusLabel, setStatusLabel] = useState(
    params.editStatus === 'completed' ? EXAM_STATUS_COMPLETED : EXAM_STATUS_PENDING
  );
  const [links, setLinks] = useState<LinkedRecord[]>(parseLinkedRecords(params.editLinks));
  const [saving, setSaving] = useState(false);

  // Το αρχείο αποτελέσματος διαλέγεται εδώ, αλλά ανεβαίνει μόνο με την αποθήκευση: τα
  // συνημμένα ζουν δίπλα στην εγγραφή, και η εγγραφή δεν έχει διεύθυνση πριν γραφτεί.
  const [pendingResult, setPendingResult] = useState<{ name: string; uri: string; mimeType: string } | null>(null);

  // Αν ο ασθενής έσβησε στο μεταξύ κάποια από τις συνδεδεμένες εγγραφές, φεύγει και η
  // σύνδεση: δεν θέλουμε ο γιατρός να βλέπει, και να ξαναποθηκεύει, σύνδεσμο προς το κενό.
  useEffect(() => {
    if (links.length === 0) return;

    let canceled = false;
    (async () => {
      const alive = await filterExistingLinks(params.webId, links, accessToken);
      if (!canceled && alive.length !== links.length) setLinks(alive);
    })();

    return () => { canceled = true; };
    // Μία φορά, με τους συνδέσμους που ήρθαν από την καρτέλα.
  }, []);

  const handlePickResult = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) return;

      const asset = picked.assets[0];
      setPendingResult({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType || 'application/octet-stream' });
    } catch (error: any) {
      showMessage(friendlyErrorMessage(error, 'Αποτυχία επιλογής αρχείου.'));
    }
  };

  // Ό,τι δείχνει η φόρμα ως αρχείο αποτελέσματος: είτε αυτό που μόλις διάλεξε ο ασθενής,
  // είτε εκείνο που είχε ανέβει ήδη και ξαναβλέπει στην επεξεργασία.
  const resultFileName = pendingResult?.name || params.editResultFile || '';

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !type.trim()) {
      showMessage("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      showMessage("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε τον γιατρό της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      if (!isEditing) {
        const author = await resolveRecordAuthor(role, loggedInDoctorAmka, loggedInPatientAmka);
        doctorName = author.doctorName;
        doctorAmka = author.doctorAmka;
      }

      // Όταν καταχωρεί ο γιατρός, η εξέταση μπαίνει πάντα ως εκκρεμής και την ολοκληρώνει ο
      // ασθενής ανεβάζοντας το αποτέλεσμα. Ο ασθενής όμως μπορεί να γράφει και εξέταση που
      // έχει ήδη κάνει, οπότε διαλέγει ο ίδιος.
      const status: 'pending' | 'completed' = role === 'patient'
        ? (statusLabel === EXAM_STATUS_COMPLETED ? 'completed' : 'pending')
        : ((params.editStatus as 'pending' | 'completed') || 'pending');

      const fileUrl = params.editUrl || newRecordFileName(folderUrl);

      // Το αποτέλεσμα ανεβαίνει ΠΡΙΝ γραφτεί η εγγραφή, γιατί χρειάζεται το τελικό της URL -
      // και γιατί έτσι, αν η μεταφόρτωση αποτύχει, δεν μένει ολοκληρωμένη εξέταση που δείχνει
      // σε αρχείο που δεν ανέβηκε ποτέ. Κρατάμε το όνομα που επέστρεψε το ανέβασμα, όχι αυτό
      // που διάλεξε ο χρήστης: μόνο με αυτό ξαναβρίσκεται το αρχείο.
      let resultFile = status === 'completed' ? params.editResultFile : undefined;
      if (status === 'completed' && pendingResult) {
        resultFile = await uploadAttachment(
          fileUrl, pendingResult.name, pendingResult.uri, pendingResult.mimeType, accessToken
        );
      }

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        type,
        status,
        doctorName,
        doctorAmka,
        // Η ημερομηνία και το αρχείο αποτελέσματος κρατιούνται μόνο όσο η εξέταση είναι
        // ολοκληρωμένη - αλλιώς θα έμενε ημερομηνία αποτελέσματος σε εκκρεμή εξέταση.
        completedDate: status === 'completed' ? (params.editCompletedDate || todayIsoDate()) : undefined,
        resultFile,
        // Στην επεξεργασία κρατάμε την αρχική ημερομηνία καταχώρησης, δεν τη μηδενίζουμε.
        createdDate: params.editCreatedDate || todayIsoDate(),
        links: links.length > 0 ? links : undefined,
      };

      // Η διόρθωση δεν γράφει απλώς από πάνω: κρατά την προηγούμενη μορφή μέσα στο ίδιο
      // αρχείο, μαζί με το ποιος τη διόρθωσε και πότε. Έτσι η επεξεργασία παύει να είναι
      // εξίσου καταστροφική με τη διαγραφή.
      if (params.editUrl) {
        const editor = await resolveRecordAuthor(role, loggedInDoctorAmka, loggedInPatientAmka);
        await saveRecordEdit(fileUrl, accessToken, record, editor);
      } else {
        await saveFileContent(fileUrl, accessToken, JSON.stringify(record));
      }

      // Ο ασθενής ενημερώνεται όταν γιατρός προσθέτει ή τροποποιεί εγγραφή στον φάκελό του.
      if (role === 'doctor') {
        await notifyRecordChange(params.amka, loggedInDoctorAmka, 'Εξετάσεις', isEditing ? 'edited' : 'added', record.title);
      }

      // Η λίστα ξαναδιαβάζει τον φάκελο μόλις επιστρέψει σε αυτήν η εστίαση.
      router.back();
    } catch (error: any) {
      showMessage(friendlyErrorMessage(error, "Αποτυχία σύνδεσης με το Pod."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecordFormScreen
      title={isEditing ? 'Επεξεργασία' : 'Νέα Εξέταση'}
      patientName={params.amka ? `${params.firstName} ${params.lastName}` : undefined}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Εξετάσεις"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <SelectField
        label="Τύπος"
        value={type}
        onChange={setType}
        options={EXAM_TYPES}
        placeholder="Επιλέξτε τύπο"
      />

      {role === 'patient' && (
        <SelectField
          label="Κατάσταση"
          value={statusLabel}
          onChange={setStatusLabel}
          options={EXAM_STATUS_OPTIONS}
        />
      )}

      {/* Ο ασθενής που δηλώνει εξέταση ήδη ολοκληρωμένη, το αποτέλεσμα το έχει συνήθως στο
          χέρι εκείνη τη στιγμή. Χωρίς αυτό θα έπρεπε να αποθηκεύσει, να βρει την εξέταση
          στη λίστα και να ξαναμπεί για να το ανεβάσει. Μένει προαιρετικό: μπορεί να την
          καταχωρήσει τώρα και να φέρει το αρχείο αργότερα. */}
      {role === 'patient' && statusLabel === EXAM_STATUS_COMPLETED && (
        <View style={{ marginBottom: 20 }}>
          <TouchableOpacity
            style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0 }]}
            onPress={handlePickResult}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
            <Text style={doctorStyles.diagnosisSortButtonText}>
              {resultFileName ? 'Αλλαγή Αρχείου' : 'Μεταφόρτωση Αποτελεσμάτων'}
            </Text>
          </TouchableOpacity>

          {!!resultFileName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginTop: 4 }}>
              <Ionicons name="document-outline" size={18} color={COLORS.text} style={{ marginRight: 8 }} />
              <Text style={{ flex: 1 }} numberOfLines={1}>{resultFileName}</Text>

              {/* Αφαιρείται μόνο ό,τι δεν έχει ανέβει ακόμα. Ένα αρχείο που βρίσκεται ήδη στο
                  Pod δεν το σβήνει η εφαρμογή - αντικαθίσταται, αν διαλεγεί νέο. */}
              {!!pendingResult && (
                <TouchableOpacity
                  onPress={() => setPendingResult(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Αφαίρεση αρχείου"
                >
                  <Ionicons name="close-circle-outline" size={20} color={COLORS.text} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      <RecordLinkPicker
        webId={params.webId}
        accessToken={accessToken}
        excludeCategory="Εξετάσεις"
        value={links}
        onChange={setLinks}
      />
    </RecordFormScreen>
  );
}
