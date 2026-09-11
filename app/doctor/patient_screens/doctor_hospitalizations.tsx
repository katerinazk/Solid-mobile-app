import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Alert, Modal, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord } from '../../../utils/podRecords';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { listFolderFilesOrEmpty, fetchFileContent, deleteFile, getCategoryFolderUrl, downloadAttachment, isPodAccessDenied } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { openLocalFile } from '../../../utils/openLocalFile';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';

const CATEGORY = 'Νοσηλίες';

interface Hospitalization {
  url: string;
  title: string;
  hospitalClinic: string;
  doctorName: string;
  doctorAmka: string;
  hospitalArea?: string;
  admissionDate: string;
  dischargeDate: string;
  attachments: string[];
  // Κωδικός ICD-10 του λόγου νοσηλείας. Λείπει από τις παλιές εγγραφές.
  code?: string;
  parentName?: string;
  // Οι εγγραφές με τις οποίες ο γιατρός συνέδεσε τη νοσηλία.
  links?: LinkedRecord[];
}

export default function DoctorHospitalizationsScreen() {
  const { amka, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  const [loading, setLoading] = useState(false);
  const [hospitalizations, setHospitalizations] = useState<Hospitalization[]>([]);

  const [viewingAttachmentsFor, setViewingAttachmentsFor] = useState<Hospitalization | null>(null);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  const loadHospitalizations = async (silent = false) => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      if (!silent) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

      const hospitalizationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(hospitalizationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
          if (!isCompleteRecord('Νοσηλίες', record)) return null;
          return {
            url,
            title: record.title,
            code: record.code,
            parentName: record.parentName,
            hospitalClinic: record.hospitalClinic,
            hospitalArea: record.hospitalArea,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            admissionDate: record.admissionDate,
            dischargeDate: record.dischargeDate,
            attachments: record.attachments || [],
            links: readLinks(record),
          } as Hospitalization;
        } catch (error: any) {
          console.warn('⚠️ Αποτυχία φόρτωσης νοσηλίας', url, error?.message || error);
          return null;
        }
      }));

      const valid = loaded.filter((h): h is Hospitalization => h !== null);
      setHospitalizations(valid);
      ensureDoctorInfo(valid.map((h) => h.doctorAmka));
    } catch (error: any) {
      // 403 από το Pod = ο ασθενής κατάργησε την πρόσβαση όσο ο γιατρός ήταν μέσα. Το αναλαμβάνει
      // ο φύλακας, που βγάζει το σωστό μήνυμα και τον επιστρέφει στην αρχική του.
      if (isPodAccessDenied(error)) {
        checkAccess();
        return;
      }
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadHospitalizations();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadHospitalizations);

  const displayDoctorName = (item: Hospitalization) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const openForm = (item?: Hospitalization) => {
    router.push({
      pathname: ROUTES.DOCTOR_HOSPITALIZATION_FORM,
      params: {
        amka,
        webId,
        accessType,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editHospitalClinic: item.hospitalClinic,
          editHospitalArea: item.hospitalArea,
          editAdmissionDate: item.admissionDate,
          editDischargeDate: item.dischargeDate,
          editAttachments: JSON.stringify(item.attachments || []),
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
          editLinks: item.links?.length ? JSON.stringify(item.links) : '',
        } : {}),
      },
    });
  };

  const openDetail = (item: Hospitalization) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId } });
  };

  const handleDeleteHospitalization = async (item: Hospitalization) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη νοσηλία;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setHospitalizations((prev) => prev.filter((h) => h.url !== item.url));
            } catch (error: any) {
              alert(error.message || "Αποτυχία διαγραφής.");
            }
          }
        }
      ]
    );
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

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {!isReadOnly && (
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
          <Text style={styles.addButtonText}>+ Προσθήκη Νοσηλίας</Text>
        </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : hospitalizations.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν νοσηλίες.</Text>
      ) : (
        <FlatList
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          data={hospitalizations}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <TouchableOpacity style={doctorStyles.diagnosisCard} onPress={() => openDetail(item)}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                {!isReadOnly && (item.doctorAmka === loggedInDoctorAmka) && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => openForm(item)} style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteHospitalization(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Νοσοκομείο / Κλινική: </Text>{item.hospitalClinic}{item.hospitalArea ? ` (${item.hospitalArea})` : ''}
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
                style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0, marginBottom: 0, marginTop: 12 }]}
                onPress={() => setViewingAttachmentsFor(item)}
              >
                <Ionicons name="link-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
                <Text style={doctorStyles.diagnosisSortButtonText}>Συνημμένα Αρχεία</Text>
              </TouchableOpacity>
            </TouchableOpacity>
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
