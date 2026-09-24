import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../constants/colors';
import { sharedStyles } from '../constants/sharedStyles';
import { ROUTES } from '../constants/routes';
import { SPACING, TYPOGRAPHY, TOUCH } from '../constants/designSystem';
import { usePodAutoRefresh } from '../hooks/usePodAutoRefresh';
import {
  NotificationRecord,
  NotificationRole,
  fetchNotifications,
  DEFAULT_PAGE_SIZE,
  markNotificationsAsSeen,
  isNewNotification,
} from '../services/notifications';

interface Props {
  role: NotificationRole;
  amka: string;
}

// Πόσες ειδοποιήσεις δείχνει η αρχική πριν το "Δείτε περισσότερα". Οι νέες (με κουκκίδα) δεν
// μετράνε στο όριο: εμφανίζονται πάντα όλες, ώστε να μη κρύβεται κάτι που δεν έχει δει ακόμα.
const HOME_LIMIT = 5;

// Πόσος καιρός πέρασε, στη μεγαλύτερη μονάδα που χωράει: λεπτά (<60), ώρες (<24), αλλιώς μέρες.
function timeAgo(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return 'μόλις τώρα';
  if (minutes < 60) return minutes === 1 ? 'πριν 1 λεπτό' : `πριν ${minutes} λεπτά`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'πριν 1 ώρα' : `πριν ${hours} ώρες`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'πριν 1 μέρα' : `πριν ${days} μέρες`;
}

// Η κάρτα μιας ειδοποίησης - κοινή για την αρχική και για την οθόνη με όλες τις ειδοποιήσεις.
// Πάνω σειρά: η κουκκίδα "νέο" αριστερά, ο χρόνος δεξιά. Το κείμενο από κάτω.
export function NotificationCard({ item }: { item: NotificationRecord }) {
  return (
    <View style={localStyles.card}>
      <View style={localStyles.topRow}>
        {isNewNotification(item.id) && <View style={localStyles.dot} />}
        <Text style={localStyles.time}>{timeAgo(item.created_at)}</Text>
      </View>
      <Text style={localStyles.message}>{item.message}</Text>
    </View>
  );
}

// Οι ειδοποιήσεις της αρχικής οθόνης, ίδιες για ασθενή και γιατρό. Η μπλε κουκκίδα δείχνει όσες
// είναι νέες από την προηγούμενη φορά που μπήκε ο χρήστης. Οι ειδοποιήσεις σβήνονται μόνες τους
// μετά από 30 μέρες. Ανανεώνονται όπως οι λίστες ιστορικού (εστίαση οθόνης + κάθε 15 δευτερόλεπτα).
export function NotificationsList({ role, amka }: Props) {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  // Αν η αρχική έφερε ολόκληρη τη σελίδα της, μπορεί να υπάρχουν κι άλλες στη βάση.
  const [maybeMore, setMaybeMore] = useState(false);

  const load = async () => {
    if (!amka) return;
    try {
      const { data, error } = await fetchNotifications(role, amka);
      if (error) console.error('Αποτυχία φόρτωσης ειδοποιήσεων:', error.message);
      else {
        const loaded = (data || []) as NotificationRecord[];
        // Πρώτα κρατάμε ποιες είναι νέες, μετά τις σημειώνουμε ως διαβασμένες στη βάση.
        await markNotificationsAsSeen(loaded.filter((n) => !n.read).map((n) => n.id));
        setItems(loaded);
        setMaybeMore(loaded.length >= DEFAULT_PAGE_SIZE);
      }
    } catch {
      // Χωρίς σύνδεση μένει η λίστα που ήδη φαίνεται - δεν αξίζει μήνυμα σφάλματος για κάτι δευτερεύον.
    }
  };

  useEffect(() => {
    load();
  }, [role, amka]);

  usePodAutoRefresh(load);

  if (items.length === 0) {
    return <Text style={[sharedStyles.emptyText, { marginTop: 0, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>;
  }

  const shown = items.filter((item, index) => index < HOME_LIMIT || isNewNotification(item.id));
  const hasMore = shown.length < items.length || maybeMore;

  return (
    <View>
      {shown.map((item) => (
        <NotificationCard key={item.id} item={item} />
      ))}
      {hasMore && (
        <TouchableOpacity style={localStyles.moreButton} onPress={() => router.push(ROUTES.NOTIFICATIONS)}>
          <Text style={localStyles.moreButtonText}>Δείτε περισσότερα</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  card: { backgroundColor: COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: SPACING.groupGap },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary, marginRight: 'auto' },
  time: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: 'bold', color: COLORS.primary },
  message: { fontSize: TYPOGRAPHY.bodyText, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  moreButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.groupGap },
  moreButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
