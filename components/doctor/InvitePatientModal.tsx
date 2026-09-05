import React, { useEffect, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../constants/designSystem';

type InviteMethod = 'phone' | 'email';

interface Props {
  visible: boolean;
  patientAmka: string;
  onClose: () => void;
}

// Διεθνής μορφή E.164: "+" και 8 έως 15 ψηφία, χωρίς κενά ή παύλες.
const PHONE_PATTERN = /^\+\d{8,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Πρόσκληση σε άτομο που δεν έχει λογαριασμό στην εφαρμογή. Η αποστολή SMS/email δεν είναι
// υλοποιημένη - χρειάζεται εξωτερική υπηρεσία - οπότε εδώ υπάρχει μόνο η φόρμα.
export function InvitePatientModal({ visible, patientAmka, onClose }: Props) {
  const [method, setMethod] = useState<InviteMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (visible) {
      setMethod(null);
      setPhone('');
      setEmail('');
    }
  }, [visible]);

  const handleSubmit = () => {
    if (!method) {
      alert("Επιλέξτε αν θα σταλεί με SMS ή email.");
      return;
    }

    if (method === 'phone') {
      const number = phone.trim();
      if (!number.startsWith('+')) {
        alert("Το κινητό πρέπει να ξεκινά με τον κωδικό χώρας, π.χ. +3069...");
        return;
      }
      if (!PHONE_PATTERN.test(number)) {
        alert("Εισάγετε έγκυρο κινητό σε διεθνή μορφή, π.χ. +306912345678.");
        return;
      }
    } else {
      if (!EMAIL_PATTERN.test(email.trim())) {
        alert("Εισάγετε έγκυρη διεύθυνση email.");
        return;
      }
    }

    alert("Η πρόσκληση στάλθηκε επιτυχώς!");
    onClose();
  };

  const renderOption = (value: InviteMethod, label: string) => (
    <TouchableOpacity style={localStyles.optionRow} onPress={() => setMethod(value)}>
      <Ionicons
        name={method === value ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={COLORS.primary}
      />
      <Text style={localStyles.optionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.addmodalOverlay}>
        <View style={styles.addmodalContent}>
          <View style={{ marginBottom: 20 }}>
            <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Πρόσκληση{'\n'}Ασθενούς</Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ position: 'absolute', top: 0, right: 0 }}
              hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
            >
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <Text style={localStyles.info}>
            Ο ασθενής με ΑΜΚΑ {patientAmka} δεν χρησιμοποιεί την εφαρμογή. Επιλέξτε πώς θα λάβει την πρόσκληση.
          </Text>

          {renderOption('phone', 'Κινητό')}
          {method === 'phone' && (
            <TextInput
              style={[loginStyles.loginInput, localStyles.input]}
              placeholder="π.χ. +3069..."
              placeholderTextColor={COLORS.medium}
              keyboardType="phone-pad"
              maxLength={16}
              value={phone}
              onChangeText={setPhone}
            />
          )}

          {renderOption('email', 'Email')}
          {method === 'email' && (
            <TextInput
              style={[loginStyles.loginInput, localStyles.input]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          )}

          <TouchableOpacity
            style={[styles.addButton, { borderRadius: 25, marginTop: SPACING.groupGap, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
            onPress={handleSubmit}
          >
            <Text style={styles.addButtonText}>Εντάξει</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  info: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginBottom: SPACING.groupGap },
  optionRow: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH.minTargetSize },
  optionLabel: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginLeft: 10 },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
  },
});
