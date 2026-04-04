import 'react-native-get-random-values';
import 'text-encoding';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Linking, Modal } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { supabase } from './supabase';
// Φέρνουμε τα εργαλεία του Solid για να διαβάζουμε φακέλους (Containers)
import { getSolidDataset, getContainedResourceUrlAll } from '@inrupt/solid-client';

interface Patient {
  id: string;
  name: string;
  amka: string;
  accessType: string;
  webId: string;
}

export default function App() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ΝΕΕΣ ΜΝΗΜΕΣ ΓΙΑ ΤΟΝ ΦΑΚΕΛΟ
  const [modalVisible, setModalVisible] = useState(false);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [activePatientName, setActivePatientName] = useState('');

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('patients').select('*');

      if (error) {
        console.error("Σφάλμα κατά τη λήψη:", error.message);
        return;
      }

      if (data) {
        const formattedPatients: Patient[] = data.map((item) => ({
          id: item.id,
          name: item.name,
          amka: item.amka,
          accessType: item.access_type,
          webId: item.web_id,
        }));
        setPatients(formattedPatients);
      }
    } catch (error) {
      console.error("Απρόσμενο σφάλμα:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Η ΝΕΑ ΣΥΝΑΡΤΗΣΗ ΠΟΥ ΔΙΑΒΑΖΕΙ ΤΟΝ ΦΑΚΕΛΟ ---
  const handleOpenFolder = async (webId: string, patientName: string) => {
    if (!webId) {
      Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID για αυτόν τον ασθενή.");
      return;
    }

    try {
      setLoading(true);
      
      // 1. Μετατρέπουμε το προφίλ στο URL του φακέλου public
      const folderUrl = webId.replace('profile/card#me', 'public/');

      // 2. Ζητάμε από το Solid να μας φέρει τα δεδομένα του Φακέλου
      const myDataset = await getSolidDataset(folderUrl);

      // 3. Εξάγουμε όλα τα links των αρχείων που βρίσκονται μέσα
      const files = getContainedResourceUrlAll(myDataset);

      // 4. Αν όλα πάνε καλά, τα αποθηκεύουμε και ανοίγουμε το παράθυρο
      setFolderFiles(files);
      setActivePatientName(patientName);
      setModalVisible(true);

    } catch (error) {
      console.error("Σφάλμα Solid:", error);
      Alert.alert("Πρόβλημα Πρόσβασης", "Δεν ήταν δυνατή η ανάγνωση του φακέλου. Μήπως είναι κλειδωμένος;");
    } finally {
      setLoading(false);
    }
  };

  // Συνάρτηση που ανοίγει το επιλεγμένο αρχείο στο κινητό
  const openFile = async (fileUrl: string) => {
    const supported = await Linking.canOpenURL(fileUrl);
    if (supported) {
      await Linking.openURL(fileUrl);
    } else {
      Alert.alert("Πρόβλημα", "Το κινητό δεν υποστηρίζει το άνοιγμα αυτού του αρχείου.");
    }
  };

  const renderPatientCard = ({ item }: { item: Patient }) => (
    <View style={styles.card}>
      <View style={styles.cardDetails}>
        <Text style={styles.patientName}>{item.name}</Text>
        <Text style={styles.cardLabel}>AMKA:</Text>
        <Text style={styles.cardValue}>{item.amka}</Text>
        <Text style={styles.cardLabel}>Τύπος πρόσβασης:</Text>
        <Text style={styles.cardValue}>{item.accessType}</Text>
      </View>

      <TouchableOpacity 
        style={styles.cardActionButton}
        onPress={() => handleOpenFolder(item.webId, item.name)}
      >
        <Text style={styles.cardActionButtonText}>Προβολή Φακέλου</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Feather name="list" size={32} color="#2c3e50" />
        <Ionicons name="person-circle-outline" size={42} color="#2c3e50" />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#7f8c8d" style={styles.searchIcon} />
        <TextInput style={styles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor="#7f8c8d" />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={patients}
          keyExtractor={(item) => item.id}
          renderItem={renderPatientCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* --- ΤΟ ΑΝΑΔΥΟΜΕΝΟ ΠΑΡΑΘΥΡΟ (MODAL) ΤΟΥ ΦΑΚΕΛΟΥ --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Φάκελος: {activePatientName}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#e74c3c" />
              </TouchableOpacity>
            </View>

            {folderFiles.length === 0 ? (
              <Text style={styles.emptyText}>Ο φάκελος είναι άδειος.</Text>
            ) : (
              <FlatList
                data={folderFiles}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => {
                  // Παίρνουμε μόνο το όνομα του αρχείου από το μακρύ link για να φαίνεται ωραία
                  const fileName = item.split('/').pop() || 'Άγνωστο Αρχείο';
                  return (
                    <TouchableOpacity style={styles.fileItem} onPress={() => openFile(item)}>
                      <Ionicons name="document-text" size={24} color="#3498db" style={{marginRight: 15}} />
                      <Text style={styles.fileName}>{decodeURIComponent(fileName)}</Text>
                      <Feather name="external-link" size={20} color="#7f8c8d" />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavTextActive}>Αρχική</Text></TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavText}>Προσβάσεις</Text></TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavText}>Ρυθμίσεις</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ecf0f1' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 20 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 25, marginHorizontal: 20, paddingHorizontal: 15, marginBottom: 20, borderColor: '#7f8c8d', borderWidth: 1 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, height: 40, fontSize: 16, color: '#2c3e50' },
  listContent: { paddingHorizontal: 20, paddingBottom: 90 },
  card: { backgroundColor: 'white', borderRadius: 15, padding: 20, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  cardDetails: { marginBottom: 15 },
  patientName: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  cardLabel: { fontSize: 14, color: '#7f8c8d', fontWeight: '600', marginBottom: 2 },
  cardValue: { fontSize: 16, color: '#34495e', marginBottom: 10 },
  cardActionButton: { backgroundColor: '#3b5998', paddingVertical: 10, borderRadius: 8, alignSelf: 'center', paddingHorizontal: 20 },
  cardActionButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  bottomNav: { flexDirection: 'row', height: 70, backgroundColor: '#2c3e50', borderTopLeftRadius: 20, borderTopRightRadius: 20, justifyContent: 'space-around', alignItems: 'center', position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 15 },
  bottomNavItem: { alignItems: 'center' },
  bottomNavText: { color: '#bdc3c7', fontSize: 16, fontWeight: '500' },
  bottomNavTextActive: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  
  /* ΣΤΥΛ ΓΙΑ ΤΟ ΠΑΡΑΘΥΡΟ ΤΟΥ ΦΑΚΕΛΟΥ */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '60%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ecf0f1', paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50' },
  fileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#ecf0f1' },
  fileName: { flex: 1, fontSize: 16, color: '#2c3e50' },
  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#7f8c8d', fontStyle: 'italic' }
});