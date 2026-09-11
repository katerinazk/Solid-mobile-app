import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../constants/colors';
import { sharedStyles as styles } from '../constants/sharedStyles';
import { doctorStyles } from '../constants/doctorStyles';
import { TYPOGRAPHY, SPACING } from '../constants/designSystem';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../hooks/useAuth';
import { fetchFileContent, downloadAttachment } from '../services/solidPod';
import { openLocalFile } from '../utils/openLocalFile';
import { isCompleteRecord } from '../utils/podRecords';
import { fetchRelatedRecords, HistoryRecordSummary, CATEGORY_SINGULAR } from '../services/historyRecords';
import { CodedCardTitle } from '../components/CodedCardTitle';
import { formatDate } from '../utils/age';
import { formatDuration } from '../utils/duration';
import { useDoctorNames, formatDoctorName, formatDoctorLastNameOnly } from '../hooks/useDoctorNames';

// "Διαγνώσεις" -> "Σχετικές Διαγνώσεις", "Εμβολιασμοί" -> "Σχετικοί Εμβολιασμοί". Το γένος
// αλλάζει ανά κατηγορία, οπότε δεν γίνεται να κολλήσουμε μία λέξη μπροστά.
const RELATED_TITLES: Record<string, string> = {
  'Διαγνώσεις': 'Σχετικές Διαγνώσεις',
  'Νοσηλίες': 'Σχετικές Νοσηλίες',
  'Εξετάσεις': 'Σχετικές Εξετάσεις',
  'Αλλεργίες': 'Σχετικές Αλλεργίες',
  'Φάρμακα': 'Σχετικά Φάρμακα',
  'Εμβολιασμοί': 'Σχετικοί Εμβολιασμοί',
};

/**
 * Η αναλυτική προβολή μιας εγγραφής ιστορικού. Ανοίγει όταν πατηθεί μια κάρτα και δείχνει
 * το αρχείο αποτελέσματος, αν υπάρχει, και τις εγγραφές που σχετίζονται μαζί της
 * ομαδοποιημένες ανά κατηγορία. Κάθε σχετική κάρτα ανοίγει με τη σειρά της τη δική της
 * προβολή, οπότε ο γιατρός ακολουθεί την αλυσίδα "γιατί δόθηκε αυτό" όσο βαθιά θέλει.
 */
export default function RecordDetailScreen() {
  const params = useLocalSearchParams<{ url: string; category: string; webId: string }>();
  const { accessToken } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<any | null>(null);
  const [related, setRelated] = useState<HistoryRecordSummary[]>([]);
  const [openingResult, setOpeningResult] = useState(false);
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        const content = await fetchFileContent(params.url, accessToken);
        const parsed = JSON.parse(content);
        if (canceled) return;

        setRecord(isCompleteRecord(params.category, parsed) ? parsed : null);

        const found = await fetchRelatedRecords(params.webId, params.url, params.category, parsed, accessToken);
        if (canceled) return;

        setRelated(found);
        ensureDoctorInfo([parsed.doctorAmka, ...found.map((item) => item.doctorAmka)]);
      } catch {
        if (!canceled) setRecord(null);
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => { canceled = true; };
  }, [params.url, params.category, params.webId, accessToken]);

  const grouped = useMemo(() => {
    const order = Object.keys(RELATED_TITLES);
    return order
      .map((category) => ({ category, items: related.filter((r) => r.category === category) }))
      .filter((group) => group.items.length > 0);
  }, [related]);

  const handleOpenResult = async () => {
    if (!record?.resultFile) return;
    try {
      setOpeningResult(true);
      const localUri = await downloadAttachment(params.url, record.resultFile, accessToken);
      await openLocalFile(localUri, record.resultFile);
    } catch (error: any) {
      alert(error.message || 'Αποτυχία ανοίγματος αρχείου.');
    } finally {
      setOpeningResult(false);
    }
  };

  // Το αποθηκευμένο όνομα είναι στιγμιότυπο της ώρας της καταχώρησης. Αν ο γιατρός άλλαξε
  // στοιχεία στο προφίλ του, δείχνουμε τα τρέχοντα. Οι διαγνώσεις γράφουν μόνο επίθετο.
  const displayDoctorName = (category: string, doctorAmka?: string, fallback?: string) => {
    const info = getDoctorInfo(doctorAmka);
    if (!info) return fallback;
    return category === 'Διαγνώσεις' ? formatDoctorLastNameOnly(info) : formatDoctorName(info);
  };

  /**
   * Τα ίδια πεδία που δείχνει η κάρτα της κατηγορίας στη λίστα. Η αναλυτική προβολή δεν
   * πρέπει να κρύβει τίποτα από όσα έβλεπε ήδη ο χρήστης πριν την ανοίξει.
   */
  const detailFields = (): { label: string; value: string }[] => {
    const fields: { label: string; value: string }[] = [];
    const add = (label: string, value: any) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        fields.push({ label, value: String(value) });
      }
    };

    switch (params.category) {
      case 'Διαγνώσεις':
        add('Ημερομηνία', record.date && formatDate(record.date));
        break;
      case 'Αλλεργίες':
        add('Αντίδραση', record.reaction);
        break;
      case 'Νοσηλίες':
        add('Νοσοκομείο / Κλινική', record.hospitalClinic && `${record.hospitalClinic}${record.hospitalArea ? ` (${record.hospitalArea})` : ''}`);
        add('Ημερομηνία Εισαγωγής', record.admissionDate && formatDate(record.admissionDate));
        add('Ημερομηνία Εξιτηρίου', record.dischargeDate && formatDate(record.dischargeDate));
        break;
      case 'Φάρμακα':
        add('Τρόπος Χορήγησης', record.route);
        add('Δοσολογία', record.dosage);
        add('Ημ. Έναρξης', record.startDate ? formatDate(record.startDate) : 'εκκρεμεί έναρξη από τον ασθενή');
        add('Διάρκεια Χορήγησης', formatDuration(record.durationDays, record.durationMonths));
        break;
      case 'Εμβολιασμοί':
        add('Αριθμός Παρτίδας', record.batchNumber);
        add('Αριθμός Δόσης', record.doseNumber);
        add('Ημερομηνία Χορήγησης', record.administeredDate && formatDate(record.administeredDate));
        break;
      case 'Εξετάσεις':
        add('Τύπος', record.type);
        add('Ημ. Καταχώρησης', record.createdDate && formatDate(record.createdDate));
        add('Ημ. Αποτελέσματος', record.completedDate && formatDate(record.completedDate));
        break;
    }

    add('Καταχώρηση', displayDoctorName(params.category, record.doctorAmka, record.doctorName));
    return fields;
  };

  // Οι νοσηλίες κουβαλούν συνημμένα του γιατρού: εξιτήριο, γνωματεύσεις και τα σχετικά.
  const handleOpenAttachment = async (fileName: string) => {
    try {
      setOpeningAttachment(fileName);
      const localUri = await downloadAttachment(params.url, fileName, accessToken);
      await openLocalFile(localUri, fileName);
    } catch (error: any) {
      alert(error.message || 'Αποτυχία ανοίγματος αρχείου.');
    } finally {
      setOpeningAttachment(null);
    }
  };

  const openRelated = (item: HistoryRecordSummary) => {
    router.push({
      pathname: ROUTES.RECORD_DETAIL,
      params: { url: item.url, category: item.category, webId: params.webId },
    });
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>{CATEGORY_SINGULAR[params.category] || params.category}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : !record ? (
        <Text style={styles.emptyText}>Η καταχώρηση δεν βρέθηκε.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
          <View style={localStyles.identity}>
            <CodedCardTitle code={record.code} title={record.title} parentName={record.parentName} />

            {detailFields().map((field) => (
              <Text key={field.label} style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>{field.label}: </Text>{field.value}
              </Text>
            ))}
          </View>

          {/* Μόνο οι ολοκληρωμένες εξετάσεις έχουν αρχείο αποτελέσματος. Τα φάρμακα δεν έχουν
              ποτέ, οπότε το κουμπί απλώς δεν εμφανίζεται. */}
          {!!record.resultFile && (
            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, flexDirection: 'row' }]}
              onPress={handleOpenResult}
              disabled={openingResult}
            >
              {openingResult ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                  <Text style={styles.addButtonText}>Προβολή Αποτελεσμάτων</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {Array.isArray(record.attachments) && record.attachments.length > 0 && (
            <View style={{ marginTop: SPACING.sectionGap }}>
              <Text style={localStyles.sectionTitle}>Συνημμένα Αρχεία</Text>

              {record.attachments.map((fileName: string) => (
                <TouchableOpacity
                  key={fileName}
                  style={localStyles.attachmentRow}
                  onPress={() => handleOpenAttachment(fileName)}
                  disabled={openingAttachment === fileName}
                >
                  <Ionicons name="document-outline" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <Text style={{ flex: 1 }} numberOfLines={1}>{fileName}</Text>
                  {openingAttachment === fileName && <ActivityIndicator size="small" color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {grouped.length === 0 ? (
            <Text style={styles.emptyText}>Δεν υπάρχουν σχετικές καταχωρήσεις.</Text>
          ) : (
            grouped.map((group) => (
              <View key={group.category} style={{ marginTop: SPACING.sectionGap }}>
                <Text style={localStyles.sectionTitle}>{RELATED_TITLES[group.category]}</Text>

                {group.items.map((item) => (
                  <TouchableOpacity
                    key={item.url}
                    style={[doctorStyles.diagnosisCard, { marginHorizontal: 0 }]}
                    onPress={() => openRelated(item)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                      <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
                    </View>
                    {!!item.doctorName && (
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item.category, item.doctorAmka, item.doctorName)}
                      </Text>
                    )}
                    {!!item.date && (
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία: </Text>{formatDate(item.date)}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  identity: { marginBottom: SPACING.sectionGap },
  sectionTitle: {
    fontSize: TYPOGRAPHY.subtitle,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.groupGap,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.medium,
  },
});
