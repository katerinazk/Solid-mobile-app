import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { fetchPatientByAmka, updatePatient } from '../../../services/patients';
import { AccountScreen, AccountField } from '../../../components/AccountScreen';
import { showMessage } from '../../../utils/appMessage';
import { friendlyErrorMessage } from '../../../utils/networkError';
import { SEX_OPTIONS, BLOOD_TYPES } from '../../../constants/medicalOptions';
import { formatDate } from '../../../utils/age';

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

export default function PatientAccountScreen() {
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
      showMessage("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα και Επίθετο.");
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
        showMessage(friendlyErrorMessage(error, "Σφάλμα αποθήκευσης."));
        return;
      }

      await loadPatient();
      setIsEditing(false);
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setSaving(false);
    }
  };

  // Το ΑΜΚΑ δεν έχει "form": είναι η ταυτότητα του ασθενή μέσα στο σύστημα και σε αυτό
  // κρέμονται οι εγγραφές του Pod και οι προσβάσεις των γιατρών.
  const fields: AccountField[] = [
    { label: 'Όνομα', value: patient?.first_name || '', form: { value: formFirstName, onChange: setFormFirstName } },
    { label: 'Επίθετο', value: patient?.last_name || '', form: { value: formLastName, onChange: setFormLastName } },
    { label: 'ΑΜΚΑ', value: patient?.amka || '' },
    { label: 'Ημερομηνία Γέννησης', value: formatDate(patient?.birth_date), form: { value: formBirthDate, onChange: setFormBirthDate, isDate: true } },
    { label: 'Φύλο', value: patient?.sex || '', form: { value: formSex, onChange: setFormSex, options: SEX_OPTIONS } },
    { label: 'Ομάδα Αίματος', value: patient?.blood_type || '', form: { value: formBloodType, onChange: setFormBloodType, options: BLOOD_TYPES } },
    { label: 'Τηλέφωνο', value: patient?.phone || '', form: { value: formPhone, onChange: setFormPhone, keyboardType: 'numeric' } },
    { label: 'Email', value: patient?.email || '', form: { value: formEmail, onChange: setFormEmail, keyboardType: 'email-address', autoCapitalize: 'none' } },
  ];

  return (
    <AccountScreen
      fields={fields}
      loading={loading}
      hasData={!!patient}
      isEditing={isEditing}
      saving={saving}
      onStartEditing={startEditing}
      onCancelEditing={() => setIsEditing(false)}
      onSave={handleSave}
    />
  );
}
