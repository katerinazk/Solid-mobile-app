import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../constants/colors';
import { sharedStyles as styles } from '../constants/sharedStyles';
import { doctorStyles } from '../constants/doctorStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../hooks/useAuth';
import * as DocumentPicker from 'expo-document-picker';
import { fetchFileContent, downloadAttachment, uploadAttachment } from '../services/solidPod';
import { saveRecordCompletion } from '../services/recordRevisions';
import { openLocalFile } from '../utils/openLocalFile';
import { isCompleteRecord, createdDateFromUrl } from '../utils/podRecords';
import { parseRetraction, parseRevisions } from '../utils/recordRevision';
import { RetractedNote } from '../components/RetractedNote';
import { fetchRelatedRecords, HistoryRecordSummary, CATEGORY_SINGULAR } from '../services/historyRecords';
import { CodedCardTitle } from '../components/CodedCardTitle';
import { formatDate } from '../utils/age';
import { formatDuration } from '../utils/duration';
import { useDoctorNames, formatDoctorName, formatDoctorLastNameOnly } from '../hooks/useDoctorNames';
import { showMessage } from '../utils/appMessage';

// "Διαγνώσεις" -> "Σχετικές Διαγνώσεις", "Εμβολιασμοί" -> "Σχετικοί Εμβολιασμοί". Το γένος
// αλλάζει ανά κατηγορία, οπότε δεν γίνεται να κολλήσουμε μία λέξη μπροστά.
const RELATED_TITLES: Record<string, string> = {
  'Διαγνώσεις': 'Σχετικές Διαγνώσεις',
  'Νοσηλείες': 'Σχετικές Νοσηλείες',
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
  const { accessToken, role } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<any | null>(null);
  const [related, setRelated] = useState<HistoryRecordSummary[]>([]);
  const [openingResult, setOpeningResult] = useState(false);
  const [replacingResult, setReplacingResult] = useState(false);
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

  const revisions = useMemo(() => parseRevisions(record), [record]);

  const handleOpenResult = async () => {
    if (!record?.resultFile) return;
    try {
      setOpeningResult(true);
      const localUri = await downloadAttachment(params.url, record.resultFile, accessToken);
      await openLocalFile(localUri, record.resultFile);
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανοίγματος αρχείου.');
    } finally {
      setOpeningResult(false);
    }
  };

  /**
   * Αντικατάσταση του αρχείου αποτελέσματος σε ολοκληρωμένη εξέταση.
   *
   * Ανεβάζει το νέο αρχείο και δείχνει η εγγραφή σε αυτό. Το προηγούμενο ΔΕΝ σβήνεται - η
   * εφαρμογή δεν διαγράφει τίποτα από το Pod - απλώς δεν αναφέρεται πια από την εξέταση.
   *
   * Η ημερομηνία αποτελέσματος μένει η αρχική: η αλλαγή αρχείου είναι συνήθως διόρθωση
   * λάθους ανεβάσματος, όχι νέο αποτέλεσμα σε άλλη ημερομηνία.
   */
  const handleReplaceResult = async () => {
    if (!record) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) return;

      const asset = picked.assets[0];
      setReplacingResult(true);

      const storedName = await uploadAttachment(
        params.url, asset.name, asset.uri, asset.mimeType || 'application/octet-stream', accessToken
      );
      const next = { ...record, resultFile: storedName };
      await saveRecordCompletion(params.url, accessToken, next);
      setRecord(next);
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία μεταφόρτωσης αρχείου.');
    } finally {
      setReplacingResult(false);
    }
  };

  // Μόνο ο ασθενής ανεβάζει αποτέλεσμα - ο γιατρός παραγγέλνει την εξέταση, δεν την εκτελεί.
  // Σε ανακληθείσα εξέταση δεν αλλάζει τίποτα: έχει αποσυρθεί.
  const canReplaceResult =
    role === 'patient' && params.category === 'Εξετάσεις' && !!record?.resultFile && !record?.retracted;

  // Το αποθηκευμένο όνομα είναι στιγμιότυπο της ώρας της καταχώρησης. Αν ο γιατρός άλλαξε
  // στοιχεία στο προφίλ του, δείχνουμε τα τρέχοντα. Οι διαγνώσεις γράφουν μόνο επίθετο.
  const displayDoctorName = (category: string, doctorAmka?: string, fallback?: string) => {
    const info = getDoctorInfo(doctorAmka);
    if (!info) return fallback;
    return category === 'Διαγνώσεις' ? formatDoctorLastNameOnly(info) : formatDoctorName(info);
  };

  /**
   * Τα ίδια πεδία που δείχνει η κάρτα της κατηγορίας στη λίστα, από ΟΠΟΙΑΔΗΠΟΤΕ μορφή της
   * εγγραφής - την τρέχουσα ή μια παλιότερη, φυλαγμένη μέσα σε μια τροποποίηση. Έτσι το ίδιο
   * σύνολο πεδίων χρησιμοποιείται και για την αναλυτική προβολή και για να βρεθεί τι άλλαξε σε
   * κάθε τροποποίηση του Ιστορικού Αλλαγών.
   */
  const fieldsFor = (rec: any): { label: string; value: string }[] => {
    const fields: { label: string; value: string }[] = [];
    const add = (label: string, value: any) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        fields.push({ label, value: String(value) });
      }
    };

    switch (params.category) {
      case 'Διαγνώσεις':
        add('Ημερομηνία', rec.date && formatDate(rec.date));
        break;
      case 'Αλλεργίες':
        add('Αντίδραση', rec.reaction);
        add('Ημ. Καταχώρησης', formatDate(rec.createdDate || createdDateFromUrl(params.url)));
        break;
      case 'Νοσηλείες':
        add('Νοσοκομείο / Κλινική', rec.hospitalClinic && `${rec.hospitalClinic}${rec.hospitalArea ? ` (${rec.hospitalArea})` : ''}`);
        add('Ημερομηνία Εισαγωγής', rec.admissionDate && formatDate(rec.admissionDate));
        add('Ημερομηνία Εξιτηρίου', rec.dischargeDate && formatDate(rec.dischargeDate));
        break;
      case 'Φάρμακα':
        add('Τρόπος Χορήγησης', rec.route);
        add('Δοσολογία', rec.dosage);
        add('Ημ. Έναρξης', rec.startDate ? formatDate(rec.startDate) : 'εκκρεμεί έναρξη από τον ασθενή');
        add('Διάρκεια Χορήγησης', formatDuration(rec.durationDays, rec.durationMonths));
        break;
      case 'Εμβολιασμοί':
        add('Αριθμός Παρτίδας', rec.batchNumber);
        add('Αριθμός Δόσης', rec.doseNumber);
        add('Ημερομηνία Χορήγησης', rec.administeredDate && formatDate(rec.administeredDate));
        break;
      case 'Εξετάσεις':
        add('Τύπος', rec.type);
        add('Ημ. Καταχώρησης', formatDate(rec.createdDate || createdDateFromUrl(params.url)));
        add('Ημ. Αποτελέσματος', rec.completedDate && formatDate(rec.completedDate));
        break;
    }

    add('Καταχώρηση', displayDoctorName(params.category, rec.doctorAmka, rec.doctorName));
    return fields;
  };

  const detailFields = () => fieldsFor(record);

  /**
   * Ποια πεδία άλλαξαν σε μια συγκεκριμένη τροποποίηση, συγκρίνοντας τη μορφή πριν με τη
   * μορφή μετά. Χωρίς αυτό, το "Ιστορικό Αλλαγών" έδειχνε μόνο τον τίτλο - κι αν η
   * τροποποίηση άλλαξε κάτι άλλο (π.χ. τον τύπο μιας εξέτασης), ο τίτλος έμενε ίδιος και η
   * καταχώρηση έδειχνε σαν να μην άλλαξε τίποτα.
   */
  const changedFields = (before: any, after: any): { label: string; from: string; to: string }[] => {
    const changes: { label: string; from: string; to: string }[] = [];

    const beforeTitle = before.title || 'άγνωστο';
    const afterTitle = after.title || 'άγνωστο';
    if (beforeTitle !== afterTitle || (before.code || '') !== (after.code || '')) {
      changes.push({ label: 'Κωδικός/Τίτλος', from: beforeTitle, to: afterTitle });
    }

    const beforeMap = new Map(fieldsFor(before).map((f) => [f.label, f.value]));
    const afterMap = new Map(fieldsFor(after).map((f) => [f.label, f.value]));
    for (const label of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
      const from = beforeMap.get(label) ?? '—';
      const to = afterMap.get(label) ?? '—';
      if (from !== to) changes.push({ label, from, to });
    }

    return changes;
  };

  // Οι νοσηλείες κουβαλούν συνημμένα του γιατρού: εξιτήριο, γνωματεύσεις και τα σχετικά.
  const handleOpenAttachment = async (fileName: string) => {
    try {
      setOpeningAttachment(fileName);
      const localUri = await downloadAttachment(params.url, fileName, accessToken);
      await openLocalFile(localUri, fileName);
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανοίγματος αρχείου.');
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

            <RetractedNote retraction={parseRetraction(record)} />
          </View>

          {/* Το ιστορικό αλλαγών: κάθε φορά που κάποιος άλλαξε την εγγραφή, με τη μορφή που
              είχε πριν. Χωρίς αυτό η επεξεργασία θα έσβηνε αθόρυβα ό,τι έγραψε ο προηγούμενος. */}
          {revisions.length > 0 && (
            <View style={{ marginTop: SPACING.sectionGap }}>
              <Text style={localStyles.sectionTitle}>Ιστορικό Αλλαγών</Text>

              {/* Κάθε τροποποίηση σε δική της κάρτα, με σήμανση χρόνου σαν χρονολόγιο: έτσι
                  ξεχωρίζει οπτικά από τις γύρω ενότητες αντί να μοιάζει με σκέτο κείμενο.
                  Δείχνει τα πεδία που πράγματι άλλαξαν σε αυτή την τροποποίηση - η μορφή "μετά"
                  είναι η επόμενη τροποποίηση αν υπάρχει, αλλιώς η σημερινή εγγραφή. */}
              {revisions.map((revision, index) => {
                const after = index + 1 < revisions.length ? revisions[index + 1].record : record;
                const changes = changedFields(revision.record || {}, after || {});

                return (
                  <View key={`${revision.at}-${index}`} style={[localStyles.revisionCard, index > 0 && { marginTop: 10 }]}>
                    <View style={localStyles.revisionIconBadge}>
                      <Ionicons name="create-outline" size={16} color={COLORS.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={localStyles.revisionDate}>
                        {formatDate(revision.at)}{revision.byName ? `  ·  ${revision.byName}` : ''}
                      </Text>
                      {changes.length === 0 ? (
                        <Text style={doctorStyles.diagnosisCardDetail}>Καμία ορατή αλλαγή πεδίου.</Text>
                      ) : (
                        changes.map((change) => (
                          <Text key={change.label} style={doctorStyles.diagnosisCardDetail}>
                            <Text style={doctorStyles.diagnosisCardLabel}>{change.label}: </Text>
                            {change.from} → {change.to}
                          </Text>
                        ))
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Μόνο οι ολοκληρωμένες εξετάσεις έχουν αρχείο αποτελέσματος. Τα φάρμακα δεν έχουν
              ποτέ, οπότε το κουμπί απλώς δεν εμφανίζεται. */}
          {!!record.resultFile && (
            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, flexDirection: 'row', marginTop: SPACING.sectionGap }]}
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

          {canReplaceResult && (
            <TouchableOpacity
              style={localStyles.replaceResultButton}
              onPress={handleReplaceResult}
              disabled={replacingResult}
            >
              {replacingResult ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text style={localStyles.replaceResultButtonText}>Αλλαγή Αρχείου</Text>
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

          {/* Όταν δεν υπάρχουν σχετικές καταχωρήσεις δεν γράφουμε τίποτα: η απουσία τους δεν
              είναι πληροφορία, και μια γραμμή κάτω από κάθε εγγραφή που λέει ότι δεν υπάρχει
              κάτι άλλο απλώς γεμίζει την οθόνη. */}
          {grouped.map((group) => (
            <View key={group.category} style={{ marginTop: SPACING.sectionGap }}>
              <Text style={localStyles.sectionTitle}>{RELATED_TITLES[group.category]}</Text>

              {/* marginBottom: 0 αντί για το προκαθορισμένο του diagnosisCard: το κενό ανάμεσα
                  σε κάρτες μπαίνει ως marginTop στις επόμενες (index > 0), όχι ως marginBottom
                  στις προηγούμενες - αλλιώς θα διέρρεε και μετά την τελευταία κάρτα κάθε
                  ενότητας, κάνοντας το κενό πριν την επόμενη ενότητα (π.χ. "Σχετικά Φάρμακα")
                  μεγαλύτερο από το κενό πριν από ΑΥΤΗ. */}
              {group.items.map((item, index) => (
                <TouchableOpacity
                  key={item.url}
                  style={[doctorStyles.diagnosisCard, { marginHorizontal: 0, marginBottom: 0 }, index > 0 && { marginTop: 12 }]}
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
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Δευτερεύουσα ενέργεια, περιγραμμένη αντί για γεμάτη: η κύρια εδώ είναι να δει ο χρήστης
  // το αποτέλεσμα, όχι να το αντικαταστήσει.
  replaceResultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    marginTop: SPACING.groupGap,
  },
  replaceResultButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  // Οι πληροφορίες της εγγραφής μέσα σε πλαίσιο, όπως ακριβώς και η κάρτα από την οποία
  // ήρθε ο χρήστης. Το marginHorizontal είναι μηδέν γιατί το περιθώριο το δίνει η οθόνη.
  identity: {
    backgroundColor: COLORS.lightest,
    borderRadius: 15,
    padding: 16,
    marginTop: SPACING.sectionGap,
  },
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
  // Κάρτα τροποποίησης: ίδια λογική με τις κάρτες εγγραφών (φόντο, στρογγυλεμένες γωνίες) αντί
  // για γραμμή με απλό διαχωριστικό, ώστε κάθε αλλαγή να διαβάζεται ως ξεχωριστό συμβάν. Το
  // κενό ανάμεσα σε διαδοχικές κάρτες μπαίνει ως marginTop στο σημείο χρήσης (index > 0) και
  // όχι εδώ ως marginBottom - αλλιώς θα "διέρρεε" και μετά την τελευταία κάρτα, κάνοντας το
  // κενό πριν την επόμενη ενότητα μεγαλύτερο από το αντίστοιχο κενό πριν από ΑΥΤΗ την ενότητα.
  revisionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.lightest,
    borderRadius: 15,
    padding: 14,
  },
  revisionIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  revisionDate: {
    fontSize: TYPOGRAPHY.secondaryText,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
});
