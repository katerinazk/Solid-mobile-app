import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, deleteFile, saveFileContent } from '../../../services/solidPod';

export default function DoctorFolderScreen() {
  const { amka, firstName, lastName, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken } = useAuth();
  const patientName = `${firstName} ${lastName}`;
  const folderUrl = (webId || '').replace('profile/card#me', 'public/');

  const [loading, setLoading] = useState(false);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newDiagnosis, setNewDiagnosis] = useState('');

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editFileUrl, setEditFileUrl] = useState('');

  const loadFolder = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      const files = await listFolderFiles(webId, accessToken);
      setFolderFiles(files);
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolder();
  }, []);

  const openFile = async (url: string) => {
    try {
      setLoading(true);
      const content = await fetchFileContent(url, accessToken);
      alert("Περιεχόμενο Διάγνωσης:\n\n" + content);
    } catch (error) {
      alert("Σφάλμα κατά το άνοιγμα.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (url: string) => {
    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη διάγνωση;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteFile(url, accessToken);
              setFolderFiles((prev) => prev.filter((f) => f !== url));
              alert("Η διάγνωση διαγράφηκε επιτυχώς!");
            } catch (error: any) {
              alert(error.message || "Αποτυχία σύνδεσης.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleEditFile = async (url: string) => {
    try {
      setLoading(true);
      const content = await fetchFileContent(url, accessToken);
      setEditContent(content);
      setEditFileUrl(url);
      setIsEditModalVisible(true);
    } catch (error) {
      alert("Αποτυχία φόρτωσης αρχείου.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setLoading(true);
      await saveFileContent(editFileUrl, accessToken, editContent);
      alert("Η διάγνωση ενημερώθηκε επιτυχώς!");
      setIsEditModalVisible(false);
    } catch (error: any) {
      alert(error.message || "Σφάλμα σύνδεσης.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDiagnosis = async () => {
    if (newDiagnosis.trim() === '') {
      alert("Παρακαλώ γράψτε μια διάγνωση!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    const fileName = `diagnosis_${Date.now()}.txt`;
    const fileUrl = `${folderUrl}${fileName}`;

    try {
      setLoading(true);
      await saveFileContent(fileUrl, accessToken, newDiagnosis);
      alert("Η διάγνωση αποθηκεύτηκε επιτυχώς!");
      setFolderFiles((prevFiles) => [...prevFiles, fileUrl]);
      setIsAddModalVisible(false);
      setNewDiagnosis('');
    } catch (error: any) {
      console.error("Network Error:", error);
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Φάκελος: {patientName}</Text>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close-circle" size={30} color={COLORS.primary} /></TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setIsAddModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+ Προσθήκη Ιστορικού</Text>
        </TouchableOpacity>

        {loading && folderFiles.length === 0 ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
        ) : folderFiles.length === 0 ? (
          <Text style={styles.emptyText}>Άδειος φάκελος.</Text>
        ) : (
          <FlatList
            data={folderFiles}
            keyExtractor={(item, idx) => idx.toString()}
            renderItem={({ item }) => {
              const fileName = item.split('/').pop() || 'Αρχείο';
              return (
                <View style={styles.fileItem}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => openFile(item)}
                  >
                    <Ionicons name="document-text" size={24} color={COLORS.primary} style={{ marginRight: 15 }} />
                    <Text style={styles.fileName}>{decodeURIComponent(fileName)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => handleEditFile(item)} style={{ marginRight: 15 }}>
                    <Ionicons name="pencil-outline" size={24} color={COLORS.text} />
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => handleDeleteFile(item)}>
                    <Ionicons name="trash-outline" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Νέα Διάγνωση</Text>

            <TextInput
              style={styles.textArea}
              multiline={true}
              numberOfLines={4}
              placeholder="Γράψτε τη διάγνωση εδώ..."
              value={newDiagnosis}
              onChangeText={setNewDiagnosis}
            />

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsAddModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveDiagnosis}
              >
                <Text style={styles.saveButtonText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Επεξεργασία Διάγνωσης</Text>

            <TextInput
              style={styles.textArea}
              multiline={true}
              numberOfLines={4}
              value={editContent}
              onChangeText={setEditContent}
            />

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.saveButtonText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
