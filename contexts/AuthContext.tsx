import React, { createContext, useState, useRef, useEffect, ReactNode } from 'react';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import { supabase } from '../services/supabase';
import { createDpopToken } from '../utils/dpop';
import { ROUTES } from '../constants/routes';

type Role = 'doctor' | 'patient';

const SOLID_PROVIDER_URL = 'https://datapod.igrant.io';

export interface AuthContextValue {
  role: Role | null;
  isLoggedIn: boolean;
  loading: boolean;
  accessToken: string;
  loggedInPatientAmka: string;
  loggedInDoctorAmka: string;
  activePatientFolderUrl: string;
  setActivePatientFolderUrl: (url: string) => void;
  login: (role: Role, amka: string, providerUrl?: string) => void;
  logout: () => void;
  confirmLogout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loggedInPatientAmka, setLoggedInPatientAmka] = useState('');
  const [loggedInDoctorAmka, setLoggedInDoctorAmka] = useState('');
  const [activePatientFolderUrl, setActivePatientFolderUrl] = useState('');

  // --- DYNAMIC SOLID LOGIN STATE ---
  const [dynamicClientId, setDynamicClientId] = useState<string | null>(null);
  const storedClientId = useRef('');
  const isDcrRunning = useRef(false);
  const [discoveryDocument, setDiscoveryDocument] = useState<any>(null);
  const [accessToken, setAccessToken] = useState('');
  const [idToken, setIdToken] = useState('');

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'solidmedicalapp' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: dynamicClientId || '',
      scopes: ['openid', 'profile', 'offline_access', 'webid'],
      redirectUri,
      extraParams: { prompt: 'login' }, // Αναγκάζει τον Solid server να ζητά credentials κάθε φορά
    },
    discoveryDocument
  );

  const isBrowserOpen = useRef(false);
  const expectingResponse = useRef(false);

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

  // Παρακολούθηση της επιστροφής από τον Browser (Όταν γίνει το Login)
  useEffect(() => {
    const getRealAccessToken = async () => {
      // Επεξεργαζόμαστε μόνο το response που περιμένουμε (όχι stale από προηγούμενο login)
      if (response?.type === 'success' && response.params.code && expectingResponse.current) {
        expectingResponse.current = false;
        const authCode = response.params.code;
        console.log("1. Πήραμε το Εισιτήριο (Auth Code):", authCode);

        try {
          const tokenEndpoint = discoveryDocument.tokenEndpoint;
          const dpopForToken = await createDpopToken('POST', tokenEndpoint);

          const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'DPoP': dpopForToken,
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

            const tokenParts = tokenData.access_token.split('.');
            const tokenPayload = JSON.parse(atob(tokenParts[1]));
            const webId = tokenPayload.webid || tokenPayload.sub || '';
            console.log("🔑 WebID από token:", webId);

            if (role === 'patient') {
              const verified = await handlePatientLoginVerification(webId);
              if (verified) {
                setIsLoggedIn(true);
                router.replace(ROUTES.PATIENT_HOME);
              }
            } else if (role === 'doctor') {
              const verified = await handleDoctorLoginVerification(webId);
              if (verified) {
                setIsLoggedIn(true);
                router.replace(ROUTES.DOCTOR_HOME);
              }
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

  // Όταν έχουμε το δυναμικό Client ID και το request είναι έτοιμο, ανοίγουμε τον browser
  useEffect(() => {
    if (dynamicClientId && request && !isBrowserOpen.current) {
      isBrowserOpen.current = true;
      expectingResponse.current = true;
      setDynamicClientId(null);

      // preferEphemeralSession: στο iOS αποτρέπει τη διατήρηση cookies/session
      // ανάμεσα σε διαδοχικά logins, ώστε να μη «θυμάται» τον προηγούμενο χρήστη.
      promptAsync({ preferEphemeralSession: true }).then(() => {
        isBrowserOpen.current = false;
      }).catch(() => {
        isBrowserOpen.current = false;
      });
    }
  }, [dynamicClientId, request]);

  const runDynamicLogin = async (providerUrl: string) => {
    if (isDcrRunning.current) return;
    isDcrRunning.current = true;
    try {
      setLoading(true);
      // Καθαρίζουμε το παλιό discovery ώστε το useAuthRequest να μηδενίσει το response
      setDiscoveryDocument(null);

      const discoveryUrl = `${providerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const discoveryRes = await fetch(discoveryUrl);

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
          // Χωρίς αυτό, ο server απορρίπτει το post_logout_redirect_uri στο RP-Initiated
          post_logout_redirect_uris: [redirectUri],
          application_type: 'native',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });

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

  const login = (selectedRole: Role, amka: string, providerUrl?: string) => {
    setRole(selectedRole);
    if (selectedRole === 'patient') {
      setLoggedInPatientAmka(amka);
    } else {
      setLoggedInDoctorAmka(amka);
    }
    runDynamicLogin(providerUrl || SOLID_PROVIDER_URL);
  };

  const logout = () => {
    setIsLoggedIn(false);
    setRole(null);
    setAccessToken('');
    setLoggedInPatientAmka('');
    setLoggedInDoctorAmka('');
    router.replace(ROUTES.LOGIN);
  };

  const confirmLogout = () => {
    Alert.alert('Αποσύνδεση', 'Θέλετε να αποσυνδεθείτε;', [
      { text: 'Ακύρωση', style: 'cancel' },
      { text: 'Αποσύνδεση', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <AuthContext.Provider
      value={{
        role,
        isLoggedIn,
        loading,
        accessToken,
        loggedInPatientAmka,
        loggedInDoctorAmka,
        activePatientFolderUrl,
        setActivePatientFolderUrl,
        login,
        logout,
        confirmLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
