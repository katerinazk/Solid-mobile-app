import React, { useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';

const CATEGORIES = ['Όλες', 'Εκκρεμείς', 'Εργαστηριακές', 'Απεικονιστικές', 'Λειτουργικές', 'Ενδοσκοπικές', 'Ιστολογικές'];
const EXAM_TYPES = ['Εργαστηριακές', 'Απεικονιστικές', 'Λειτουργικές', 'Ενδοσκοπικές', 'Ιστολογικές'];

interface PendingExam {
  id: string;
  title: string;
  doctorName: string;
}

interface CompletedExam {
  id: string;
  title: string;
  date: string;
}

const PENDING_EXAMS: PendingExam[] = [
  { id: '1', title: 'Γενική Αίματος & Βιοχημικός Έλεγχος', doctorName: 'Δρ. Λάμπρου' },
];

const COMPLETED_EXAMS: CompletedExam[] = [
  { id: '2', title: 'Γενική Αίματος & Βιοχημικός Έλεγχος', date: '14/03/2026' },
  { id: '3', title: 'Γενική Αίματος & Βιοχημικός Έλεγχος', date: '14/03/2026' },
];

function PendingExamCard({ item }: { item: PendingExam }) {
  return (
    <View style={doctorStyles.diagnosisCard}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
      </Text>
      <Text style={[doctorStyles.diagnosisCardDetail, { color: COLORS.danger, fontWeight: 'bold', marginTop: 10 }]}>ΕΚΚΡΕΜΕΣ</Text>
    </View>
  );
}

function CompletedExamCard({ item }: { item: CompletedExam }) {
  return (
    <View style={[doctorStyles.diagnosisCard, { flexDirection: 'row', alignItems: 'center' }]}>
      <Ionicons name="link-outline" size={22} color={COLORS.primary} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[doctorStyles.diagnosisCardTitle, { marginRight: 0 }]}>{item.title}</Text>
        <Text style={[doctorStyles.diagnosisCardDetail, { color: COLORS.text, marginTop: 2 }]}>{item.date}</Text>
      </View>
    </View>
  );
}

export default function DoctorExamsScreen() {
  const { amka } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const [selectedCategory, setSelectedCategory] = useState('Όλες');

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [isTypeListVisible, setIsTypeListVisible] = useState(false);

  const openAddModal = () => {
    setFormName('');
    setFormType('');
    setIsTypeListVisible(false);
    setIsAddModalVisible(true);
  };

  const closeModal = () => {
    setIsAddModalVisible(false);
    setIsTypeListVisible(false);
  };

  const handleSelectType = (type: string) => {
    setFormType(type);
    setIsTypeListVisible(false);
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εξετάσεις</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.groupGap }}>
        <Text style={doctorStyles.dashboardLabel}>Αναζήτηση εξέτασης:</Text>
        <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
          <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <TextInput style={doctorStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.groupGap }}
        style={{ flexGrow: 0, marginBottom: SPACING.groupGap }}
      >
        {CATEGORIES.map((category) => {
          const isSelected = category === selectedCategory;
          return (
            <TouchableOpacity
              key={category}
              style={[localStyles.categoryPill, isSelected ? localStyles.categoryPillSelected : localStyles.categoryPillUnselected]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={isSelected ? localStyles.categoryPillTextSelected : localStyles.categoryPillTextUnselected}>{category}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ Προσθήκη Εξέτασης</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
        <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Εκκρεμείς</Text>

        {PENDING_EXAMS.map((item) => (
          <PendingExamCard key={item.id} item={item} />
        ))}

        <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap }]}>Ολοκληρωμένες</Text>

        {COMPLETED_EXAMS.map((item) => (
          <CompletedExamCard key={item.id} item={item} />
        ))}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Νέα Εξέταση</Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formName} onChangeText={setFormName} />

            <Text style={loginStyles.inputLabel}>Τύπος</Text>
            <TouchableOpacity
              style={[loginStyles.loginInput, localStyles.input, { justifyContent: 'center', marginBottom: isTypeListVisible ? 0 : 30 }]}
              onPress={() => setIsTypeListVisible((prev) => !prev)}
            >
              <Text style={{ color: formType ? COLORS.text : COLORS.medium, fontSize: TYPOGRAPHY.bodyText }}>
                {formType || 'Επιλέξτε τύπο'}
              </Text>
            </TouchableOpacity>

            {isTypeListVisible && (
              <View style={localStyles.typeList}>
                {EXAM_TYPES.map((type, index) => (
                  <TouchableOpacity
                    key={type}
                    style={[localStyles.typeOption, index === EXAM_TYPES.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => handleSelectType(type)}
                  >
                    <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}>
              <Text style={styles.addButtonText}>Εντάξει</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
  },
  typeList: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    marginBottom: 30,
    overflow: 'hidden',
  },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightest,
  },
  categoryPill: {
    paddingHorizontal: 18,
    height: TOUCH.buttonHeight,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.groupGap,
  },
  categoryPillSelected: {
    backgroundColor: COLORS.lightest,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  categoryPillUnselected: {
    backgroundColor: COLORS.primary,
  },
  categoryPillTextSelected: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: TYPOGRAPHY.bodyText,
  },
  categoryPillTextUnselected: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: TYPOGRAPHY.bodyText,
  },
});
