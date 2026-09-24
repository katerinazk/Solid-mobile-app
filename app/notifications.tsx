import React, { useEffect, useRef, useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../constants/colors';
import { sharedStyles } from '../constants/sharedStyles';
import { doctorStyles } from '../constants/doctorStyles';
import { SPACING } from '../constants/designSystem';
import { useAuth } from '../hooks/useAuth';
import { NotificationCard } from '../components/NotificationsList';
import { NotificationRecord, fetchNotifications, markNotificationsAsSeen } from '../services/notifications';

// Πόσες ειδοποιήσεις φορτώνονται κάθε φορά: οι πρώτες 10 και άλλες 10 κάθε φορά που ο χρήστης
// φτάνει στο τέλος της λίστας.
const PAGE_SIZE = 10;

// Όλες οι ειδοποιήσεις του χρήστη (τελευταίων 30 ημερών), κοινή οθόνη για ασθενή και γιατρό.
export default function NotificationsScreen() {
  const { role, loggedInPatientAmka, loggedInDoctorAmka } = useAuth();
  const amka = role === 'patient' ? loggedInPatientAmka : loggedInDoctorAmka;

  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Ref και όχι state: το onEndReached μπορεί να ξαναχτυπήσει πριν προλάβει να ενημερωθεί το state
  // και να ζητήσει την ίδια σελίδα δύο φορές.
  const busy = useRef(false);

  const loadPage = async (offset: number) => {
    if (!role || !amka || busy.current) return;
    busy.current = true;
    try {
      const { data, error } = await fetchNotifications(role, amka, offset, PAGE_SIZE);
      if (error) {
        console.error('Αποτυχία φόρτωσης ειδοποιήσεων:', error.message);
        return;
      }
      const page = (data || []) as NotificationRecord[];
      await markNotificationsAsSeen(page.filter((n) => !n.read).map((n) => n.id));
      // Αν έφτασε νέα ειδοποίηση στο μεταξύ, μια σελίδα μπορεί να επαναλάβει μία της προηγούμενης.
      setItems((prev) => {
        const known = new Set(prev.map((n) => n.id));
        return [...prev, ...page.filter((n) => !known.has(n.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      // Χωρίς σύνδεση μένουν όσες φαίνονται ήδη· το τράβηγμα στο τέλος ξαναδοκιμάζει.
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    (async () => {
      await loadPage(0);
      setLoading(false);
    })();
  }, [role, amka]);

  const handleEndReached = async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(items.length);
    setLoadingMore(false);
  };

  return (
    <SafeAreaView style={[sharedStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Ειδοποιήσεις</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationCard item={item} />}
          contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Text style={[sharedStyles.emptyText, { marginTop: 0, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} /> : null}
        />
      )}
    </SafeAreaView>
  );
}
