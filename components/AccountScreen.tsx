import React, { useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, ScrollView, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { doctorStyles } from '../constants/doctorStyles';
import { sharedStyles as styles } from '../constants/sharedStyles';
import { loginStyles } from '../constants/loginStyles';
import { SPACING, TYPOGRAPHY, TOUCH } from '../constants/designSystem';
import { useAuth } from '../hooks/useAuth';
import { SelectField } from './SelectField';
import { DateField } from './DateField';
import { SOLID_PROVIDERS } from '../constants/solidProviders';
import { askConfirm } from '../utils/appMessage';

/**
 * Ένα στοιχείο του λογαριασμού.
 *
 * Η απουσία του "form" σημαίνει ότι το στοιχείο δεν αλλάζει - όπως το ΑΜΚΑ, που είναι η
 * ταυτότητα του χρήστη μέσα στο σύστημα και δεν έχει νόημα να επεξεργάζεται.
 */
export interface AccountField {
  label: string;
  value: string;
  form?: {
    value: string;
    onChange: (text: string) => void;
    keyboardType?: 'numeric' | 'email-address';
    autoCapitalize?: 'none';
    placeholder?: string;
    // Όταν δίνονται επιλογές, το πεδίο παύει να δέχεται ελεύθερο κείμενο.
    options?: readonly string[];
    // Ημερομηνία: ανοίγει ημερολόγιο αντί για πληκτρολόγιο.
    isDate?: boolean;
  };
}

/**
 * Η οθόνη "Λογαριασμός", κοινή για γιατρό και ασθενή.
 *
 * Ενώνει όσα ήταν χωρισμένα σε δύο σημεία: τα στοιχεία του προφίλ, που άνοιγαν από το
 * εικονίδιο της κεφαλίδας, και τις δύο ενέργειες λογαριασμού, που είχαν δική τους καρτέλα
 * "Ρυθμίσεις" με μόνο περιεχόμενο αυτά τα δύο κουμπιά. Καμία από τις δύο δεν ήταν ρύθμιση:
 * και η αποσύνδεση και η αλλαγή Pod αφορούν το ποιος είναι συνδεδεμένος.
 *
 * Κάθε ρόλος δίνει μόνο τα δικά του πεδία - τα υπόλοιπα (διάταξη, επεξεργασία, κουμπιά)
 * ζουν εδώ, μία φορά.
 */
export function AccountScreen({
  fields, loading, hasData, isEditing, saving, onStartEditing, onCancelEditing, onSave,
}: {
  fields: AccountField[];
  loading: boolean;
  hasData: boolean;
  isEditing: boolean;
  saving: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
}) {
  const { role, confirmLogout, isSwitchingPod, switchPodWithHistory } = useAuth();
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);

  // Ο ασθενής ρωτιέται αν θέλει να μεταφερθεί το ιστορικό του. Και στις δύο περιπτώσεις (όπως και ο
  // γιατρός) διαλέγει τον νέο πάροχο και συνδέεται σε αυτόν χωρίς να φύγει από το παλιό Pod.
  const [copyHistory, setCopyHistory] = useState(false);

  const handleSwitchPod = async () => {
    if (role === 'patient') {
      const wantsCopy = await askConfirm({
        message: 'Θέλετε να μεταφερθεί το ιατρικό σας ιστορικό στο νέο Pod;\n\nΑν πατήσετε "Όχι", το ιστορικό μένει μόνο στο παλιό Pod και το νέο ξεκινά χωρίς εγγραφές.',
        confirmText: 'Ναι',
        cancelText: 'Όχι',
      });
      setCopyHistory(wantsCopy);
    } else {
      const confirmed = await askConfirm({
        message: 'Θα συνδεθείτε σε νέο Pod. Οι ασθενείς σας θα σας ξαναεμφανιστούν καθώς ο καθένας τους μπαίνει στην εφαρμογή και ενημερώνεται ο φάκελός του.',
        confirmText: 'Συνέχεια',
        cancelText: 'Ακύρωση',
      });
      if (!confirmed) return;
      setCopyHistory(false);
    }
    setIsProviderPickerOpen(true);
  };

  const handlePickProvider = (providerUrl: string) => {
    setIsProviderPickerOpen(false);
    switchPodWithHistory(providerUrl, copyHistory);
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        {/* Η οθόνη είναι καρτέλα: δεν υπάρχει "πίσω" παρά μόνο για να βγει από την
            επεξεργασία χωρίς να αποθηκεύσει. */}
        {isEditing && (
          <TouchableOpacity
            onPress={onCancelEditing}
            style={doctorStyles.historyBackButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Ακύρωση επεξεργασίας"
          >
            <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        <Text style={doctorStyles.historyTitle}>{isEditing ? 'Επεξεργασία\nΛογαριασμού' : 'Λογαριασμός'}</Text>

        {!isEditing && hasData && (
          <TouchableOpacity
            onPress={onStartEditing}
            style={localStyles.editButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Επεξεργασία λογαριασμού"
          >
            <Ionicons name="pencil-outline" size={26} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : !hasData ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν βρέθηκαν στοιχεία.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap, paddingBottom: SPACING.bottomMargin }}
          keyboardShouldPersistTaps="handled"
        >
          {fields.map((field) => {
            // Η ημερομηνία γράφεται με ημερολόγιο: πληκτρολογημένη, η ίδια μέρα μπορεί να γραφτεί
            // με πέντε τρόπους - και η ηλικία του ασθενή υπολογίζεται από αυτήν.
            if (isEditing && field.form?.isDate) {
              const form = field.form;
              return (
                <View key={field.label} style={{ marginBottom: SPACING.groupGap }}>
                  <DateField
                    label={field.label}
                    labelStyle={localStyles.label}
                    inputStyle={localStyles.input}
                    value={form.value}
                    onChange={form.onChange}
                    maximumDate={new Date()}
                  />
                </View>
              );
            }

            // Το πεδίο κλειστής λίστας φέρνει τη δική του ετικέτα, οπότε δεν τη γράφουμε ξανά.
            if (isEditing && field.form?.options) {
              return (
                <SelectField
                  key={field.label}
                  label={field.label}
                  labelStyle={localStyles.label}
                  inputStyle={localStyles.input}
                  value={field.form.value}
                  onChange={field.form.onChange}
                  options={field.form.options}
                />
              );
            }

            return (
              <View key={field.label} style={isEditing ? undefined : { marginBottom: SPACING.sectionGap }}>
                <Text style={isEditing ? localStyles.label : localStyles.viewLabel}>{field.label}</Text>

                {isEditing ? (
                  <TextInput
                    style={[localStyles.input, !field.form && { color: COLORS.medium }]}
                    value={field.form ? field.form.value : field.value}
                    onChangeText={field.form?.onChange}
                    editable={!!field.form}
                    keyboardType={field.form?.keyboardType}
                    autoCapitalize={field.form?.autoCapitalize}
                    placeholder={field.form?.placeholder}
                    placeholderTextColor={COLORS.medium}
                  />
                ) : (
                  <Text style={{ fontSize: TYPOGRAPHY.bodyText, color: COLORS.text }}>{field.value || '-'}</Text>
                )}
              </View>
            );
          })}

          {isEditing ? (
            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, width: '70%', alignSelf: 'center', marginTop: SPACING.groupGap }]}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Αποθήκευση</Text>}
            </TouchableOpacity>
          ) : (
            // Οι δύο ενέργειες λογαριασμού κάθονται στο τέλος, μετά τα στοιχεία: πρώτα βλέπεις
            // ποιος είσαι, μετά μπορείς να φύγεις. Στην επεξεργασία δεν εμφανίζονται - εκεί η
            // μόνη ενέργεια είναι η αποθήκευση.
            <View style={{ marginTop: SPACING.sectionGap }}>
              <TouchableOpacity style={localStyles.secondaryButton} onPress={handleSwitchPod}>
                <Ionicons name="swap-horizontal-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={localStyles.secondaryButtonText}>Σύνδεση με άλλο Pod</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addButton, { borderRadius: 25, flexDirection: 'row', marginBottom: 0 }]}
                onPress={confirmLogout}
              >
                <Ionicons name="log-out-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                <Text style={styles.addButtonText}>Αποσύνδεση</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Επιλογή του νέου παρόχου, όταν ο ασθενής θέλει να μεταφερθεί το ιστορικό του. */}
      <Modal animationType="slide" transparent={true} visible={isProviderPickerOpen} onRequestClose={() => setIsProviderPickerOpen(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0, flex: 1 }]}>Νέος πάροχος Pod</Text>
              <TouchableOpacity onPress={() => setIsProviderPickerOpen(false)} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {SOLID_PROVIDERS.map((provider) => (
                <TouchableOpacity key={provider.url} style={localStyles.providerOption} onPress={() => handlePickProvider(provider.url)}>
                  <Text style={localStyles.providerOptionText}>{provider.name} ({provider.region})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Όσο γίνεται η σύνδεση στο νέο Pod και η αντιγραφή, η οθόνη δεν πατιέται. */}
      {isSwitchingPod && (
        <View style={localStyles.busyOverlay}>
          <ActivityIndicator size="large" color={COLORS.white} />
          <Text style={localStyles.busyText}>Σύνδεση στο νέο Pod…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  providerOption: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: SPACING.groupGap },
  providerOptionText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, fontWeight: '600' },
  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(48,70,116,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  busyText: { color: COLORS.white, fontSize: TYPOGRAPHY.bodyText, fontWeight: 'bold', marginTop: 14, textAlign: 'center' },
  // Στη δεξιά άκρη της κεφαλίδας, εκεί όπου ήταν και το εικονίδιο του προφίλ πριν ενωθούν
  // οι δύο οθόνες.
  // Χωρίς "top": το εικονίδιο του μολυβιού είναι μικρότερο από το βελάκι επιστροφής και
  // κεντράρεται κατακόρυφα μόνο του, στο ύψος του τίτλου.
  editButton: { position: 'absolute', right: SPACING.sideMargin },
  viewLabel: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  label: { ...loginStyles.inputLabel, color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle },
  input: { ...loginStyles.loginInput, backgroundColor: COLORS.lightest, borderRadius: 25 },
  // Δευτερεύουσα ενέργεια: περιγραμμένη αντί για γεμάτη, ώστε να μην ανταγωνίζεται οπτικά
  // την αποσύνδεση ακριβώς από κάτω.
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.groupGap,
  },
  secondaryButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
