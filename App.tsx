import React from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';

interface Patient {
  id: string;
  name: string;
  amka: string;
  accessType: string;
}

const PATIENTS: Patient[] = [
  { id: '1', name: 'Γιώργος Αντωνίου', amka: '12345678901', accessType: 'Πλήρης Πρόσβαση' },
  { id: '2', name: 'Γιώργος Αντωνίου', amka: '12345678901', accessType: 'Μόνο Ανάγνωση' },
  { id: '3', name: 'Γιώργος Αντωνίου', amka: '12345678901', accessType: 'Πλήρης Πρόσβαση' },
  { id: '4', name: 'Γιώργος Αντωνίου', amka: '12345678901', accessType: 'Μόνο Ανάγνωση' },
];

export default function App() {
  
  const renderPatientCard = ({ item }: { item: Patient }) => (
    <View style={styles.card}>
      <View style={styles.cardDetails}>
        <Text style={styles.patientName}>{item.name}</Text>
        <Text style={styles.cardLabel}>AMKA:</Text>
        <Text style={styles.cardValue}>{item.amka}</Text>
        <Text style={styles.cardLabel}>Τύπος πρόσβασης:</Text>
        <Text style={styles.cardValue}>{item.accessType}</Text>
      </View>

      <TouchableOpacity style={styles.cardActionButton}>
        <Text style={styles.cardActionButtonText}>Προβολή Φακέλου</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Feather name="list" size={32} color="#2c3e50" />
        <Ionicons name="person-circle-outline" size={42} color="#2c3e50" />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#7f8c8d" style={styles.searchIcon} />
        <TextInput 
          style={styles.searchInput} 
          placeholder="Αναζήτηση..." 
          placeholderTextColor="#7f8c8d"
        />
      </View>

      <TouchableOpacity style={styles.headerActionButton}>
        <Feather name="plus" size={20} color="white" />
        <Text style={styles.headerActionButtonText}>Αίτημα Πρόσβασης</Text>
      </TouchableOpacity>

      <FlatList
        data={PATIENTS}
        keyExtractor={(item) => item.id}
        renderItem={renderPatientCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavItem}>
          <Text style={styles.bottomNavTextActive}>Αρχική</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavItem}>
          <Text style={styles.bottomNavText}>Προσβάσεις</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavItem}>
          <Text style={styles.bottomNavText}>Ρυθμίσεις</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ecf0f1',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 25,
    marginHorizontal: 20,
    paddingHorizontal: 15,
    marginBottom: 20,
    borderColor: '#7f8c8d',
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#2c3e50',
  },
  headerActionButton: {
    flexDirection: 'row',
    backgroundColor: '#3b5998', 
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    marginHorizontal: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  headerActionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 90, 
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardDetails: {
    marginBottom: 15,
  },
  patientName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '600',
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 16,
    color: '#34495e',
    marginBottom: 10,
  },
  cardActionButton: {
    backgroundColor: '#3b5998',
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  cardActionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: '#2c3e50',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 15,
  },
  bottomNavItem: {
    alignItems: 'center',
  },
  bottomNavText: {
    color: '#bdc3c7',
    fontSize: 16,
    fontWeight: '500',
  },
  bottomNavTextActive: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});