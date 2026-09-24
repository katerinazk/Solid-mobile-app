import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { sharedStyles } from '../constants/sharedStyles';
import { SPACING, TYPOGRAPHY } from '../constants/designSystem';
import { usePodAutoRefresh } from '../hooks/usePodAutoRefresh';
import {
  NotificationRecord,
  NotificationRole,
  fetchNotifications,
  markNotificationsAsSeen,
  isNewNotification,
} from '../services/notifications';

interface Props {
  role: NotificationRole;
  amka: string;
}

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

// Οι ειδοποιήσεις της αρχικής οθόνης, ίδιες για ασθενή και γιατρό. Η μπλε κουκκίδα δείχνει όσες είναι
// νέες από την προηγούμενη φορά που μπήκε ο χρήστης. Οι ειδοποιήσεις σβήνονται μόνες τους μετά από 30 μέρες. Ανανεώνονται όπως οι λίστες ιστορικού (εστίαση οθόνης + κάθε 15 δευτερόλεπτα).
export function NotificationsList({ role, amka }: Props) {
  const [items, setItems] = useState<NotificationRecord[]>([]);

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

  return (
    <View>
      {items.map((item) => (
        <View key={item.id} style={localStyles.card}>
          <View style={localStyles.topRow}>
            {isNewNotification(item.id) && <View style={localStyles.dot} />}
            <Text style={localStyles.time}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={localStyles.message}>{item.message}</Text>
        </View>
      ))}
    </View>
  );
}

const localStyles = StyleSheet.create({
  card: { backgroundColor: COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: SPACING.groupGap },
  // Πάνω σειρά: η κουκκίδα "νέο" αριστερά, ο χρόνος δεξιά. Το κείμενο από κάτω.
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary, marginRight: 'auto' },
  time: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: 'bold', color: COLORS.primary },
  message: { fontSize: TYPOGRAPHY.bodyText, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
});
