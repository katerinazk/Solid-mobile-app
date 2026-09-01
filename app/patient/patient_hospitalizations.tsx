import React, { useEffect, useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { doctorStyles } from '../../constants/doctorStyles';
import { SPACING } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId, downloadAttachment } from '../../services/solidPod';
import { formatDate } from '../../utils/age';
import { openLocalFile } from '../../utils/openLocalFile';
import { useDoctorNames, formatDoctorName } from '../../hooks/useDoctorNames';

const CATEGORY = 'Νοσηλίες';

interface Hospitalization {
  url: string;
  title: string;
  hospitalClinic: string;
  doctorName: string;
  doctorAmka: string;
  admissionDate: string;
  dischargeDate: string;
  attachments: string[];
}

export default function PatientHospitalizationsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [loading, setLoading] = useState(false);
  const [hospitalizations, setHospitalizations] = useState<Hospitalization[]>([]);
  const [viewingAttachmentsFor, setViewingAttachmentsFor] = useState<Hospitalization | null>(null);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  const loadHospitalizations = async () => {
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
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί νοσηλίες.
          files = [];
        }
      }

      const hospitalizationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(hospitalizationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            hospitalClinic: record.hospitalClinic,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            admissionDate: record.admissionDate,
            dischargeDate: record.dischargeDate,
            attachments: record.attachments || [],
          } as Hospitalization;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((h): h is Hospitalization => h !== null);
      setHospitalizations(valid);
      ensureDoctorInfo(valid.map((h) => h.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setHospitalizations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHospitalizations();
  }, []);

  const displayDoctorName = (item: Hospitalization) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const handleOpenAttachment = async (item: Hospitalization, fileName: string) => {
    try {
      setDownloadingAttachment(fileName);
      const localUri = await downloadAttachment(item.url, fileName, accessToken);
      await openLocalFile(localUri, fileName);
    } catch (error: any) {
      alert(error.message || 'Αποτυχία ανοίγματος αρχείου.');
    } finally {
      setDownloadingAttachment(null);
    }
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Νοσηλίες</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : hospitalizations.length === 0 ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν υπάρχουν νοσηλίες ακόμα.</Text>
      ) : (
        <FlatList
          data={hospitalizations}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingTop: SPACING.sectionGap, paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Νοσοκομείο / Κλινική: </Text>{item.hospitalClinic}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Εισαγωγής: </Text>{formatDate(item.admissionDate)}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Εξιτηρίου: </Text>{formatDate(item.dischargeDate)}
              </Text>

              <TouchableOpacity
                style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0, marginBottom: 0, marginTop: 12, backgroundColor: COLORS.light2 }]}
                onPress={() => setViewingAttachmentsFor(item)}
              >
                <Ionicons name="link-outline" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={[doctorStyles.diagnosisSortButtonText, { color: COLORS.primary }]}>Συνημμένα Αρχεία</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={!!viewingAttachmentsFor}
        onRequestClose={() => setViewingAttachmentsFor(null)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Συνημμένα Αρχεία</Text>
              <TouchableOpacity
                onPress={() => setViewingAttachmentsFor(null)}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {(!viewingAttachmentsFor?.attachments || viewingAttachmentsFor.attachments.length === 0) ? (
              <Text style={styles.emptyText}>Δεν υπάρχουν συνημμένα αρχεία.</Text>
            ) : (
              viewingAttachmentsFor.attachments.map((fileName) => (
                <TouchableOpacity
                  key={fileName}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.medium }}
                  onPress={() => handleOpenAttachment(viewingAttachmentsFor, fileName)}
                  disabled={downloadingAttachment === fileName}
                >
                  <Ionicons name="document-outline" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <Text style={{ flex: 1 }} numberOfLines={1}>{fileName}</Text>
                  {downloadingAttachment === fileName && <ActivityIndicator size="small" color={COLORS.primary} />}
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
