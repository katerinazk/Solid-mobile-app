import React, { createContext, useRef, useState, ReactNode } from 'react';
import { Animated, Dimensions, Modal, Platform, StatusBar, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { TYPOGRAPHY, SPACING } from '../../constants/designSystem';
import { ROUTES } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';

export interface PatientMenuContextValue {
  openMenu: () => void;
}

export const PatientMenuContext = createContext<PatientMenuContextValue | null>(null);

// Κατηγορίες ιστορικού που έχουν ήδη δική τους οθόνη προβολής για τον ασθενή - οι υπόλοιπες
// δείχνουν προσωρινά "Η λειτουργία έρχεται σύντομα." μέχρι να συνδεθούν κι αυτές.
// Οι 3 καρτέλες (Αρχική/Προσβάσεις/Ρυθμίσεις) αλλάζουν με replace (εναλλαγή καρτέλας, όχι
// νέα οθόνη στη στοίβα) - οι υπόλοιπες με push, ώστε το βελάκι "πίσω" να επιστρέφει εκεί
// από όπου άνοιξε το μενού, αντί να πηδάει πίσω από όλη την καρτέλα Αρχική.
const MENU_ITEMS: { label: string; route?: string; isTab?: boolean }[] = [
  { label: 'Αρχική', route: ROUTES.PATIENT_HOME, isTab: true },
  { label: 'Προσβάσεις', route: ROUTES.PATIENT_ACCESS, isTab: true },
  { label: 'Εξετάσεις', route: ROUTES.PATIENT_EXAMS },
  { label: 'Φάρμακα', route: ROUTES.PATIENT_MEDICATIONS },
  { label: 'Αλλεργίες', route: ROUTES.PATIENT_ALLERGIES },
  { label: 'Διαγνώσεις', route: ROUTES.PATIENT_DIAGNOSEIS },
  { label: 'Νοσηλίες', route: ROUTES.PATIENT_HOSPITALIZATIONS },
  { label: 'Εμβολιασμοί', route: ROUTES.PATIENT_VACCINATIONS },
  { label: 'Ρυθμίσεις', route: ROUTES.PATIENT_SETTINGS, isTab: true },
];

// Το πλαϊνό μενού ασθενή μπαίνει/βγαίνει με οριζόντιο slide, με το ίδιο animation/στυλ
// που χρησιμοποιεί ήδη το πλαϊνό μενού του γιατρού (DoctorMenu.tsx).
export function PatientMenuProvider({ children }: { children: ReactNode }) {
  const { confirmLogout } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const menuDrawerWidth = Dimensions.get('window').width * 0.75;
  const menuTranslateX = useRef(new Animated.Value(-menuDrawerWidth)).current;

  const openMenu = () => {
    setIsVisible(true);
    menuTranslateX.setValue(-menuDrawerWidth);
    Animated.timing(menuTranslateX, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };

  const closeMenu = () => {
    Animated.timing(menuTranslateX, { toValue: -menuDrawerWidth, duration: 220, useNativeDriver: true }).start(() => {
      setIsVisible(false);
    });
  };

  const handleSelect = (item: { label: string; route?: string; isTab?: boolean }) => {
    closeMenu();
    if (item.route) {
      if (item.isTab) {
        router.replace(item.route as any);
      } else {
        router.push(item.route as any);
      }
    } else {
      alert('Η λειτουργία έρχεται σύντομα.');
    }
  };

  return (
    <PatientMenuContext.Provider value={{ openMenu }}>
      {children}

      <Modal animationType="none" transparent visible={isVisible} onRequestClose={closeMenu}>
        <View style={localStyles.menuOverlay}>
          <Animated.View style={[localStyles.menuPanel, { transform: [{ translateX: menuTranslateX }] }]}>
            <TouchableOpacity onPress={closeMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.white} />
            </TouchableOpacity>

            <View style={localStyles.menuItems}>
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity key={item.label} onPress={() => handleSelect(item)}>
                  <Text style={localStyles.menuItemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity style={localStyles.menuLogoutButton} onPress={() => { closeMenu(); confirmLogout(); }}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
              <Text style={localStyles.menuLogoutText}>Αποσύνδεση</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={localStyles.menuBackdrop} activeOpacity={1} onPress={closeMenu} />
        </View>
      </Modal>
    </PatientMenuContext.Provider>
  );
}

const localStyles = StyleSheet.create({
  menuOverlay: { flex: 1, flexDirection: 'row' },
  menuPanel: {
    width: '75%',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sideMargin,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 60,
    paddingBottom: SPACING.sectionGap,
  },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  menuItems: { alignItems: 'center', marginTop: SPACING.sectionGap },
  menuItemText: { color: COLORS.white, fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', marginVertical: 18 },
  menuLogoutButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
  menuLogoutText: { color: COLORS.white, fontSize: TYPOGRAPHY.bodyText, fontWeight: '600', marginLeft: 8 },
});
