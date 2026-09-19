import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { fetchDoctorByAmka, updateDoctor } from '../../../services/doctors';
import { AccountScreen, AccountField } from '../../../components/AccountScreen';
import { showMessage } from '../../../utils/appMessage';

interface DoctorProfile {
  first_name: string;
  last_name: string;
  amka: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
}

export default function DoctorAccountScreen() {
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
      showMessage("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα και Επίθετο.");
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
        showMessage("Σφάλμα αποθήκευσης: " + error.message);
        return;
      }

      await loadDoctor();
      setIsEditing(false);
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setSaving(false);
    }
  };

  // Το ΑΜΚΑ δεν έχει "form": σε αυτό κρέμονται οι πρόσβασεις που του έδωσαν οι ασθενείς και
  // η υπογραφή κάθε εγγραφής που έχει καταχωρήσει.
  const fields: AccountField[] = [
    { label: 'Όνομα', value: doctor?.first_name || '', form: { value: formFirstName, onChange: setFormFirstName } },
    { label: 'Επίθετο', value: doctor?.last_name || '', form: { value: formLastName, onChange: setFormLastName } },
    { label: 'ΑΜΚΑ', value: doctor?.amka || '' },
    { label: 'Ειδικότητα', value: doctor?.specialty || '', form: { value: formSpecialty, onChange: setFormSpecialty } },
    { label: 'Τηλέφωνο', value: doctor?.phone || '', form: { value: formPhone, onChange: setFormPhone, keyboardType: 'numeric' } },
    { label: 'Email', value: doctor?.email || '', form: { value: formEmail, onChange: setFormEmail, keyboardType: 'email-address', autoCapitalize: 'none' } },
  ];

  return (
    <AccountScreen
      fields={fields}
      loading={loading}
      hasData={!!doctor}
      isEditing={isEditing}
      saving={saving}
      onStartEditing={startEditing}
      onCancelEditing={() => setIsEditing(false)}
      onSave={handleSave}
    />
  );
}
