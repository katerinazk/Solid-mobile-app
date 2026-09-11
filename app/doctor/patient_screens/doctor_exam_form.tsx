import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';
import { SelectField } from '../../../components/SelectField';
import { EXAM_TYPES } from '../../../constants/medicalOptions';
import { RecordLinkPicker } from '../../../components/RecordLinkPicker';
import { LinkedRecord, parseLinkedRecords, filterExistingLinks } from '../../../services/historyRecords';

export default function DoctorExamFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
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

  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Εξετάσεις') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [type, setType] = useState(params.editType || '');
  const [links, setLinks] = useState<LinkedRecord[]>(parseLinkedRecords(params.editLinks));
  const [saving, setSaving] = useState(false);

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

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !type.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε τον γιατρό της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      if (!isEditing) {
        const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
        doctorName = doctorData
          ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
          : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
      }

      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        type,
        // Η ολοκλήρωση γίνεται από τον ασθενή, ανεβάζοντας το αποτέλεσμα - εδώ απλώς
        // διατηρούμε ό,τι ισχύει ήδη.
        status: (params.editStatus as 'pending' | 'completed') || 'pending',
        doctorName,
        doctorAmka,
        completedDate: params.editCompletedDate,
        resultFile: params.editResultFile,
        // Στην επεξεργασία κρατάμε την αρχική ημερομηνία καταχώρησης, δεν τη μηδενίζουμε.
        createdDate: params.editCreatedDate || todayIso,
        links: links.length > 0 ? links : undefined,
      };

      const fileUrl = params.editUrl || newRecordFileName(folderUrl);
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      // Η λίστα ξαναδιαβάζει τον φάκελο μόλις επιστρέψει σε αυτήν η εστίαση.
      router.back();
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DoctorFormScreen
      title={isEditing ? 'Επεξεργασία' : 'Νέα Εξέταση'}
      amka={params.amka}
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

      <RecordLinkPicker
        webId={params.webId}
        accessToken={accessToken}
        excludeCategory="Εξετάσεις"
        value={links}
        onChange={setLinks}
      />
    </DoctorFormScreen>
  );
}
