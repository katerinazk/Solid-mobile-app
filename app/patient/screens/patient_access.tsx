import React, { useState } from 'react';
import { Text, View, FlatList, ScrollView, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { usePatientAccessList } from '../../../hooks/usePatientAccessList';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { addAccess, deleteAccess, updateAccessType, fetchAccessEntry } from '../../../services/access';
import { fetchPendingAccessRequestsForPatient, resolveAccessRequest } from '../../../services/accessRequests';
import { updatePodAcl, removeDoctorFromAcl } from '../../../services/solidPod';
import { PatientHeader } from '../../../components/patient/PatientHeader';

interface AccessRequest {
  id: string;
  doctor_amka: string;
  access_type: string;
  doctors: { first_name: string; last_name: string; specialty: string | null; web_id: string | null } | null;
}

export default function PatientAccessScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();
  const { accessList, setAccessList, loading, setLoading, refresh } = usePatientAccessList();

  const [isAddAccessModalVisible, setIsAddAccessModalVisible] = useState(false);
  const [newDoctorAmka, setNewDoctorAmka] = useState('');
  const [newAccessType, setNewAccessType] = useState('Πλήρης Πρόσβαση');

  const [openTypeFor, setOpenTypeFor] = useState<string | null>(null);

  const [isRequestsModalVisible, setIsRequestsModalVisible] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [openRequestTypeFor, setOpenRequestTypeFor] = useState<string | null>(null);

  const handleChangeRequestType = (requestId: string, newType: string) => {
    setRequests((prev) => prev.map((r) => r.id === requestId ? { ...r, access_type: newType } : r));
    setOpenRequestTypeFor(null);
  };

  const openRequestsModal = async () => {
    setIsRequestsModalVisible(true);
    try {
      setLoadingRequests(true);
      const { data, error } = await fetchPendingAccessRequestsForPatient(loggedInPatientAmka);
      if (error) {
        alert("Σφάλμα φόρτωσης αιτημάτων: " + error.message);
        return;
      }
      setRequests((data || []) as unknown as AccessRequest[]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleAcceptRequest = async (request: AccessRequest) => {
    try {
      setResolvingRequestId(request.id);

      // Ίδιοι έλεγχοι με τη χειροκίνητη προσθήκη - το αίτημα μπορεί να έμεινε εκκρεμές αφότου
      // ο ασθενής έδωσε ήδη πρόσβαση στον ίδιο γιατρό με το χέρι.
      const { data: existingAccess } = await fetchAccessEntry(loggedInPatientAmka, request.doctor_amka);
      if (existingAccess) {
        await resolveAccessRequest(request.id, 'accepted');
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
        alert("Έχετε ήδη δώσει πρόσβαση σε αυτόν τον γιατρό.");
        return;
      }

      // Χωρίς WebID δεν μπαίνει στο ACL: θα έπαιρνε πρόσβαση στη βάση χωρίς να βλέπει τίποτα.
      // Αφήνουμε το αίτημα εκκρεμές ώστε να το αποδεχτεί ο ασθενής μετά το login του γιατρού.
      if (!request.doctors?.web_id) {
        alert("Ο γιατρός δεν έχει συνδεθεί ακόμα στο Pod του, οπότε δεν μπορεί να του δοθεί πρόσβαση.");
        return;
      }

      const { error } = await addAccess(loggedInPatientAmka, request.doctor_amka, request.access_type);
      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      await updatePodAcl({
        activePatientFolderUrl,
        accessToken,
        accessList,
        newDoctorWebId: request.doctors.web_id,
        accessType: request.access_type,
      });

      await resolveAccessRequest(request.id, 'accepted');
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      refresh();
      alert(`Η πρόσβαση στον Δρ. ${request.doctors?.last_name || ''} δόθηκε επιτυχώς!`);
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleRejectRequest = async (request: AccessRequest) => {
    try {
      setResolvingRequestId(request.id);
      await resolveAccessRequest(request.id, 'rejected');
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleAddAccess = async () => {
    if (!newDoctorAmka) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του γιατρού.");
      return;
    }
    try {
      setLoading(true);

      const { data: doctorData, error: doctorError } = await fetchDoctorByAmka(newDoctorAmka);

      if (doctorError || !doctorData) {
        alert("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return;
      }

      // Ρωτάμε τη βάση αντί να κοιτάξουμε το accessList: αν είχε αποτύχει η φόρτωσή του, ο
      // έλεγχος θα περνούσε λάθος και θα γραφόταν διπλή εγγραφή πρόσβασης.
      const { data: existingAccess } = await fetchAccessEntry(loggedInPatientAmka, newDoctorAmka);
      if (existingAccess) {
        alert("Έχετε ήδη δώσει πρόσβαση σε αυτόν τον γιατρό.");
        return;
      }

      // Χωρίς WebID ο γιατρός δεν μπορεί να μπει στο ACL του Pod: θα γραφόταν η πρόσβαση στη
      // βάση αλλά δεν θα έβλεπε τίποτα. Το WebID συμπληρώνεται στο πρώτο του login στο Solid.
      if (!doctorData.web_id) {
        alert("Ο γιατρός δεν έχει συνδεθεί ακόμα στο Pod του, οπότε δεν μπορεί να του δοθεί πρόσβαση.");
        return;
      }

      const { error } = await addAccess(loggedInPatientAmka, newDoctorAmka, newAccessType);

      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      await updatePodAcl({
        activePatientFolderUrl,
        accessToken,
        accessList,
        newDoctorWebId: doctorData.web_id,
        accessType: newAccessType,
      });
      alert(`Η πρόσβαση στον Δρ. ${doctorData.last_name} δόθηκε επιτυχώς!`);
      setNewDoctorAmka('');
      setIsAddAccessModalVisible(false);
      refresh();
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccess = async (doctorAmka: string) => {
    Alert.alert("Κατάργηση", "Θέλετε να αφαιρέσετε αυτή την πρόσβαση;", [
      { text: "Ακύρωση", style: "cancel" },
      {
        text: "Κατάργηση",
        style: "destructive",
        onPress: async () => {
          const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
          const doctorWebId = doctorEntry?.doctors?.web_id;
          const { error } = await deleteAccess(loggedInPatientAmka, doctorAmka);

          if (!error) {
            if (doctorWebId) {
              await removeDoctorFromAcl({
                activePatientFolderUrl,
                accessToken,
                accessList,
                doctorWebId,
              });
            }
            setAccessList(prev => prev.filter(a => a.doctor_amka !== doctorAmka));
            alert("Η πρόσβαση καταργήθηκε επιτυχώς!");
          }
        }
      }
    ]);
  };

  const handleSelectAccessType = async (doctorAmka: string, newType: string) => {
    setOpenTypeFor(null);

    const doctorEntryBefore = accessList.find(a => a.doctor_amka === doctorAmka);
    if (doctorEntryBefore?.access_type === newType) return;

    const { error } = await updateAccessType(loggedInPatientAmka, doctorAmka, newType);

    if (error) { alert("Σφάλμα: " + error.message); return; }

    const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
    if (doctorEntry?.doctors?.web_id) {
      await updatePodAcl({
        activePatientFolderUrl,
        accessToken,
        accessList,
        newDoctorWebId: doctorEntry.doctors.web_id,
        accessType: newType,
      });
    }

    setAccessList(prev => prev.map(a =>
      a.doctor_amka === doctorAmka ? { ...a, access_type: newType } : a
    ));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <FlatList
        data={accessList}
        keyExtractor={(item) => item.doctor_amka}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin, flexGrow: 1 }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => setIsAddAccessModalVisible(true)}>
                <Text style={styles.addButtonText}>+ Προσθήκη Πρόσβασης</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openRequestsModal}>
                <Text style={styles.addButtonText}>Αιτήματα</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              <Text style={[localStyles.sectionTitle, { marginBottom: SPACING.sectionGap }]}>Προσβάσεις</Text>
              <View style={{ width: '70%', alignSelf: 'center' }}>
                <Text style={localStyles.searchLabel}>Αναζήτηση γιατρού:</Text>
                <View style={[localStyles.searchContainer, { marginHorizontal: 0 }]}>
                  <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <TextInput style={localStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
                </View>
              </View>
            </View>

            <TouchableOpacity style={localStyles.sortButton} onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}>
              <Text style={localStyles.sortButtonText}>↕  Όλες οι προσβάσεις</Text>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν έχετε δώσει πρόσβαση σε κανέναν γιατρό.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={localStyles.card}>
            <Text style={localStyles.doctorName}>
              Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
            </Text>
            <Text style={localStyles.specialty}>{item.doctors?.specialty}</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={localStyles.typeLabel}>Τύπος πρόσβασης: </Text>
              <View style={{ position: 'relative' }}>
                <TouchableOpacity
                  style={localStyles.typePill}
                  onPress={() => setOpenTypeFor((prev) => prev === item.doctor_amka ? null : item.doctor_amka)}
                >
                  <Text style={localStyles.typePillText}>{item.access_type}</Text>
                  <Ionicons name={openTypeFor === item.doctor_amka ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
                </TouchableOpacity>

                {openTypeFor === item.doctor_amka && (
                  <View style={localStyles.typeDropdown}>
                    {['Πλήρης Πρόσβαση', 'Μόνο Ανάγνωση'].map((type, index) => (
                      <TouchableOpacity
                        key={type}
                        style={[localStyles.typeDropdownOption, index === 0 && localStyles.typeDropdownOptionBorder]}
                        onPress={() => handleSelectAccessType(item.doctor_amka, type)}
                      >
                        <Text style={[localStyles.typeDropdownOptionText, type === item.access_type && localStyles.typeDropdownOptionTextSelected]} numberOfLines={1}>{type}</Text>
                        {type === item.access_type && <Ionicons name="checkmark" size={14} color={COLORS.primary} style={{ marginLeft: 6 }} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity style={localStyles.removeButton} onPress={() => handleDeleteAccess(item.doctor_amka)}>
              <Text style={localStyles.removeButtonText}>Κατάργηση</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Modal Προσθήκης Πρόσβασης */}
      <Modal animationType="slide" transparent={true} visible={isAddAccessModalVisible} onRequestClose={() => setIsAddAccessModalVisible(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Νέα Πρόσβαση</Text>

            <Text style={loginStyles.inputLabel}>ΑΜΚΑ Γιατρού</Text>
            <TextInput
              style={loginStyles.loginInput}
              placeholder="11 ψηφία"
              keyboardType="numeric"
              value={newDoctorAmka}
              onChangeText={setNewDoctorAmka}
            />

            <Text style={loginStyles.inputLabel}>Τύπος Πρόσβασης</Text>
            <View style={{ flexDirection: 'row', marginBottom: 20 }}>
              <TouchableOpacity
                style={[styles.modalButton, { flex: 1, marginRight: 5, backgroundColor: newAccessType === 'Πλήρης Πρόσβαση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
                onPress={() => setNewAccessType('Πλήρης Πρόσβαση')}
              >
                <Text style={{ color: newAccessType === 'Πλήρης Πρόσβαση' ? COLORS.white : COLORS.text, textAlign: 'center' }}>Πλήρης</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { flex: 1, marginLeft: 5, backgroundColor: newAccessType === 'Μόνο Ανάγνωση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
                onPress={() => setNewAccessType('Μόνο Ανάγνωση')}
              >
                <Text style={{ color: newAccessType === 'Μόνο Ανάγνωση' ? COLORS.white : COLORS.text, textAlign: 'center' }}>Μόνο Ανάγνωση</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsAddAccessModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddAccess} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Εντάξει</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Αιτημάτων Πρόσβασης */}
      <Modal animationType="slide" transparent={true} visible={isRequestsModalVisible} onRequestClose={() => setIsRequestsModalVisible(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Αιτήματα Πρόσβασης</Text>
              <TouchableOpacity onPress={() => setIsRequestsModalVisible(false)} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {loadingRequests ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : requests.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 0, marginBottom: 10 }]}>Δεν υπάρχουν εκκρεμή αιτήματα.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {requests.map((item) => (
                  <View key={item.id} style={localStyles.requestCard}>
                    <Text style={localStyles.doctorName}>
                      Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
                    </Text>
                    {!!item.doctors?.specialty && <Text style={localStyles.specialty}>{item.doctors.specialty}</Text>}

                    <Text style={[localStyles.typeLabel, { marginBottom: 6 }]}>Τύπος πρόσβασης:</Text>
                    <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
                      <TouchableOpacity
                        style={localStyles.typePill}
                        onPress={() => setOpenRequestTypeFor((prev) => prev === item.id ? null : item.id)}
                      >
                        <Text style={localStyles.typePillText}>{item.access_type}</Text>
                        <Ionicons name={openRequestTypeFor === item.id ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
                      </TouchableOpacity>

                      {openRequestTypeFor === item.id && (
                        <View style={localStyles.typeDropdown}>
                          {['Πλήρης Πρόσβαση', 'Μόνο Ανάγνωση'].map((type, index) => (
                            <TouchableOpacity
                              key={type}
                              style={[localStyles.typeDropdownOption, index === 0 && localStyles.typeDropdownOptionBorder]}
                              onPress={() => handleChangeRequestType(item.id, type)}
                            >
                              <Text style={[localStyles.typeDropdownOptionText, type === item.access_type && localStyles.typeDropdownOptionTextSelected]} numberOfLines={1}>{type}</Text>
                              {type === item.access_type && <Ionicons name="checkmark" size={14} color={COLORS.primary} style={{ marginLeft: 6 }} />}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>

                    <View style={{ flexDirection: 'row', marginTop: 10 }}>
                      <TouchableOpacity
                        style={[localStyles.requestActionButton, { backgroundColor: COLORS.primary, marginRight: 8 }]}
                        onPress={() => handleAcceptRequest(item)}
                        disabled={resolvingRequestId === item.id}
                      >
                        {resolvingRequestId === item.id ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={localStyles.requestActionButtonText}>Αποδοχή</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[localStyles.requestActionButton, { backgroundColor: COLORS.danger }]}
                        onPress={() => handleRejectRequest(item)}
                        disabled={resolvingRequestId === item.id}
                      >
                        <Text style={localStyles.requestActionButtonText}>Απόρριψη</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  sectionTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap },
  searchLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, marginHorizontal: SPACING.sideMargin, paddingHorizontal: 15, marginBottom: SPACING.sectionGap, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  sortButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, justifyContent: 'center', alignItems: 'center', borderRadius: 25, marginHorizontal: SPACING.sideMargin, marginBottom: SPACING.sectionGap },
  sortButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  card: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  doctorName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  specialty: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2, marginBottom: SPACING.groupGap },
  typeLabel: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  typePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8 },
  typePillText: { color: COLORS.primary, fontWeight: '600', fontSize: TYPOGRAPHY.secondaryText },
  typeDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 5,
  },
  typeDropdownOption: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  typeDropdownOptionBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.lightest },
  typeDropdownOptionText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text },
  typeDropdownOptionTextSelected: { color: COLORS.primary, fontWeight: 'bold' },
  removeButton: { backgroundColor: COLORS.danger, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  removeButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  requestCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: 12 },
  requestActionButton: { flex: 1, minHeight: TOUCH.buttonHeight, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  requestActionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText },
});
