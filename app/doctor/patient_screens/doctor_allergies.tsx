import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';

const CATEGORY = 'Αλλεργίες';

interface Allergy {
  url: string;
  title: string;
  reaction: string;
  doctorName: string;
  doctorAmka: string;
}

export default function DoctorAllergiesScreen() {
  const { amka, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';

  const [loading, setLoading] = useState(false);
  const [allergies, setAllergies] = useState<Allergy[]>([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formReaction, setFormReaction] = useState('');

  const loadAllergies = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - θα δημιουργηθεί αυτόματα με την πρώτη
          // αλλεργία που θα προστεθεί. Μέχρι τότε δείχνουμε απλώς άδεια λίστα.
          files = [];
        }
      }

      const allergyFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(allergyFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            reaction: record.reaction,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
          } as Allergy;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((a): a is Allergy => a !== null);
      setAllergies(valid);
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAllergy = async () => {
    if (!formTitle.trim() || !formReaction.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
      const doctorName = doctorData
        ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
        : 'Δρ.';

      const record = {
        title: formTitle.trim(),
        reaction: formReaction.trim(),
        doctorName,
        doctorAmka: loggedInDoctorAmka,
      };

      const fileUrl = `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      setAllergies((prev) => [{ url: fileUrl, ...record }, ...prev]);
      setIsAddModalVisible(false);
      setFormTitle('');
      setFormReaction('');
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadAllergies();
  }, []);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Αλλεργίες</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => setIsAddModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Προσθήκη Αλλεργίας</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : allergies.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν αλλεργίες.</Text>
      ) : (
        <FlatList
          data={allergies}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                {item.doctorAmka === loggedInDoctorAmka && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αντίδραση: </Text>{item.reaction}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
              </Text>
            </View>
          )}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Νέα Αλλεργία</Text>
              <TouchableOpacity
                onPress={() => setIsAddModalVisible(false)}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formTitle} onChangeText={setFormTitle} />

            <Text style={loginStyles.inputLabel}>Αντίδραση</Text>
            <TextInput
              style={[styles.textArea, localStyles.input, { height: 130 }]}
              multiline
              value={formReaction}
              onChangeText={setFormReaction}
            />

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSaveAllergy}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Εντάξει</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
  },
});
