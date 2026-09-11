import React, { useState } from 'react';
import { Text, View, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';
import { SelectField } from '../../../components/SelectField';
import { ADMINISTRATION_ROUTES, matchAdministrationRoute } from '../../../constants/medicalOptions';
import { RecordLinkPicker } from '../../../components/RecordLinkPicker';
import { LinkedRecord, parseLinkedRecords } from '../../../services/historyRecords';

export default function DoctorMedicationFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχοντος φαρμάκου.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editDosage?: string;
    editRoute?: string;
    editDurationDays?: string;
    editDurationMonths?: string;
    editStartDate?: string;
    // 'true' | 'false' | undefined - οι παλιές εγγραφές δεν έχουν αυτή την έννοια.
    editStarted?: string;
    // Οι σύνδεσμοι προς άλλες εγγραφές ιστορικού, ως JSON πίνακας.
    editLinks?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Φάρμακα') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [dosage, setDosage] = useState(params.editDosage || '');
  const [route, setRoute] = useState(params.editRoute || '');
  const [durationDays, setDurationDays] = useState(params.editDurationDays || '');
  const [durationMonths, setDurationMonths] = useState(params.editDurationMonths || '');
  const [links, setLinks] = useState<LinkedRecord[]>(parseLinkedRecords(params.editLinks));
  const [saving, setSaving] = useState(false);

  // Ο κατάλογος ATC ξέρει τους τρόπους χορήγησης για ένα μέρος των ουσιών. Όταν ορίζει
  // ακριβώς έναν, τον προεπιλέγουμε - ο γιατρός μπορεί πάντα να τον αλλάξει.
  const handleCodeChange = (code: MedicalCode | null) => {
    setSelectedCode(code);

    const catalogRoutes = (code?.routes || '').split(',').map((r) => r.trim()).filter(Boolean);
    if (catalogRoutes.length !== 1) return;

    const matched = matchAdministrationRoute(catalogRoutes[0]);
    if (matched) setRoute(matched);
  };

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !route || !dosage.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    // Οι μήνες είναι προαιρετικοί, αλλά κάποια διάρκεια πρέπει να δοθεί - αλλιώς η αγωγή
    // θα τελείωνε τη στιγμή που ξεκινά.
    const days = Number(durationDays || 0);
    const months = Number(durationMonths || 0);
    if (days + months <= 0) {
      alert("Συμπληρώστε τη διάρκεια χορήγησης σε μέρες ή σε μήνες.");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε γιατρό και ημερομηνία έναρξης της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      let startDate = params.editStartDate || '';
      if (!isEditing) {
        const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
        doctorName = doctorData
          ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
          : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
        // Η ημερομηνία έναρξης μένει κενή: τη συμπληρώνει ο ασθενής όταν πατήσει "Έναρξη"
        // στη δική του οθόνη. Πριν από αυτό δεν έχει αρχίσει καμία αγωγή.
        startDate = '';
      }

      // Νέα εγγραφή -> ξεκινάει "εκκρεμής" (started: false) μέχρι ο ασθενής να πατήσει
      // "Έναρξη" στη δική του οθόνη. Επεξεργασία -> διατηρεί ό,τι ίσχυε ήδη.
      const started = isEditing
        ? (params.editStarted === 'true' ? true : params.editStarted === 'false' ? false : undefined)
        : false;

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        route,
        dosage: dosage.trim(),
        startDate,
        durationDays: days,
        durationMonths: months || undefined,
        doctorName,
        doctorAmka,
        started,
        links: links.length > 0 ? links : undefined,
      };

      const fileUrl = params.editUrl || `${folderUrl}${Date.now()}.json`;
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
      title={isEditing ? 'Επεξεργασία' : 'Νέο Φάρμακο'}
      amka={params.amka}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Φάρμακα"
        value={selectedCode}
        onChange={handleCodeChange}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <SelectField
        label="Τρόπος Χορήγησης"
        value={route}
        onChange={setRoute}
        options={ADMINISTRATION_ROUTES}
        placeholder="Επιλέξτε τρόπο"
      />

      <Text style={loginStyles.inputLabel}>Δοσολογία</Text>
      <TextInput style={[loginStyles.loginInput, formStyles.input]} value={dosage} onChangeText={setDosage} />

      <Text style={loginStyles.inputLabel}>Διάρκεια Χορήγησης</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}>
        <TextInput
          style={[loginStyles.loginInput, formStyles.input, { width: 80, marginBottom: 0, textAlign: 'center' }]}
          keyboardType="numeric"
          maxLength={3}
          value={durationDays}
          onChangeText={(text) => setDurationDays(text.replace(/[^0-9]/g, '').slice(0, 3))}
        />
        <Text style={[loginStyles.inputLabel, { marginLeft: 10, marginBottom: 0 }]}>Ημέρες</Text>

        <TextInput
          style={[loginStyles.loginInput, formStyles.input, { width: 80, marginBottom: 0, marginLeft: 20, textAlign: 'center' }]}
          keyboardType="numeric"
          maxLength={2}
          value={durationMonths}
          onChangeText={(text) => setDurationMonths(text.replace(/[^0-9]/g, '').slice(0, 2))}
        />
        <Text style={[loginStyles.inputLabel, { marginLeft: 10, marginBottom: 0 }]}>Μήνες</Text>
      </View>

      <RecordLinkPicker
        webId={params.webId}
        accessToken={accessToken}
        excludeCategory="Φάρμακα"
        value={links}
        onChange={setLinks}
      />
    </DoctorFormScreen>
  );
}
