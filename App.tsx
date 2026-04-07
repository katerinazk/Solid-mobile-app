import 'react-native-get-random-values';
import 'text-encoding';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Linking, Modal, Platform } from 'react-native';
import { Ionicons, Feather, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from './supabase';
import { getSolidDataset, getContainedResourceUrlAll } from '@inrupt/solid-client';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// Απαραίτητο για να κλείνει σωστά το popup του browser στο κινητό
WebBrowser.maybeCompleteAuthSession();

interface Patient {
  id: string;
  name: string;
  amka: string;
  accessType: string;
  webId: string;
}

export default function App() {
  // --- STATE ΕΦΑΡΜΟΓΗΣ ---
  const [userRole, setUserRole] = useState<'none' | 'doctor' | 'patient'>('none');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [activePatientName, setActivePatientName] = useState('');
  
  // --- DYNAMIC SOLID LOGIN STATE ---
  const [dynamicClientId, setDynamicClientId] = useState<string | null>(null);
  const [discoveryDocument, setDiscoveryDocument] = useState<any>(null);

  // 1. Ρύθμιση του Redirect URI
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'solidmedicalapp'
  });

  // 2. Στήσιμο του Auth Request (περιμένει το dynamicClientId και το discovery)
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: dynamicClientId || '', 
      scopes: ['openid', 'profile', 'offline_access', 'webid'],
      redirectUri,
    },
    discoveryDocument 
  );

  const isBrowserOpen = useRef(false);
  
  // 3. Παρακολούθηση της επιστροφής από τον Browser (Όταν γίνει το Login)
  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      console.log("Επιτυχία! Authorization Code:", code);
      setIsLoggedIn(true);
    } else if (response?.type === 'error') {
      Alert.alert("Σφάλμα σύνδεσης", response.error?.message || "Κάτι πήγε στραβά.");
    }
  }, [response]);

  // 4. Όταν έχουμε το δυναμικό Client ID και το request είναι έτοιμο, ανοίγουμε τον browser
  useEffect(() => {
    if (dynamicClientId && request && !isBrowserOpen.current) {
      isBrowserOpen.current = true; // Κλειδώνουμε: "Ο browser μόλις άνοιξε!"
      
      promptAsync().then(() => {
        // Όταν ο χρήστης κλείσει τον browser (ή τελειώσει το login), ξεκλειδώνουμε
        isBrowserOpen.current = false;
      }).catch(() => {
        isBrowserOpen.current = false;
      });
    }
  }, [dynamicClientId, request]);

  // --- Η ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΤΟ DYNAMIC REGISTRATION ---
  const handleDynamicLogin = async (providerUrl: string) => {
    try {
      setLoading(true);

      // Βρίσκουμε τα endpoints του Provider (Discovery)
      const discoveryUrl = `${providerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const discoveryRes = await fetch(discoveryUrl);
      
      // ΠΡΟΣΘΗΚΗ: Έλεγχος αν το URL υπάρχει όντως!
      if (!discoveryRes.ok) {
        throw new Error(`Ο server απάντησε με κωδικό ${discoveryRes.status}. Βεβαιώσου ότι το URL του Provider είναι σωστό.`);
      }

      const discovery = await discoveryRes.json();
      setDiscoveryDocument(discovery);
      
      // ΠΡΟΣΘΗΚΗ: Μετατρέπουμε τα πεδία από snake_case (Solid) σε camelCase (Expo)
      const expoDiscovery = {
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
        revocationEndpoint: discovery.revocation_endpoint,
        userInfoEndpoint: discovery.userinfo_endpoint,
      };
      
      // Αποθηκεύουμε το "μεταφρασμένο" document
      setDiscoveryDocument(expoDiscovery);

      // Κάνουμε Dynamic Client Registration (DCR) χρησιμοποιώντας το raw discovery
      const registrationRes = await fetch(discovery.registration_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_name: 'Solid Medical App', 
          redirect_uris: [redirectUri], 
          application_type: 'native',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none', 
        }),
      });

      // ΠΡΟΣΘΗΚΗ: Έλεγχος αν πέτυχε η εγγραφή (DCR)
      if (!registrationRes.ok) {
         throw new Error(`Αποτυχία εγγραφής (DCR). Status: ${registrationRes.status}`);
      }

      const clientData = await registrationRes.json();
      
      if (clientData.client_id) {
        console.log("Πήραμε δυναμικό Client ID:", clientData.client_id);
        setDynamicClientId(clientData.client_id);
      } else {
        Alert.alert("Σφάλμα", "Ο Provider δεν υποστηρίζει Dynamic Registration.");
      }
    } catch (error: any) {
      console.error("DCR Error:", error);
      Alert.alert("Σφάλμα Σύνδεσης", error.message || "Αποτυχία επικοινωνίας με τον Provider.");
    } finally {
      setLoading(false);
    }
  };

  // --- ΛΟΓΙΚΗ ΓΙΑ ΤΑ ΔΕΔΟΜΕΝΑ (SUPABASE & SOLID) ---
  useEffect(() => {
    if (isLoggedIn && userRole === 'doctor') {
      fetchPatients();
    }
  }, [isLoggedIn, userRole]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('patients').select('*');
      if (error) { console.error("Σφάλμα:", error.message); return; }
      if (data) {
        const formattedPatients: Patient[] = data.map((item) => ({
          id: item.id, name: item.name, amka: item.amka, accessType: item.access_type, webId: item.web_id,
        }));
        setPatients(formattedPatients);
      }
    } catch (error) { console.error("Σφάλμα:", error); } finally { setLoading(false); }
  };

  const handleOpenFolder = async (webId: string, patientName: string) => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      const folderUrl = webId.replace('profile/card#me', 'public/');
      const myDataset = await getSolidDataset(folderUrl);
      const files = getContainedResourceUrlAll(myDataset);
      setFolderFiles(files);
      setActivePatientName(patientName);
      setModalVisible(true);
    } catch (error) {
      Alert.alert("Πρόβλημα", "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (fileUrl: string) => {
    const supported = await Linking.canOpenURL(fileUrl);
    if (supported) await Linking.openURL(fileUrl);
  };

  const renderPatientCard = ({ item }: { item: Patient }) => (
    <View style={styles.card}>
      <View style={styles.cardDetails}>
        <Text style={styles.patientName}>{item.name}</Text>
        <Text style={styles.cardLabel}>AMKA: <Text style={styles.cardValue}>{item.amka}</Text></Text>
        <Text style={styles.cardLabel}>Πρόσβαση: <Text style={styles.cardValue}>{item.accessType}</Text></Text>
      </View>
      <TouchableOpacity style={styles.cardActionButton} onPress={() => handleOpenFolder(item.webId, item.name)}>
        <Text style={styles.cardActionButtonText}>Προβολή Φακέλου</Text>
      </TouchableOpacity>
    </View>
  );

  // ==========================================
  // ΟΘΟΝΗ 1: ΕΠΙΛΟΓΗ ΡΟΛΟΥ
  // ==========================================
  if (userRole === 'none') {
    return (
      <SafeAreaView style={styles.figmaContainer}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.figmaContent}>
          <FontAwesome5 name="heartbeat" size={70} color="#2c3e50" style={{ marginBottom: 20 }} />
          <Text style={styles.figmaTitle}>Σύνδεση</Text>
          
          <View style={{ width: '100%', marginTop: 50 }}>
            <TouchableOpacity style={styles.figmaButton} onPress={() => setUserRole('patient')}>
              <Text style={styles.figmaButtonText}>Ασθενής</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.figmaButton} onPress={() => setUserRole('doctor')}>
              <Text style={styles.figmaButtonText}>Γιατρός</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // ΟΘΟΝΗ 2: SOLID LOGIN
  // ==========================================
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar barStyle="dark-content" />
        
        {/* Κουμπί Πίσω για να αλλάξει ρόλο */}
        <TouchableOpacity style={styles.backButton} onPress={() => setUserRole('none')}>
          <Ionicons name="arrow-back" size={28} color="#2c3e50" />
        </TouchableOpacity>

        <View style={styles.loginCard}>
          <Ionicons name="medical" size={60} color="#3b5998" style={{ alignSelf: 'center', marginBottom: 20 }} />
          <Text style={styles.loginTitle}>Πρόσβαση {userRole === 'doctor' ? 'Ιατρού' : 'Ασθενή'}</Text>
          <Text style={styles.loginSubtitle}>Συνδεθείτε μέσω του Solid Pod σας</Text>
          
          <Text style={styles.inputLabel}>Solid Provider (π.χ. inrupt.com)</Text>
          <TextInput 
            style={styles.loginInput} 
            value="https://datapod.igrant.io" 
            editable={false}
          />

          <TouchableOpacity 
            style={styles.solidLoginButton} 
            onPress={() => handleDynamicLogin('https://datapod.igrant.io')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.solidLoginButtonText}>Σύνδεση στο Solid</Text>
                <Feather name="external-link" size={20} color="white" style={{marginLeft: 10}} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // ΟΘΟΝΗ 3: ΚΥΡΙΑ ΕΦΑΡΜΟΓΗ (Μόνο για τον Γιατρό προς το παρόν)
  // ==========================================
  if (isLoggedIn && userRole === 'patient') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20}}>
          <Ionicons name="construct" size={80} color="#7f8c8d" />
          <Text style={{fontSize: 22, textAlign: 'center', marginTop: 20, color: '#2c3e50'}}>Η οθόνη του Ασθενή είναι υπό κατασκευή!</Text>
          <TouchableOpacity style={[styles.solidLoginButton, {marginTop: 30}]} onPress={() => { setIsLoggedIn(false); setUserRole('none'); }}>
            <Text style={styles.solidLoginButtonText}>Επιστροφή</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Feather name="list" size={32} color="#2c3e50" />
        <TouchableOpacity onPress={() => { setIsLoggedIn(false); setUserRole('none'); }}>
          <Ionicons name="log-out-outline" size={36} color="#e74c3c" />
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#7f8c8d" style={{ marginRight: 10 }} />
        <TextInput style={styles.searchInput} placeholder="Αναζήτηση..." />
      </View>

      {loading ? <ActivityIndicator size="large" color="#3b5998" style={{ marginTop: 50 }} /> : (
        <FlatList data={patients} keyExtractor={(item) => item.id} renderItem={renderPatientCard} contentContainerStyle={styles.listContent} />
      )}

      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Φάκελος: {activePatientName}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={30} color="#e74c3c" /></TouchableOpacity>
            </View>
            {folderFiles.length === 0 ? <Text style={styles.emptyText}>Άδειος φάκελος.</Text> : (
              <FlatList data={folderFiles} keyExtractor={(item, idx) => idx.toString()} renderItem={({ item }) => {
                const fileName = item.split('/').pop() || 'Αρχείο';
                return (
                  <TouchableOpacity style={styles.fileItem} onPress={() => openFile(item)}>
                    <Ionicons name="document-text" size={24} color="#3498db" style={{marginRight: 15}} />
                    <Text style={styles.fileName}>{decodeURIComponent(fileName)}</Text>
                  </TouchableOpacity>
                );
              }} />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#ecf0f1',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 20 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 25, marginHorizontal: 20, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: '#bdc3c7' },
  searchInput: { flex: 1, height: 40, fontSize: 16 },
  listContent: { paddingHorizontal: 20 },
  card: { backgroundColor: 'white', borderRadius: 15, padding: 20, marginBottom: 15, elevation: 2 },
  cardDetails: { marginBottom: 15 },
  patientName: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5 },
  cardLabel: { fontSize: 14, color: '#7f8c8d' },
  cardValue: { fontWeight: 'bold', color: '#34495e' },
  cardActionButton: { backgroundColor: '#3b5998', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  cardActionButtonText: { color: 'white', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '60%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ecf0f1', paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  fileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 15, borderRadius: 10, marginBottom: 10 },
  fileName: { fontSize: 16, color: '#2c3e50' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#7f8c8d' },
  
  /* ΣΤΥΛ ΓΙΑ ΤΗΝ ΟΘΟΝΗ ΕΠΙΛΟΓΗΣ (FIGMA VIBE) */
  figmaContainer: { flex: 1, backgroundColor: '#a6c0d4' }, // Το γαλάζιο του figma
  figmaContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  figmaTitle: { fontSize: 32, color: '#2c3e50', fontWeight: '500', marginBottom: 40 },
  figmaButton: { backgroundColor: '#3b4b6b', width: '100%', paddingVertical: 15, borderRadius: 25, marginBottom: 20, alignItems: 'center' }, // Το σκούρο μπλε
  figmaButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },

  /* ΣΤΥΛ ΓΙΑ ΤΗΝ ΟΘΟΝΗ LOGIN */
  loginContainer: { flex: 1, backgroundColor: '#ecf0f1', padding: 20, justifyContent: 'center' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  loginCard: { backgroundColor: 'white', padding: 30, borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  loginTitle: { fontSize: 26, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center', marginBottom: 5 },
  loginSubtitle: { fontSize: 16, color: '#7f8c8d', textAlign: 'center', marginBottom: 40 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#34495e', marginBottom: 8 },
  loginInput: { backgroundColor: '#ecf0f1', borderRadius: 10, padding: 15, fontSize: 16, color: '#7f8c8d', marginBottom: 30 },
  solidLoginButton: { backgroundColor: '#3b5998', paddingVertical: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  solidLoginButtonText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
});