import React, { createContext, useState, useRef, useEffect, ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import { supabase } from '../services/supabase';
import { createDpopToken } from '../utils/dpop';
import { ROUTES } from '../constants/routes';
import { clearPatientWebId } from '../services/patients';
import { clearDoctorWebId } from '../services/doctors';
import { resetAclSyncForPatient, resetAclSyncForDoctor } from '../services/access';
import { clearRecordCache } from '../utils/recordCache';
import { askConfirm, showMessage } from '../utils/appMessage';

type Role = 'doctor' | 'patient';

const SOLID_PROVIDER_URL = 'https://datapod.igrant.io';

// Το όνομα με το οποίο συστήνεται η εφαρμογή στον Solid provider.
const APP_NAME = 'MedPod';

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
  confirmSwitchPod: () => void;
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

  // Προσοχή: ο node-solid-server δεν δείχνει το client_name στην οθόνη συγκατάθεσης, αλλά την
  // προέλευση (origin) αυτού εδώ του URI. Ένα σχήμα εφαρμογής δεν έχει origin, οπότε εκεί
  // εμφανίζεται "null". Θα χρειαζόταν https redirect σε δικό μας domain για να φαίνεται όνομα.
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
        showMessage("Ο λογαριασμός Pod που χρησιμοποιείτε ανήκει σε γιατρό. Παρακαλώ αποσυνδεθείτε από τον τρέχοντα λογαριασμό στον browser και δοκιμάστε ξανά με τον δικό σας λογαριασμό.");
        return false;
      }

      const { data, error } = await supabase
        .from('patients')
        .select('web_id')
        .eq('amka', loggedInPatientAmka)
        .single();

      if (error || !data) {
        showMessage("Δεν βρέθηκε ασθενής με αυτό το ΑΜΚΑ.");
        return false;
      }

      if (!data.web_id) {
        // Δύο ΑΜΚΑ δεν γίνεται να δείχνουν στο ίδιο Pod: τα ιατρικά αρχεία του ενός θα
        // εμφανίζονταν στον άλλο. Ο έλεγχος μετράει από τότε που μπορεί κανείς να αλλάξει Pod.
        const { data: taken } = await supabase
          .from('patients')
          .select('amka')
          .eq('web_id', webId)
          .maybeSingle();

        if (taken) {
          showMessage("Αυτό το Pod χρησιμοποιείται ήδη από άλλον ασθενή. Συνδεθείτε με δικό σας Pod.");
          return false;
        }

        await supabase
          .from('patients')
          .update({ web_id: webId })
          .eq('amka', loggedInPatientAmka);
        console.log("✅ WebID αποθηκεύτηκε:", webId);
      } else if (data.web_id !== webId) {
        showMessage("Συνδεθήκατε σε λάθος Pod! Παρακαλώ συνδεθείτε με τον λογαριασμό που αντιστοιχεί στο ΑΜΚΑ σας.");
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
        showMessage("Ο λογαριασμός Pod που χρησιμοποιείτε ανήκει σε ασθενή. Παρακαλώ αποσυνδεθείτε από τον τρέχοντα λογαριασμό στον browser και δοκιμάστε ξανά με τον δικό σας λογαριασμό.");
        return false;
      }

      const { data, error } = await supabase
        .from('doctors')
        .select('web_id')
        .eq('amka', loggedInDoctorAmka)
        .single();

      if (error || !data) {
        showMessage("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return false;
      }

      if (!data.web_id) {
        // Το ίδιο και εδώ: ένα Pod ανήκει σε έναν μόνο γιατρό.
        const { data: taken } = await supabase
          .from('doctors')
          .select('amka')
          .eq('web_id', webId)
          .maybeSingle();

        if (taken) {
          showMessage("Αυτό το Pod χρησιμοποιείται ήδη από άλλον γιατρό. Συνδεθείτε με δικό σας Pod.");
          return false;
        }

        await supabase
          .from('doctors')
          .update({ web_id: webId })
          .eq('amka', loggedInDoctorAmka);
        console.log("✅ WebID γιατρού αποθηκεύτηκε:", webId);
      } else if (data.web_id !== webId) {
        showMessage("Συνδεθήκατε σε λάθος Pod! Παρακαλώ συνδεθείτε με τον λογαριασμό που αντιστοιχεί στο ΑΜΚΑ σας.");
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
            showMessage("Αποτυχία λήψης token: " + JSON.stringify(tokenData));
          }

        } catch (error) {
          console.error("Σφάλμα κατά την ανταλλαγή του token:", error);
          showMessage("Αποτυχία λήψης Access Token!");
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
          // Το όνομα που δηλώνει η εφαρμογή στον Solid provider. Οι servers που ακολουθούν το
          // Solid-OIDC το δείχνουν στην οθόνη συγκατάθεσης. Ο datapod.igrant.io (node-solid-server)
          // δείχνει αντ' αυτού την προέλευση του redirect URI - βλ. σχόλιο στο redirectUri.
          client_name: APP_NAME,
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
        showMessage("Ο Provider δεν υποστηρίζει Dynamic Registration.");
      }
    } catch (error: any) {
      console.error("DCR Error:", error);
      showMessage(error.message || "Αποτυχία επικοινωνίας με τον Provider.");
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
    // Οι εγγραφές του Pod μένουν μόνο στη μνήμη. Τις σβήνουμε εδώ, ώστε ο επόμενος χρήστης
    // της συσκευής να μην μπορεί να δει ιστορικό του προηγούμενου.
    clearRecordCache();
    setIsLoggedIn(false);
    setRole(null);
    setAccessToken('');
    setLoggedInPatientAmka('');
    setLoggedInDoctorAmka('');
    setActivePatientFolderUrl('');
    router.replace(ROUTES.LOGIN);
  };

  /**
   * Αποδεσμεύει το ΑΜΚΑ από το τωρινό Pod και βγάζει τον χρήστη στην οθόνη σύνδεσης.
   *
   * Η αντιστοίχιση ΑΜΚΑ-Pod γράφεται στη βάση την πρώτη φορά που θα συνδεθεί κανείς, και από
   * εκεί και πέρα η εφαρμογή απορρίπτει κάθε άλλο Pod για το ίδιο ΑΜΚΑ. Σβήνοντας το web_id,
   * η επόμενη σύνδεση δέχεται ό,τι Pod δηλώσει ο χρήστης και το κρατά ως το νέο του.
   */
  const switchPod = async () => {
    const { error } = role === 'patient'
      ? await clearPatientWebId(loggedInPatientAmka)
      : await clearDoctorWebId(loggedInDoctorAmka);

    if (error) {
      showMessage('Δεν ήταν δυνατή η αποδέσμευση του Pod. Δοκιμάστε ξανά.');
      return;
    }

    // Το νέο Pod ξεκινά με άδειο ACL, οπότε καμία παλιά πρόσβαση δεν ισχύει πια. Ξαναγράφεται
    // μόνη της μόλις μπει ο ασθενής στο νέο του Pod.
    if (role === 'patient') {
      await resetAclSyncForPatient(loggedInPatientAmka);
    } else {
      await resetAclSyncForDoctor(loggedInDoctorAmka);
    }

    logout();
  };

  const confirmSwitchPod = async () => {
    const consequence = role === 'patient'
      ? 'Οι καταχωρήσεις που έχετε σήμερα μένουν στο παλιό Pod και δεν μεταφέρονται. Οι γιατροί που σας έχουν πρόσβαση θα την ξαναποκτήσουν μόλις συνδεθείτε στο νέο.'
      : 'Οι ασθενείς σας θα σας ξαναεμφανιστούν καθώς ο καθένας τους μπαίνει στην εφαρμογή και ενημερώνεται ο φάκελός του.';

    const confirmed = await askConfirm({
      message: `Θα αποσυνδεθείτε και θα χρειαστεί να συνδεθείτε ξανά, δηλώνοντας το νέο σας Pod.

${consequence}`,
      confirmText: 'Συνέχεια',
      cancelText: 'Ακύρωση',
    });
    if (confirmed) switchPod();
  };

  const confirmLogout = async () => {
    const confirmed = await askConfirm({
      message: 'Θέλετε να αποσυνδεθείτε;',
      confirmText: 'Αποσύνδεση',
      cancelText: 'Ακύρωση',
    });
    if (confirmed) logout();
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
        confirmSwitchPod,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
