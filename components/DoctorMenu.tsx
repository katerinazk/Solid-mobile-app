import React, { createContext, useContext, useRef, useState, ReactNode } from 'react';
import { Animated, Dimensions, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../constants/colors';
import { doctorStyles as styles } from '../constants/doctorStyles';
import { useAuth } from '../contexts/AuthContext';

interface DoctorMenuContextValue {
  openMenu: () => void;
}

const DoctorMenuContext = createContext<DoctorMenuContextValue | null>(null);

export function useDoctorMenu() {
  const ctx = useContext(DoctorMenuContext);
  if (!ctx) throw new Error('useDoctorMenu must be used within a DoctorMenuProvider');
  return ctx;
}

// Το πλαϊνό μενού γιατρού μπαίνει/βγαίνει με οριζόντιο slide (αριστερά -> δεξιά),
// γι' αυτό το κάνουμε εμείς οι ίδιοι με Animated αντί για το ενσωματωμένο animationType="slide"
// του Modal, που πάντα κινείται κάθετα (από κάτω).
export function DoctorMenuProvider({ children }: { children: ReactNode }) {
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

  return (
    <DoctorMenuContext.Provider value={{ openMenu }}>
      {children}

      <Modal animationType="none" transparent visible={isVisible} onRequestClose={closeMenu}>
        <View style={styles.menuOverlay}>
          <Animated.View style={[styles.menuPanel, { transform: [{ translateX: menuTranslateX }] }]}>
            <TouchableOpacity onPress={closeMenu}>
              <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.white} />
            </TouchableOpacity>

            <View style={styles.menuItems}>
              <TouchableOpacity onPress={() => { closeMenu(); router.replace('/doctor/screens/doctor_home'); }}>
                <Text style={styles.menuItemText}>Αρχική</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { closeMenu(); router.replace('/doctor/screens/doctor_access'); }}>
                <Text style={styles.menuItemText}>Προσβάσεις</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { closeMenu(); router.replace('/doctor/screens/doctor_settings'); }}>
                <Text style={styles.menuItemText}>Ρυθμίσεις</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity style={styles.menuLogoutButton} onPress={() => { closeMenu(); confirmLogout(); }}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
              <Text style={styles.menuLogoutText}>Αποσύνδεση</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu} />
        </View>
      </Modal>
    </DoctorMenuContext.Provider>
  );
}
