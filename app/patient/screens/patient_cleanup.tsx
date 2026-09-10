import React, { useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { TYPOGRAPHY, SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import {
  HISTORY_CATEGORIES,
  getCategoryFolderUrl,
  getOwnerWebId,
  getAttachmentsFolderUrl,
  listFolderFilesOrEmpty,
  fetchFileContent,
  deleteFile,
} from '../../../services/solidPod';

interface OldRecord {
  category: string;
  url: string;
  title: string;
}

// Εργαλείο εκκαθάρισης: βρίσκει τις εγγραφές που καταχωρήθηκαν πριν μπουν τα διεθνή πρότυπα,
// δηλαδή όσες δεν έχουν κωδικό ICD-10 / ATC / LOINC, και τις σβήνει. Το τρέχει ο ίδιος ο
// ασθενής, γιατί μόνο ο ιδιοκτήτης του Pod έχει δικαίωμα διαγραφής σε όλο τον φάκελο.
export default function PatientCleanupScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const webId = activePatientFolderUrl ? getOwnerWebId(activePatientFolderUrl) : '';

  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [oldRecords, setOldRecords] = useState<OldRecord[]>([]);
  // Εγγραφές που δεν διαβάστηκαν. ΔΕΝ τις σβήνουμε: μπορεί να φταίει στιγμιαίο πρόβλημα
  // δικτύου και όχι το περιεχόμενό τους.
  const [unreadable, setUnreadable] = useState(0);

  const scan = async () => {
    if (!webId || !accessToken) {
      Alert.alert('Σφάλμα', 'Δεν βρέθηκε ενεργή σύνδεση με το Pod.');
      return;
    }

    try {
      setScanning(true);
      const found: OldRecord[] = [];
      let failed = 0;

      for (const category of HISTORY_CATEGORIES) {
        const files = await listFolderFilesOrEmpty(getCategoryFolderUrl(webId, category), accessToken);

        for (const url of files.filter((f) => f.endsWith('.json'))) {
          try {
            const record = JSON.parse(await fetchFileContent(url, accessToken));
            if (!record.code) {
              found.push({ category, url, title: record.title || '(χωρίς ονομασία)' });
            }
          } catch {
            failed++;
          }
        }
      }

      setOldRecords(found);
      setUnreadable(failed);
      setHasScanned(true);
    } catch (error: any) {
      Alert.alert('Πρόβλημα', error.message || 'Αποτυχία ανάγνωσης του Pod.');
    } finally {
      setScanning(false);
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    let deleted = 0;
    const failures: string[] = [];

    for (const item of oldRecords) {
      try {
        // Τα συνημμένα πρώτα, αλλιώς μένουν ορφανά αρχεία στο Pod χωρίς εγγραφή που να
        // τα δείχνει.
        const attachmentsFolder = getAttachmentsFolderUrl(item.url);
        const attachments = await listFolderFilesOrEmpty(attachmentsFolder, accessToken);
        for (const file of attachments) {
          await deleteFile(file, accessToken);
        }
        if (attachments.length > 0) {
          // Ο άδειος πια φάκελος. Κάποιοι servers αρνούνται τη διαγραφή container - δεν
          // είναι λόγος να σταματήσει η εκκαθάριση.
          await deleteFile(attachmentsFolder, accessToken).catch(() => {});
        }

        await deleteFile(item.url, accessToken);
        deleted++;
      } catch {
        failures.push(item.title);
      }
    }

    setDeleting(false);
    setOldRecords([]);
    setHasScanned(false);

    Alert.alert(
      'Ολοκληρώθηκε',
      failures.length === 0
        ? `Διαγράφηκαν ${deleted} εγγραφές.`
        : `Διαγράφηκαν ${deleted} εγγραφές.\nΑπέτυχαν ${failures.length}: ${failures.join(', ')}`
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Οριστική διαγραφή',
      `Θα διαγραφούν ${oldRecords.length} εγγραφές μαζί με τα συνημμένα τους. Η ενέργεια δεν αναιρείται.`,
      [
        { text: 'Ακύρωση', style: 'cancel' },
        { text: 'Διαγραφή', style: 'destructive', onPress: deleteAll },
      ]
    );
  };

  const grouped = HISTORY_CATEGORIES
    .map((category) => ({ category, items: oldRecords.filter((r) => r.category === category) }))
    .filter((group) => group.items.length > 0);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εκκαθάριση</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
        <Text style={localStyles.intro}>
          Εντοπίζει τις παλιές καταχωρήσεις του ιστορικού σας, αυτές που έγιναν πριν η εφαρμογή
          αρχίσει να χρησιμοποιεί επίσημους ιατρικούς κωδικούς.
        </Text>

        <TouchableOpacity
          style={[styles.addButton, { borderRadius: 25 }]}
          onPress={scan}
          disabled={scanning || deleting}
        >
          {scanning ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Έλεγχος ιστορικού</Text>}
        </TouchableOpacity>

        {hasScanned && oldRecords.length === 0 && (
          <Text style={localStyles.result}>Δεν βρέθηκαν παλιές καταχωρήσεις. Το ιστορικό είναι καθαρό.</Text>
        )}

        {unreadable > 0 && (
          <Text style={localStyles.warning}>
            {unreadable} {unreadable === 1 ? 'εγγραφή δεν διαβάστηκε' : 'εγγραφές δεν διαβάστηκαν'} και δεν θα πειραχτούν.
          </Text>
        )}

        {grouped.map((group) => (
          <View key={group.category} style={{ marginTop: SPACING.sectionGap }}>
            <Text style={localStyles.categoryTitle}>{group.category} ({group.items.length})</Text>
            {group.items.map((item) => (
              <Text key={item.url} style={localStyles.item}>• {item.title}</Text>
            ))}
          </View>
        ))}

        {oldRecords.length > 0 && (
          <TouchableOpacity
            style={[styles.addButton, { borderRadius: 25, backgroundColor: COLORS.danger, marginTop: SPACING.sectionGap }]}
            onPress={confirmDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.addButtonText}>Διαγραφή {oldRecords.length} εγγραφών</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  intro: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginBottom: SPACING.sectionGap },
  result: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, textAlign: 'center', marginTop: SPACING.sectionGap },
  warning: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.danger, marginTop: SPACING.groupGap },
  categoryTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginBottom: SPACING.groupGap },
  item: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginBottom: 4 },
});
