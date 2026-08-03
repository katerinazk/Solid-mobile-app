import 'react-native-get-random-values';
import 'text-encoding';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Linking, Modal, Platform, Animated, Dimensions } from 'react-native';
import { Ionicons, Feather, FontAwesome5 } from '@expo/vector-icons';
import { supabase } from './supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { createDpopToken } from './dpop';

// Απαραίτητο για να κλείνει σωστά το popup του browser στο κινητό
WebBrowser.maybeCompleteAuthSession();

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  amka: string;
  accessType: string;
  webId: string;
  web_id?: string;
  folderUrl: string;
}

// Παλέτα χρωμάτων της εφαρμογής - χρησιμοποιείται παντού
// εκτός από το κόκκινο κουμπί κατάργησης πρόσβασης και τα μαύρα γράμματα στο κείμενο
const COLORS = {
  primary: '#304674',   // σκούρο μπλε - κουμπιά, εικονίδια, bottom nav
  medium: '#98bad5',    // μεσαίο μπλε - δευτερεύοντα στοιχεία
  light: '#c6d3e3',     // ανοιχτό μπλε - κάρτες
  light2: '#b2cbde',    // ανοιχτό μπλε (εναλλακτικό)
  lightest: '#d8e1e8',  // πολύ ανοιχτό μπλε - φόντο/επιφάνειες
  text: '#000000',      // μαύρο κείμενο
  danger: '#e74c3c',    // ΜΟΝΟ για το κουμπί κατάργησης πρόσβασης
  white: '#ffffff',
};

export default function App() {
  // --- STATE ΕΦΑΡΜΟΓΗΣ ---
  const [userRole, setUserRole] = useState<'none' | 'doctor' | 'patient'>('none');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [folderFiles, setFolderFiles] = useState<string[]>([]);
  const [activePatientName, setActivePatientName] = useState('');
  const [patientAmka, setPatientAmka] = useState('');
  const [loggedInPatientAmka, setLoggedInPatientAmka] = useState('');
  const [doctorAmka, setDoctorAmka] = useState('');
  const [loggedInDoctorAmka, setLoggedInDoctorAmka] = useState('');
  const [doctorTab, setDoctorTab] = useState<'home' | 'access'>('home');
  const [isDoctorMenuVisible, setIsDoctorMenuVisible] = useState(false);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);

  // Προσβάσεις Ασθενής
  const [accessList, setAccessList] = useState<any[]>([]);
  const [isAddAccessModalVisible, setIsAddAccessModalVisible] = useState(false);
  const [newDoctorAmka, setNewDoctorAmka] = useState('');
  const [newAccessType, setNewAccessType] = useState('Πλήρης Πρόσβαση');
  
  // Ασθενείς
  const [showPatientRegister, setShowPatientRegister] = useState(false);
  const [patientForm, setPatientForm] = useState({
    first_name: '',
    last_name: '',
    amka: '',
    birth_date: '',
    sex: '',
    blood_type: '',
    phone: '',
  });
  
  // --- DYNAMIC SOLID LOGIN STATE ---
  const [dynamicClientId, setDynamicClientId] = useState<string | null>(null);
  const storedClientId = useRef<string>('');
  const isDcrRunning = useRef(false);
  const [discoveryDocument, setDiscoveryDocument] = useState<any>(null);
  const [accessToken, setAccessToken] = useState('');
  const [idToken, setIdToken] = useState('');
  const [activePatientFolderUrl, setActivePatientFolderUrl] = useState('');

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
      extraParams: { prompt: 'login' },  // Αναγκάζει τον Solid server να ζητά credentials κάθε φορά
    },
    discoveryDocument
  );

  const isBrowserOpen = useRef(false);
  const expectingResponse = useRef(false);

  // 3. Παρακολούθηση της επιστροφής από τον Browser (Όταν γίνει το Login)
  useEffect(() => {
    const getRealAccessToken = async () => {
      // Επεξεργαζόμαστε μόνο το response που περιμένουμε (όχι stale από προηγούμενο login)
      if (response?.type === 'success' && response.params.code && expectingResponse.current) {
        expectingResponse.current = false;
        const authCode = response.params.code;
        console.log("1. Πήραμε το Εισιτήριο (Auth Code):", authCode);

        try {
          /// Φτιάχνουμε DPoP token για το token endpoint
          const tokenEndpoint = discoveryDocument.tokenEndpoint;
          const dpopForToken = await createDpopToken('POST', tokenEndpoint);

          const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'DPoP': dpopForToken,  // 👈 Το κλειδί της λύσης
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: storedClientId.current,
              code: authCode,
              redirect_uri: redirectUri,
              code_verifier: request?.codeVerifier || '',
            }).toString(),
          });

          const tokenData = await tokenResponse.json();
          console.log("Token Response:", JSON.stringify(tokenData));

          if (tokenData.access_token) {
            setAccessToken(tokenData.access_token);
            if (tokenData.id_token) setIdToken(tokenData.id_token);
            if (userRole === 'patient') {
              // Παίρνουμε το WebID από το token (είναι encoded στο JWT)
              const tokenParts = tokenData.access_token.split('.');
              const tokenPayload = JSON.parse(atob(tokenParts[1]));
              const webId = tokenPayload.webid || tokenPayload.sub || '';
              console.log("🔑 WebID από token:", webId);

              const verified = await handlePatientLoginVerification(webId);
              if (verified) setIsLoggedIn(true);
            } else if (userRole === 'doctor') {
              const tokenParts = tokenData.access_token.split('.');
              const tokenPayload = JSON.parse(atob(tokenParts[1]));
              const webId = tokenPayload.webid || tokenPayload.sub || '';
              console.log("🔑 WebID γιατρού από token:", webId);

              const verified = await handleDoctorLoginVerification(webId);
              if (verified) setIsLoggedIn(true);
            } else {
              setIsLoggedIn(true);
            }
          } else {
            alert("Αποτυχία λήψης token: " + JSON.stringify(tokenData));
          }

        } catch (error) {
          console.error("Σφάλμα κατά την ανταλλαγή του token:", error);
          alert("Αποτυχία λήψης Access Token!");
        }
      }
    };

    getRealAccessToken();
  }, [response]);

  // 4. Όταν έχουμε το δυναμικό Client ID και το request είναι έτοιμο, ανοίγουμε τον browser
  useEffect(() => {
    if (dynamicClientId && request && !isBrowserOpen.current) {
      isBrowserOpen.current = true; // Κλειδώνουμε: "Ο browser μόλις άνοιξε!"
      expectingResponse.current = true; // Περιμένουμε response από αυτό το login
      setDynamicClientId(null);

      // preferEphemeralSession: στο iOS αποτρέπει τη διατήρηση cookies/session
      // ανάμεσα σε διαδοχικά logins, ώστε να μη «θυμάται» τον προηγούμενο χρήστη.
      promptAsync({ preferEphemeralSession: true }).then(() => {
        // Όταν ο χρήστης κλείσει τον browser (ή τελειώσει το login), ξεκλειδώνουμε
        isBrowserOpen.current = false;
      }).catch(() => {
        isBrowserOpen.current = false;
      });
    }
  }, [dynamicClientId, request]);

  //για το κουμπί προσθήκης διάγνωσης
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newDiagnosis, setNewDiagnosis] = useState('');
  //για την επεξεργασία
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editFileUrl, setEditFileUrl] = useState('');

  const handlePatientLoginVerification = async (webId: string): Promise<boolean> => {
    try {
      // Ελέγχουμε αν το webId ανήκει σε γιατρό (cached browser session από γιατρό)
      const { data: doctorCheck } = await supabase
        .from('doctors')
        .select('amka')
        .eq('web_id', webId)
        .maybeSingle();

      if (doctorCheck) {
        alert("Ο λογαριασμός Pod που χρησιμοποιείτε ανήκει σε γιατρό. Παρακαλώ αποσυνδεθείτε από τον τρέχοντα λογαριασμό στον browser και δοκιμάστε ξανά με τον δικό σας λογαριασμό.");
        return false;
      }

      const { data, error } = await supabase
        .from('patients')
        .select('web_id')
        .eq('amka', loggedInPatientAmka)
        .single();

      if (error || !data) {
        alert("Δεν βρέθηκε ασθενής με αυτό το ΑΜΚΑ.");
        return false;
      }

      if (!data.web_id) {
        await supabase
          .from('patients')
          .update({ web_id: webId })
          .eq('amka', loggedInPatientAmka);
        console.log("✅ WebID αποθηκεύτηκε:", webId);
      } else if (data.web_id !== webId) {
        alert("Συνδεθήκατε σε λάθος Pod! Παρακαλώ συνδεθείτε με τον λογαριασμό που αντιστοιχεί στο ΑΜΚΑ σας.");
        return false;
      }

      console.log("✅ Ο ασθενής επαληθεύτηκε επιτυχώς!");
      const patientFolder = webId.replace('profile/card#me', 'public/');
      setActivePatientFolderUrl(patientFolder);
      return true;

    } catch (error) {
      console.error("Σφάλμα επαλήθευσης:", error);
      return false;
    }
  };

  const handleDoctorLoginVerification = async (webId: string): Promise<boolean> => {
    try {
      // Ελέγχουμε αν το webId ανήκει σε ασθενή (cached browser session από ασθενή)
      const { data: patientCheck } = await supabase
        .from('patients')
        .select('amka')
        .eq('web_id', webId)
        .maybeSingle();

      if (patientCheck) {
        alert("Ο λογαριασμός Pod που χρησιμοποιείτε ανήκει σε ασθενή. Παρακαλώ αποσυνδεθείτε από τον τρέχοντα λογαριασμό στον browser και δοκιμάστε ξανά με τον δικό σας λογαριασμό.");
        return false;
      }

      const { data, error } = await supabase
        .from('doctors')
        .select('web_id')
        .eq('amka', loggedInDoctorAmka)
        .single();

      if (error || !data) {
        alert("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return false;
      }

      if (!data.web_id) {
        await supabase
          .from('doctors')
          .update({ web_id: webId })
          .eq('amka', loggedInDoctorAmka);
        console.log("✅ WebID γιατρού αποθηκεύτηκε:", webId);
      } else if (data.web_id !== webId) {
        alert("Συνδεθήκατε σε λάθος Pod! Παρακαλώ συνδεθείτε με τον λογαριασμό που αντιστοιχεί στο ΑΜΚΑ σας.");
        return false;
      }

      console.log("✅ Ο γιατρός επαληθεύτηκε επιτυχώς!");
      return true;

    } catch (error) {
      console.error("Σφάλμα επαλήθευσης:", error);
      return false;
    }
  };

  // 3. Πότε θα τρέξει η ερώτηση στη βάση;
  // Μόλις το `isLoggedIn` γίνει true (δηλαδή μόλις συνδεθεί ο γιατρός επιτυχώς!)
  useEffect(() => {
    if (isLoggedIn && userRole === 'patient') {
      fetchAccessList();
    }
  }, [isLoggedIn]);

  // --- Η ΣΥΝΑΡΤΗΣΗ ΓΙΑ ΤΟ DYNAMIC REGISTRATION ---
  const handleDynamicLogin = async (providerUrl: string) => {
    if (isDcrRunning.current) return;
    isDcrRunning.current = true;
    try {
      setLoading(true);
      // Καθαρίζουμε το παλιό discovery ώστε το useAuthRequest να μηδενίσει το response
      setDiscoveryDocument(null);

      // Βρίσκουμε τα endpoints του Provider (Discovery)
      const discoveryUrl = `${providerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const discoveryRes = await fetch(discoveryUrl);
      
      // ΠΡΟΣΘΗΚΗ: Έλεγχος αν το URL υπάρχει όντως!
      if (!discoveryRes.ok) {
        throw new Error(`Ο server απάντησε με κωδικό ${discoveryRes.status}. Βεβαιώσου ότι το URL του Provider είναι σωστό.`);
      }

      const discovery = await discoveryRes.json();

      // Logout από τυχόν ενεργή session πριν το νέο login (καθαρισμός browser session).
      // Ο server απαιτεί id_token_hint - χωρίς αυτό απαντάει με σφάλμα αντί να κάνει
      // redirect, οπότε το επιχειρούμε μόνο όταν έχουμε πραγματικά id_token σε μνήμη
      // (δηλ. μέσα στην ίδια εκτέλεση της εφαρμογής, μετά από προηγούμενο login).
      if (discovery.end_session_endpoint && idToken) {
        try {
          const logoutUrl = `${discovery.end_session_endpoint}?id_token_hint=${encodeURIComponent(idToken)}&post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
          await WebBrowser.openAuthSessionAsync(logoutUrl, redirectUri);
        } catch (e) {
          // Αγνοούμε αποτυχία logout, συνεχίζουμε κανονικά
        }
      }

      // Μετατρέπουμε τα πεδία από snake_case (Solid) σε camelCase (Expo)
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
        storedClientId.current = clientData.client_id;
        setDynamicClientId(clientData.client_id);
      } else {
        Alert.alert("Σφάλμα", "Ο Provider δεν υποστηρίζει Dynamic Registration.");
      }
    } catch (error: any) {
      console.error("DCR Error:", error);
      Alert.alert("Σφάλμα Σύνδεσης", error.message || "Αποτυχία επικοινωνίας με τον Provider.");
    } finally {
      setLoading(false);
      isDcrRunning.current = false;
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
      // Φέρνουμε μόνο τους ασθενείς που έχουν δώσει πρόσβαση σε αυτόν τον γιατρό,
      // μαζί με τον τύπο πρόσβασης που έχουν ορίσει.
      const { data, error } = await supabase
        .from('access')
        .select(`
          access_type,
          patients (first_name, last_name, amka, web_id)
        `)
        .eq('doctor_amka', loggedInDoctorAmka);

      if (error) { console.error("Σφάλμα:", error.message); return; }
      if (data) {
        const formattedPatients: Patient[] = data
          .filter((row: any) => row.patients)
          .map((row: any) => ({
            id: row.patients.amka,
            first_name: row.patients.first_name,
            last_name: row.patients.last_name,
            amka: row.patients.amka,
            accessType: row.access_type,
            webId: row.patients.web_id,
            folderUrl: row.patients.web_id ? row.patients.web_id.replace('profile/card#me', 'public/') : ''
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
      
      const dpopToken = await createDpopToken('GET', folderUrl);
      const response = await fetch(folderUrl, {
        method: 'GET',
        headers: {
          'Authorization': `DPoP ${accessToken}`,
          'DPoP': dpopToken,
          'Accept': 'text/turtle',
        },
      });

      if (!response.ok) {
        Alert.alert("Πρόβλημα", "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
        return;
      }

      const text = await response.text();
      const folderUrlForFilter = webId.replace('profile/card#me', 'public/');
      console.log("📄 Turtle response:", text);
      console.log("📁 folderUrlForFilter:", folderUrlForFilter);

      // Ισοπεδώνουμε τα newlines ώστε να πιάνουμε και πολυγραμμικές λίστες
      const flatText = text.replace(/\r?\n\s*/g, ' ');
      const fileUrls: string[] = [];
      // Βρίσκουμε κάθε ldp:contains block (μπορεί να έχει πολλά URLs με κόμμα)
      for (const containsMatch of flatText.matchAll(/ldp:contains\s+((?:<[^>]+>(?:\s*,\s*)?)+)/g)) {
        for (const uriMatch of containsMatch[1].matchAll(/<([^>]+)>/g)) {
          const uri = uriMatch[1];
          if (uri.startsWith('http')) {
            fileUrls.push(uri);
          } else if (uri.startsWith('/')) {
            const parsedBase = new URL(folderUrlForFilter);
            fileUrls.push(`${parsedBase.protocol}//${parsedBase.host}${uri}`);
          } else {
            fileUrls.push(`${folderUrlForFilter}${uri}`);
          }
        }
      }
      console.log("📋 Files found:", fileUrls);

      setFolderFiles(fileUrls);
      setActivePatientName(patientName);
      setModalVisible(true);
    } catch (error) {
      Alert.alert("Πρόβλημα", "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (url: string) => {
    try {
      setLoading(true);

      const dpopToken = await createDpopToken('GET', url); // 👈 ΠΡΟΣΘΕΣΕ ΑΥΤΟ

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `DPoP ${accessToken}`, // 👈 ΑΛΛΑΞΕ ΤΟ Bearer σε DPoP
          'DPoP': dpopToken,                       // 👈 ΠΡΟΣΘΕΣΕ ΑΥΤΟ
        },
      });

      if (response.ok) {
        const content = await response.text();
        alert("Περιεχόμενο Διάγνωσης:\n\n" + content);
      } else {
        alert("Δεν ήταν δυνατή η ανάγνωση του αρχείου.");
      }
    } catch (error) {
      alert("Σφάλμα κατά το άνοιγμα.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (url: string) => {
    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη διάγνωση;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              const dpopToken = await createDpopToken('DELETE', url);

              const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                  'Authorization': `DPoP ${accessToken}`,
                  'DPoP': dpopToken,
                },
              });

              if (response.ok) {
                // Αφαιρούμε το αρχείο από τη λίστα
                setFolderFiles((prev) => prev.filter((f) => f !== url));
                alert("Η διάγνωση διαγράφηκε επιτυχώς!");
              } else {
                alert("Σφάλμα διαγραφής: " + response.status);
              }
            } catch (error) {
              alert("Αποτυχία σύνδεσης.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleEditFile = async (url: string) => {
    try {
      setLoading(true);
      const dpopToken = await createDpopToken('GET', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `DPoP ${accessToken}`,
          'DPoP': dpopToken,
        },
      });

      if (response.ok) {
        const content = await response.text();
        setEditContent(content);      // Προγεμίζουμε το TextInput
        setEditFileUrl(url);          // Θυμόμαστε ποιο αρχείο επεξεργαζόμαστε
        setIsEditModalVisible(true);  // Ανοίγουμε το Modal
      } else {
        alert("Αποτυχία φόρτωσης αρχείου.");
      }
    } catch (error) {
      alert("Σφάλμα σύνδεσης.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setLoading(true);
      const dpopToken = await createDpopToken('PUT', editFileUrl);
      const response = await fetch(editFileUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `DPoP ${accessToken}`,
          'DPoP': dpopToken,
        },
        body: editContent,
      });

      if (response.ok) {
        alert("Η διάγνωση ενημερώθηκε επιτυχώς!");
        setIsEditModalVisible(false);
      } else {
        alert("Σφάλμα αποθήκευσης: " + response.status);
      }
    } catch (error) {
      alert("Σφάλμα σύνδεσης.");
    } finally {
      setLoading(false);
    }
  };

  const renderPatientCard = ({ item }: { item: Patient }) => {
  
    // 1. Φτιάχνουμε το URL του φακέλου για αυτόν τον ασθενή.
    const patientUrl = `https://datapod.igrant.io/${item.amka}/public/`; 

    return (
      <View style={styles.card}>
        <View style={styles.cardDetails}>
          <Text style={styles.patientName}>{item.first_name} {item.last_name}</Text>
          <Text style={styles.cardLabel}>AMKA: <Text style={styles.cardValue}>{item.amka}</Text></Text>
          <Text style={styles.cardLabel}>Τύπος πρόσβασης: <Text style={styles.cardValue}>{item.accessType}</Text></Text>
        </View>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={() => {
            // Παίρνουμε το σωστό WebID και φτιάχνουμε το URL του φακέλου public/
            const correctWebId = item.webId || item.web_id || "";
            setActivePatientFolderUrl(correctWebId.replace('profile/card#me', 'public/'));

            // Δείχνουμε πρώτα την οθόνη Ιστορικού με τις κατηγορίες -
            // το πραγματικό άνοιγμα του Solid Pod γίνεται μόνο όταν πατηθεί "Διαγνώσεις".
            setHistoryPatient(item);
          }}
        >
          <Text style={styles.cardActionButtonText}>Προβολή Φακέλου</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const handleSaveDiagnosis = async () => {
    console.log("📍 ΒΗΜΑ 1: Μπήκαμε στην handleSaveDiagnosis!");
    if (newDiagnosis.trim() === '') {
      alert("Παρακαλώ γράψτε μια διάγνωση!");
      return;
    }
    console.log("📍 ΒΗΜΑ 2: Η διάγνωση δεν είναι κενή.");

    const fileName = `diagnosis_${Date.now()}.txt`;
    const fileUrl = `${activePatientFolderUrl}${fileName}`;
    console.log("📍 ΒΗΜΑ 3: Το URL φτιάχτηκε. fileUrl =", fileUrl);
    console.log("🔑 ΕΛΕΓΧΟΣ TOKEN:", accessToken ? "ΥΠΑΡΧΕΙ! (" + accessToken.substring(0, 15) + "...)" : "ΛΕΙΠΕΙ ΕΝΤΕΛΩΣ! ❌");
    console.log("📁 ΠΟΥ ΠΑΕΙ ΝΑ ΓΡΑΨΕΙ:", fileUrl);

    try {
      setLoading(true);

      if (!accessToken) {
        alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
        setLoading(false);
        return;
      }

      const dpopToken = await createDpopToken('PUT', fileUrl); // 👈 ΠΡΟΣΘΕΣΕ ΑΥΤΟ

      const response = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'Accept': '*/*',
          'Authorization': `DPoP ${accessToken}`, // 👈 ΑΛΛΑΞΕ ΤΟ Bearer σε DPoP
          'DPoP': dpopToken,                       // 👈 ΠΡΟΣΘΕΣΕ ΑΥΤΟ
        },
        body: newDiagnosis
      });

      if (response.ok) {
        alert("Η διάγνωση αποθηκεύτηκε επιτυχώς!");
        setFolderFiles((prevFiles) => [...prevFiles, fileUrl]);
        setIsModalVisible(false);
        setNewDiagnosis('');
      } else {
        const errorText = await response.text();
        alert(
          "ΚΩΔΙΚΟΣ: " + response.status + 
          "\nΜΗΚΟΣ TOKEN: " + accessToken.length + " χαρακτήρες" +
          "\n\nΛΟΓΟΣ:\n" + errorText.substring(0, 150)
        );
      }
    } catch (error) {
      console.error("Network Error:", error);
      alert("Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setLoading(false);
    }
  };

  const handlePatientRegister = async () => {
    if (!patientForm.first_name || !patientForm.last_name || !patientForm.amka) {
      alert("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα, Επίθετο και ΑΜΚΑ.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.from('patients').insert([{
        first_name: patientForm.first_name,
        last_name: patientForm.last_name,
        amka: patientForm.amka,
        birth_date: patientForm.birth_date || null,
        sex: patientForm.sex || null,
        blood_type: patientForm.blood_type || null,
        phone: patientForm.phone || null,
      }]);

      if (error) {
        alert("Σφάλμα αποθήκευσης: " + error.message);
        return;
      }

      // Πάμε στο Solid Login
      handleDynamicLogin('https://datapod.igrant.io');
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessList = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('access')
        .select(`
          doctor_amka,
          access_type,
          doctors (first_name, last_name, specialty, web_id)
        `)
        .eq('patient_amka', loggedInPatientAmka);

      if (error) { console.error(error); return; }
      setAccessList(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccess = async () => {
    if (!newDoctorAmka) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του γιατρού.");
      return;
    }
    try {
      setLoading(true);

      // Ελέγχουμε αν υπάρχει ο γιατρός
      const { data: doctorData, error: doctorError } = await supabase
        .from('doctors')
        .select('*')
        .eq('amka', newDoctorAmka)
        .single();

      if (doctorError || !doctorData) {
        alert("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return;
      }

      // Προσθέτουμε την πρόσβαση
      const { error } = await supabase
        .from('access')
        .insert([{
          patient_amka: loggedInPatientAmka,
          doctor_amka: newDoctorAmka,
          access_type: newAccessType,
        }]);

      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      await updatePodAcl(doctorData.web_id, newAccessType);
      alert(`Η πρόσβαση στον Δρ. ${doctorData.last_name} δόθηκε επιτυχώς!`);
      setNewDoctorAmka('');
      setIsAddAccessModalVisible(false);
      fetchAccessList(); // Ανανεώνουμε τη λίστα
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccess = async (doctorAmka: string) => {
    Alert.alert("Κατάργηση", "Θέλετε να αφαιρέσετε αυτή την πρόσβαση;", [
      { text: "Ακύρωση", style: "cancel" },
      {
        text: "Κατάργηση",
        style: "destructive",
        onPress: async () => {
          const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
          const doctorWebId = doctorEntry?.doctors?.web_id;
          console.log("🔍 doctorEntry:", JSON.stringify(doctorEntry));
          console.log("🔑 doctorWebId:", doctorWebId);
          const { error } = await supabase
            .from('access')
            .delete()
            .eq('patient_amka', loggedInPatientAmka)
            .eq('doctor_amka', doctorAmka);

          if (!error) {
            if (doctorWebId) {
              await removeDoctorFromAcl(doctorWebId);
            }
            setAccessList(prev => prev.filter(a => a.doctor_amka !== doctorAmka));
            alert("Η πρόσβαση καταργήθηκε επιτυχώς!");
          }
        }
      }
    ]);
  };

  const updatePodAcl = async (newDoctorWebId: string, accessType: string) => {
    const aclUrl = `${activePatientFolderUrl}.acl`;
    const patientWebId = `https://up1072722vol2.datapod.igrant.io/profile/card#me`;

    // Παίρνουμε ΟΛΟΥΣ τους υπάρχοντες γιατρούς + τον νέο
    let allDoctors = [...accessList];
    
    // Αν ο γιατρός δεν υπάρχει ήδη στη λίστα, τον προσθέτουμε προσωρινά
    const alreadyExists = allDoctors.some(a => a.doctors?.web_id === newDoctorWebId);
    if (!alreadyExists) {
      allDoctors = [...allDoctors, {
        doctors: { web_id: newDoctorWebId },
        access_type: accessType
      }];
    }

    let aclContent = `
  @prefix acl: <http://www.w3.org/ns/auth/acl#>.
  @prefix foaf: <http://xmlns.com/foaf/0.1/>.

  <#owner>
    a acl:Authorization;
    acl:agent <${patientWebId}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read, acl:Write, acl:Control.
  `;

    // Προσθέτουμε ΟΛΟΥΣ τους γιατρούς
    allDoctors.forEach((a, index) => {
      const webId = a.doctors?.web_id;
      if (!webId) return;
      const type = webId === newDoctorWebId ? accessType : a.access_type;
      aclContent += `
  <#doctor${index}>
    a acl:Authorization;
    acl:agent <${webId}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read${type === 'Πλήρης Πρόσβαση' ? ', acl:Write' : ''}.
  `;
    });

    const dpopToken = await createDpopToken('PUT', aclUrl);
    const response = await fetch(aclUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        'Authorization': `DPoP ${accessToken}`,
        'DPoP': dpopToken,
      },
      body: aclContent,
    });

    if (response.ok) {
      console.log("✅ ACL ενημερώθηκε στο Pod!");
    } else {
      console.error("❌ ACL error:", response.status, await response.text());
    }
  };

  const removeDoctorFromAcl = async (doctorWebId: string) => {
    const aclUrl = `${activePatientFolderUrl}.acl`;
    console.log("🗑️ Removing doctor WebID:", doctorWebId);
    console.log("📁 ACL URL:", aclUrl);
    const patientWebId = `https://up1072722vol2.datapod.igrant.io/profile/card#me`;

    // Πρώτα παίρνουμε τους υπόλοιπους γιατρούς που έχουν ακόμα πρόσβαση
    const remainingDoctors = accessList.filter(a => a.doctors?.web_id !== doctorWebId);
    console.log("👥 Remaining doctors:", remainingDoctors.length);

    // Φτιάχνουμε το νέο ACL με μόνο τους υπόλοιπους
    let aclContent = `
  @prefix acl: <http://www.w3.org/ns/auth/acl#>.
  @prefix foaf: <http://xmlns.com/foaf/0.1/>.

  <#owner>
    a acl:Authorization;
    acl:agent <${patientWebId}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read, acl:Write, acl:Control.
  `;

    // Προσθέτουμε έναν-έναν τους υπόλοιπους γιατρούς
    remainingDoctors.forEach((a, index) => {
      if (a.doctors?.web_id) {
        aclContent += `
  <#doctor${index}>
    a acl:Authorization;
    acl:agent <${a.doctors.web_id}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read${a.access_type === 'Πλήρης Πρόσβαση' ? ', acl:Write' : ''}.
  `;
      }
    });

    const dpopToken = await createDpopToken('PUT', aclUrl);
    const response = await fetch(aclUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        'Authorization': `DPoP ${accessToken}`,
        'DPoP': dpopToken,
      },
      body: aclContent,
    });

    if (response.ok) {
      console.log("✅ Η πρόσβαση αφαιρέθηκε από το Pod!");
    } else {
      console.error("❌ ACL error:", response.status, await response.text());
    }
  };

  const handleChangeAccessType = async (doctorAmka: string, currentType: string) => {
    const newType = currentType === 'Πλήρης Πρόσβαση' ? 'Μόνο Ανάγνωση' : 'Πλήρης Πρόσβαση';

    // Ενημέρωση Supabase
    const { error } = await supabase
      .from('access')
      .update({ access_type: newType })
      .eq('patient_amka', loggedInPatientAmka)
      .eq('doctor_amka', doctorAmka);

    if (error) { alert("Σφάλμα: " + error.message); return; }

    // Ενημέρωση ACL στο Pod
    const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
    if (doctorEntry?.doctors?.web_id) {
      await updatePodAcl(doctorEntry.doctors.web_id, newType);
    }

    // Ενημέρωση UI
    setAccessList(prev => prev.map(a => 
      a.doctor_amka === doctorAmka ? {...a, access_type: newType} : a
    ));
  };

  const confirmDoctorLogout = () => {
    Alert.alert('Αποσύνδεση', 'Θέλετε να αποσυνδεθείτε;', [
      { text: 'Ακύρωση', style: 'cancel' },
      { text: 'Αποσύνδεση', style: 'destructive', onPress: () => { setIsLoggedIn(false); setUserRole('none'); setDoctorAmka(''); setLoggedInDoctorAmka(''); setIdToken(''); setHistoryPatient(null); } },
    ]);
  };

  // Το πλαϊνό μενού γιατρού μπαίνει/βγαίνει με οριζόντιο slide (αριστερά -> δεξιά),
  // γι' αυτό το κάνουμε εμείς οι ίδιοι με Animated αντί για το ενσωματωμένο animationType="slide"
  // του Modal, που πάντα κινείται κάθετα (από κάτω).
  const menuDrawerWidth = Dimensions.get('window').width * 0.75;
  const menuTranslateX = useRef(new Animated.Value(-menuDrawerWidth)).current;

  const openDoctorMenu = () => {
    setIsDoctorMenuVisible(true);
    menuTranslateX.setValue(-menuDrawerWidth);
    Animated.timing(menuTranslateX, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };

  const closeDoctorMenu = () => {
    Animated.timing(menuTranslateX, { toValue: -menuDrawerWidth, duration: 220, useNativeDriver: true }).start(() => {
      setIsDoctorMenuVisible(false);
    });
  };

  // ==========================================
  // ΟΘΟΝΗ 1: ΕΠΙΛΟΓΗ ΡΟΛΟΥ
  // ==========================================
  if (userRole === 'none') {
    return (
      <SafeAreaView style={styles.figmaContainer}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.figmaContent}>
          <FontAwesome5 name="heartbeat" size={70} color={COLORS.primary} style={{ marginBottom: 20 }} />
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

  // ==========================================
  // ΟΘΟΝΗ ΕΓΓΡΑΦΗΣ ΑΣΘΕΝΗ
  // ==========================================
  if (userRole === 'patient' && !isLoggedIn && !showPatientRegister) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar barStyle="dark-content" />
        <TouchableOpacity style={styles.backButton} onPress={() => setUserRole('none')}>
          <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
        </TouchableOpacity>

        <View style={styles.loginCard}>
          <Ionicons name="medical" size={60} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
          <Text style={styles.loginTitle}>Σύνδεση</Text>

          <Text style={styles.inputLabel}>ΑΜΚΑ</Text>
          <TextInput
            style={styles.loginInput}
            placeholder="11 ψηφία"
            keyboardType="numeric"
            value={patientAmka}
            onChangeText={setPatientAmka}
          />

          <TouchableOpacity
            style={styles.solidLoginButton}
            onPress={() => {
              if (!patientAmka) {
                alert("Παρακαλώ εισάγετε το ΑΜΚΑ σας.");
                return;
              }
              setLoggedInPatientAmka(patientAmka);
              handleDynamicLogin('https://datapod.igrant.io');
            }}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.solidLoginButtonText}>Είσοδος</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={{marginTop: 15, alignItems: 'center'}}
            onPress={() => setShowPatientRegister(true)}
          >
            <Text style={{color: COLORS.text, fontSize: 14}}>Δεν έχετε λογαριασμό;</Text>
            <Text style={{color: COLORS.text, fontSize: 16, fontWeight: 'bold'}}>Εγγραφή</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (userRole === 'patient' && !isLoggedIn && showPatientRegister) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar barStyle="dark-content" />
        <TouchableOpacity style={styles.backButton} onPress={() => setUserRole('none')}>
          <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
        </TouchableOpacity>

        <View style={styles.loginCard}>
          <Ionicons name="person-add" size={60} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
          <Text style={styles.loginTitle}>Δημιουργία Λογαριασμού</Text>

          <Text style={styles.inputLabel}>Όνομα</Text>
          <TextInput style={styles.loginInput} placeholder="π.χ. Μαρία" value={patientForm.first_name} onChangeText={(t) => setPatientForm({...patientForm, first_name: t})} />

          <Text style={styles.inputLabel}>Επίθετο</Text>
          <TextInput style={styles.loginInput} placeholder="π.χ. Παππά" value={patientForm.last_name} onChangeText={(t) => setPatientForm({...patientForm, last_name: t})} />

          <Text style={styles.inputLabel}>ΑΜΚΑ</Text>
          <TextInput style={styles.loginInput} placeholder="11 ψηφία" keyboardType="numeric" value={patientForm.amka} onChangeText={(t) => setPatientForm({...patientForm, amka: t})} />

          <Text style={styles.inputLabel}>Ημερομηνία Γέννησης</Text>
          <TextInput style={styles.loginInput} placeholder="π.χ. 1990-07-22" value={patientForm.birth_date} onChangeText={(t) => setPatientForm({...patientForm, birth_date: t})} />

          <Text style={styles.inputLabel}>Φύλο</Text>
          <TextInput style={styles.loginInput} placeholder="Άνδρας / Γυναίκα" value={patientForm.sex} onChangeText={(t) => setPatientForm({...patientForm, sex: t})} />

          <Text style={styles.inputLabel}>Ομάδα Αίματος</Text>
          <TextInput style={styles.loginInput} placeholder="π.χ. A+" value={patientForm.blood_type} onChangeText={(t) => setPatientForm({...patientForm, blood_type: t})} />

          <Text style={styles.inputLabel}>Τηλέφωνο</Text>
          <TextInput style={styles.loginInput} placeholder="π.χ. 6912345678" keyboardType="numeric" value={patientForm.phone} onChangeText={(t) => setPatientForm({...patientForm, phone: t})} />

          <TouchableOpacity style={styles.solidLoginButton} onPress={handlePatientRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.solidLoginButtonText}>Αποθήκευση & Σύνδεση</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={{marginTop: 15, alignItems: 'center'}} onPress={() => setShowPatientRegister(false)}>
            <Text style={{color: COLORS.text, fontSize: 16}}>Έχω ήδη λογαριασμό</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar barStyle="dark-content" />
        
        {/* Κουμπί Πίσω για να αλλάξει ρόλο */}
        <TouchableOpacity style={styles.backButton} onPress={() => setUserRole('none')}>
          <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
        </TouchableOpacity>

        <View style={styles.loginCard}>
          <Ionicons name="medical" size={60} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
          <Text style={styles.loginTitle}>Πρόσβαση Ιατρού</Text>
          <Text style={styles.loginSubtitle}>Συνδεθείτε μέσω του Solid Pod σας</Text>

          <Text style={styles.inputLabel}>ΑΜΚΑ</Text>
          <TextInput
            style={styles.loginInput}
            placeholder="11 ψηφία"
            keyboardType="numeric"
            value={doctorAmka}
            onChangeText={setDoctorAmka}
          />

          <Text style={styles.inputLabel}>Solid Provider (π.χ. inrupt.com)</Text>
          <TextInput
            style={styles.loginInput}
            value="https://datapod.igrant.io"
            editable={false}
          />

          <TouchableOpacity
            style={styles.solidLoginButton}
            onPress={() => {
              if (!doctorAmka) {
                alert("Παρακαλώ εισάγετε το ΑΜΚΑ σας.");
                return;
              }
              setLoggedInDoctorAmka(doctorAmka);
              handleDynamicLogin('https://datapod.igrant.io');
            }}
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
  // ΟΘΟΝΗ 3: ΚΥΡΙΑ ΕΦΑΡΜΟΓΗ
  // ==========================================

  // ==========================================
  // ΟΘΟΝΗ ΑΣΘΕΝΗ (ΚΥΡΙΑ)
  // ==========================================
  if (isLoggedIn && userRole === 'patient') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={{fontSize: 20, fontWeight: 'bold', color: COLORS.text}}>Οι Προσβάσεις μου</Text>
          <TouchableOpacity onPress={() => { setIsLoggedIn(false); setUserRole('none'); setShowPatientRegister(false); setIdToken(''); }}>
            <Ionicons name="log-out-outline" size={36} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.addButton, {marginHorizontal: 20, marginBottom: 10}]} onPress={() => setIsAddAccessModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Προσθήκη Πρόσβασης</Text>
        </TouchableOpacity>

        {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{marginTop: 50}} /> : (
          accessList.length === 0 ? (
            <Text style={[styles.emptyText, {marginTop: 50}]}>Δεν έχετε δώσει πρόσβαση σε κανέναν γιατρό.</Text>
          ) : (
            <FlatList
              data={accessList}
              keyExtractor={(item) => item.doctor_amka}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardDetails}>
                    <Text style={styles.patientName}>
                      Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
                    </Text>
                    <Text style={styles.cardLabel}>Ειδικότητα: <Text style={styles.cardValue}>{item.doctors?.specialty}</Text></Text>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                      <Text style={styles.cardLabel}>Τύπος πρόσβασης: </Text>
                      <TouchableOpacity
                        onPress={() => handleChangeAccessType(item.doctor_amka, item.access_type)}
                        style={{
                          alignSelf: 'flex-start',
                          backgroundColor: item.access_type === 'Πλήρης Πρόσβαση' ? COLORS.primary : COLORS.medium,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 20,
                          marginTop: 5,
                        }}
                      >
                        <Text style={{color: 'white', fontWeight: 'bold', fontSize: 13}}>
                          {item.access_type} ✎
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.cardActionButton, {backgroundColor: '#e74c3c'}]} onPress={() => handleDeleteAccess(item.doctor_amka)}>
                    <Text style={styles.cardActionButtonText}>Κατάργηση</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )
        )}

        {/* Modal Προσθήκης Πρόσβασης */}
        <Modal animationType="slide" transparent={true} visible={isAddAccessModalVisible} onRequestClose={() => setIsAddAccessModalVisible(false)}>
          <View style={styles.addmodalOverlay}>
            <View style={styles.addmodalContent}>
              <Text style={styles.addmodalTitle}>Νέα Πρόσβαση</Text>

              <Text style={styles.inputLabel}>ΑΜΚΑ Γιατρού</Text>
              <TextInput
                style={styles.loginInput}
                placeholder="11 ψηφία"
                keyboardType="numeric"
                value={newDoctorAmka}
                onChangeText={setNewDoctorAmka}
              />

              <Text style={styles.inputLabel}>Τύπος Πρόσβασης</Text>
              <View style={{flexDirection: 'row', marginBottom: 20}}>
                <TouchableOpacity
                  style={[styles.modalButton, {flex: 1, marginRight: 5, backgroundColor: newAccessType === 'Πλήρης Πρόσβαση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium}]}
                  onPress={() => setNewAccessType('Πλήρης Πρόσβαση')}
                >
                  <Text style={{color: newAccessType === 'Πλήρης Πρόσβαση' ? COLORS.white : COLORS.text, textAlign: 'center'}}>Πλήρης</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, {flex: 1, marginLeft: 5, backgroundColor: newAccessType === 'Μόνο Ανάγνωση' ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium}]}
                  onPress={() => setNewAccessType('Μόνο Ανάγνωση')}
                >
                  <Text style={{color: newAccessType === 'Μόνο Ανάγνωση' ? COLORS.white : COLORS.text, textAlign: 'center'}}>Μόνο Ανάγνωση</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtonsGroup}>
                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsAddAccessModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>Ακύρωση</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddAccess} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveButtonText}>Εντάξει</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {historyPatient ? (
        <View style={{ flex: 1 }}>
          <View style={styles.historyHeader}>
            <TouchableOpacity onPress={() => setHistoryPatient(null)} style={styles.historyBackButton}>
              <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.historyTitle}>Ιστορικό</Text>
          </View>

          <Text style={styles.historyAmka}>ΑΜΚΑ: <Text style={styles.historyAmkaValue}>{historyPatient.amka}</Text></Text>

          <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
            <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Εξετάσεις', 'Η λειτουργία έρχεται σύντομα.')}>
              <Text style={styles.historyCategoryButtonText}>Εξετάσεις</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Φάρμακα', 'Η λειτουργία έρχεται σύντομα.')}>
              <Text style={styles.historyCategoryButtonText}>Φάρμακα</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Αλλεργίες', 'Η λειτουργία έρχεται σύντομα.')}>
              <Text style={styles.historyCategoryButtonText}>Αλλεργίες</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyCategoryButton}
              onPress={() => handleOpenFolder(historyPatient.webId || historyPatient.web_id || "", `${historyPatient.first_name} ${historyPatient.last_name}`)}
            >
              <Text style={styles.historyCategoryButtonText}>Διαγνώσεις</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Νοσηλίες', 'Η λειτουργία έρχεται σύντομα.')}>
              <Text style={styles.historyCategoryButtonText}>Νοσηλίες</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Εμβολιασμοί', 'Η λειτουργία έρχεται σύντομα.')}>
              <Text style={styles.historyCategoryButtonText}>Εμβολιασμοί</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.docHeader}>
            <TouchableOpacity onPress={openDoctorMenu}>
              <Feather name="menu" size={28} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDoctorLogout}>
              <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            {doctorTab === 'home' ? (
              <>
                <View style={{ paddingHorizontal: 20 }}>
                  <Text style={styles.dashboardLabel}>Αναζήτηση ΑΜΚΑ:</Text>
                </View>
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <TextInput style={styles.searchInput} placeholderTextColor={COLORS.primary} keyboardType="numeric" />
                </View>

                <View style={{ paddingHorizontal: 20 }}>
                  <Text style={styles.dashboardTitle}>Ειδοποιήσεις</Text>
                  <Text style={[styles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <TextInput style={styles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
                </View>

                <TouchableOpacity
                  style={styles.requestAccessButton}
                  onPress={() => Alert.alert('Αίτημα Πρόσβασης', 'Η λειτουργία έρχεται σύντομα.')}
                >
                  <Ionicons name="add" size={20} color={COLORS.white} />
                  <Text style={styles.requestAccessButtonText}>Αίτημα Πρόσβασης</Text>
                </TouchableOpacity>

                {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
                  <FlatList style={{ flex: 1 }} data={patients} keyExtractor={(item) => item.id} renderItem={renderPatientCard} contentContainerStyle={styles.listContent} />
                )}
              </>
            )}
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.bottomNavItem} onPress={() => { setDoctorTab('home'); setHistoryPatient(null); }}>
              <Text style={[styles.bottomNavText, doctorTab === 'home' && styles.bottomNavTextActive]}>Αρχική</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomNavItem} onPress={() => { setDoctorTab('access'); setHistoryPatient(null); }}>
              <Text style={[styles.bottomNavText, doctorTab === 'access' && styles.bottomNavTextActive]}>Προσβάσεις</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomNavItem} onPress={() => Alert.alert('Ρυθμίσεις', 'Η λειτουργία έρχεται σύντομα.')}>
              <Text style={styles.bottomNavText}>Ρυθμίσεις</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Φάκελος: {activePatientName}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={30} color={COLORS.primary} /></TouchableOpacity>
            </View>
            {/* Το νέο κουμπί προσθήκης στην κορυφή  */}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setIsModalVisible(true)}
            >
              <Text style={styles.addButtonText}>+ Προσθήκη Ιστορικού</Text>
            </TouchableOpacity>
            {folderFiles.length === 0 ? <Text style={styles.emptyText}>Άδειος φάκελος.</Text> : (
              <FlatList data={folderFiles} keyExtractor={(item, idx) =>
                idx.toString()}
                renderItem={({ item }) => {
                  const fileName = item.split('/').pop() || 'Αρχείο';
                  return (
                    <View style={styles.fileItem}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => openFile(item)}
                      >
                        <Ionicons name="document-text" size={24} color={COLORS.primary} style={{marginRight: 15}} />
                        <Text style={styles.fileName}>{decodeURIComponent(fileName)}</Text>
                      </TouchableOpacity>

                      {/* Κουμπί edit */}
                      <TouchableOpacity onPress={() => handleEditFile(item)} style={{marginRight: 15}}>
                        <Ionicons name="pencil-outline" size={24} color={COLORS.text} />
                      </TouchableOpacity>

                      {/* Κουμπί διαγραφής */}
                      <TouchableOpacity onPress={() => handleDeleteFile(item)}>
                        <Ionicons name="trash-outline" size={24} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  );
                }} />
            )}
          </View>
        </View>
      </Modal>
      {/* Το Αναδυόμενο Παραθυράκι (Modal) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)} // Για όταν πατάει το 'πίσω' στο Android
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Νέα Διάγνωση</Text>

            <TextInput
              style={styles.textArea}
              multiline={true}
              numberOfLines={4}
              placeholder="Γράψτε τη διάγνωση εδώ..."
              value={newDiagnosis}
              onChangeText={setNewDiagnosis}
            />

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveDiagnosis}
              >
                <Text style={styles.saveButtonText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Επεξεργασία Διάγνωσης</Text>

            <TextInput
              style={styles.textArea}
              multiline={true}
              numberOfLines={4}
              value={editContent}
              onChangeText={setEditContent}
            />

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.saveButtonText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="none"
        transparent={true}
        visible={isDoctorMenuVisible}
        onRequestClose={closeDoctorMenu}
      >
        <View style={styles.menuOverlay}>
          <Animated.View style={[styles.menuPanel, { transform: [{ translateX: menuTranslateX }] }]}>
            <TouchableOpacity onPress={closeDoctorMenu}>
              <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.white} />
            </TouchableOpacity>

            <View style={styles.menuItems}>
              <TouchableOpacity onPress={() => { setDoctorTab('home'); setHistoryPatient(null); closeDoctorMenu(); }}>
                <Text style={styles.menuItemText}>Αρχική</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDoctorTab('access'); setHistoryPatient(null); closeDoctorMenu(); }}>
                <Text style={styles.menuItemText}>Προσβάσεις</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { closeDoctorMenu(); Alert.alert('Ρυθμίσεις', 'Η λειτουργία έρχεται σύντομα.'); }}>
                <Text style={styles.menuItemText}>Ρυθμίσεις</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={styles.menuLogoutButton}
              onPress={() => { closeDoctorMenu(); confirmDoctorLogout(); }}
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
              <Text style={styles.menuLogoutText}>Αποσύνδεση</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={closeDoctorMenu}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightest,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  addButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  addButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 20 },

  /* Header της οθόνης γιατρού (menu + avatar) */
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 15 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, marginHorizontal: 20, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: 16, color: COLORS.text },

  /* Κουμπί "+ Αίτημα Πρόσβασης" (οθόνη γιατρού) */
  requestAccessButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    marginHorizontal: 20,
    marginBottom: 15,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAccessButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },

  dashboardLabel: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  dashboardTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginTop: 10, marginBottom: 10 },

  /* Οθόνη Ιστορικού ασθενή (κατηγορίες φακέλου) */
  historyHeader: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: 10, marginBottom: 10, minHeight: 40 },
  historyBackButton: { position: 'absolute', left: 20, top: 0 },
  historyTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  historyAmka: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary, paddingHorizontal: 20, marginTop: 10, marginBottom: 20 },
  historyAmkaValue: { fontWeight: 'normal' },
  historyCategoryButton: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginBottom: 15 },
  historyCategoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },

  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: COLORS.light, borderRadius: 15, padding: 20, marginBottom: 15, elevation: 2 },
  cardDetails: { marginBottom: 15 },
  patientName: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 5 },
  cardLabel: { fontSize: 14, color: COLORS.text },
  cardValue: { fontWeight: 'bold', color: COLORS.text },
  cardActionButton: { backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: 25, alignItems: 'center' },
  cardActionButtonText: { color: COLORS.white, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.lightest, borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '60%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.medium, paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  fileItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.light, padding: 15, borderRadius: 10, marginBottom: 10 },
  fileName: { fontSize: 16, color: COLORS.text },
  emptyText: { textAlign: 'center', marginTop: 50, color: COLORS.text },
  addmodalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Ημιδιάφανο μαύρο φόντο
  },
  addmodalContent: {
    width: '85%',
    backgroundColor: COLORS.lightest,
    borderRadius: 15,
    padding: 20,
    elevation: 5, // Σκιά για Android
    shadowColor: '#000', // Σκιά για iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  addmodalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: COLORS.text,
    textAlign: 'center',
  },
  textArea: {
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 8,
    padding: 10,
    height: 100,
    textAlignVertical: 'top', // Σημαντικό για Android
    marginBottom: 20,
    color: COLORS.text,
  },
  modalButtonsGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: COLORS.lightest,
    borderWidth: 1,
    borderColor: COLORS.medium,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },

  /* Κάτω μπάρα πλοήγησης (οθόνη γιατρού) */
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
  },
  bottomNavText: {
    color: COLORS.medium,
    fontSize: 14,
    fontWeight: '600',
  },
  bottomNavTextActive: {
    color: COLORS.white,
    fontWeight: 'bold',
  },

  /* Πλαϊνό μενού γιατρού (drawer) */
  menuOverlay: { flex: 1, flexDirection: 'row' },
  menuPanel: {
    width: '75%',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 60,
    paddingBottom: 40,
  },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  menuItems: { alignItems: 'center', marginTop: 40 },
  menuItemText: { color: COLORS.white, fontSize: 20, fontWeight: 'bold', marginVertical: 18 },
  menuLogoutButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
  menuLogoutText: { color: COLORS.white, fontSize: 16, fontWeight: '600', marginLeft: 8 },

  /* ΣΤΥΛ ΓΙΑ ΤΗΝ ΟΘΟΝΗ ΕΠΙΛΟΓΗΣ (FIGMA VIBE) */
  figmaContainer: { flex: 1, backgroundColor: COLORS.medium },
  figmaContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  figmaTitle: { fontSize: 32, color: COLORS.text, fontWeight: '500', marginBottom: 40 },
  figmaButton: { backgroundColor: COLORS.primary, width: '100%', paddingVertical: 15, borderRadius: 25, marginBottom: 20, alignItems: 'center' },
  figmaButtonText: { color: COLORS.white, fontSize: 18, fontWeight: '600' },

  /* ΣΤΥΛ ΓΙΑ ΤΗΝ ΟΘΟΝΗ LOGIN */
  loginContainer: { flex: 1, backgroundColor: COLORS.lightest, padding: 20, justifyContent: 'center' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  loginCard: { backgroundColor: COLORS.light, padding: 30, borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  loginTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 5 },
  loginSubtitle: { fontSize: 16, color: COLORS.text, textAlign: 'center', marginBottom: 40 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  loginInput: { backgroundColor: COLORS.lightest, borderRadius: 10, padding: 15, fontSize: 16, color: COLORS.text, marginBottom: 30 },
  solidLoginButton: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  solidLoginButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 18 },
});