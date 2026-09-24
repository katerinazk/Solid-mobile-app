import React, { createContext, useState, useRef, useEffect, ReactNode } from 'react';
import { AppState, View, Platform, Modal, SafeAreaView, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
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
import { prefetchAllCategories } from '../utils/podPrefetch';
import { clearPodPrefetch } from '../utils/podPrefetchStore';
import { clearDoctorCache } from '../utils/doctorCache';
import { isSupportedWebId } from '../services/solidPod';
import { askConfirm, showMessage } from '../utils/appMessage';
import { friendlyErrorMessage } from '../utils/networkError';

type Role = 'doctor' | 'patient';

const SOLID_PROVIDER_URL = 'https://datapod.igrant.io';

// Αυτόματη αποσύνδεση λόγω αδράνειας - σημαντικό σε κοινόχρηστο κινητό (π.χ. ιατρείο), ώστε ένα
// ανοιχτό ιατρικό ιστορικό να μην μένει προσβάσιμο σε όποιον πάρει στα χέρια του τη συσκευή.
const IDLE_LOGOUT_MS = 5 * 60 * 1000;

// Το όνομα με το οποίο συστήνεται η εφαρμογή στον Solid provider.
const APP_NAME = 'MedPod';

/**
 * Η σελίδα-γέφυρα που δηλώνεται ως redirect_uri στον Solid provider.
 *
 * Ο node-solid-server γράφει στην οθόνη συγκατάθεσης την ΠΡΟΕΛΕΥΣΗ αυτής της διεύθυνσης -
 * όχι το client_name που του στέλνουμε. Ένα σχήμα εφαρμογής (solidmedicalapp://) δεν έχει
 * προέλευση, γι' αυτό ο ασθενής διαβάζει "null wants to access your Data Pod". Με μια
 * διεύθυνση https σε host που λέγεται medpod, διαβάζει το όνομα της εφαρμογής.
 *
 * Η σελίδα δεν κάνει τίποτα άλλο από το να προωθεί αμέσως στο σχήμα της εφαρμογής - το
 * αντίγραφό της είναι το web/auth.html αυτού του project. ΔΕΝ βλέπει ποτέ token: ο
 * κωδικός εξουσιοδότησης περνάει από τη διεύθυνση και ανταλλάσσεται μέσα στη συσκευή.
 *
 * Κενό = η παλιά συμπεριφορά, με το σχήμα της εφαρμογής ως redirect_uri. Έτσι η σύνδεση
 * δουλεύει κανονικά όσο δεν έχει ανέβει η σελίδα, και επιστρέφει εκεί με μία αλλαγή αν
 * κάτι πάει στραβά.
 */
const AUTH_BRIDGE_URL = '';

// Το πρόθεμα κάθε συνδέσμου που ανοίγει την εφαρμογή - το ίδιο "scheme" που δηλώνει το app.json.
const APP_LINK_PREFIX = 'solidmedicalapp://';

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
  const [loading, _setLoading] = useState(false);
  // Γνωστό ζήτημα Android/RN: η επιφάνεια σχεδίασης μερικές φορές δεν ξαναζωγραφίζεται μόνη
  // της μετά την επιστροφή από παρασκήνιο (system browser) - η οθόνη μένει στο τελευταίο καρέ
  // (π.χ. το spinner) ενώ το πραγματικό state έχει ήδη αλλάξει. Το AppState-based τέχνασμα δεν
  // αρκούσε μόνο του (μια πολύ γρήγορη επιστροφή μπορεί να μην προλάβει καν να καταγραφεί ως
  // αλλαγή AppState), οπότε το "σκούντημα" γίνεται τώρα ΚΑΙ κατευθείαν σε κάθε αλλαγή του
  // "loading" - ακριβώς τις στιγμές που ξέρουμε σίγουρα ότι η οθόνη πρέπει να αλλάξει.
  const [, forceRepaint] = useState(0);
  const setLoading = (value: boolean) => {
    _setLoading(value);
    forceRepaint((n) => n + 1);
  };
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

  // Το "auth-redirect" ΔΕΝ είναι διακοσμητικό: χωρίς μονοπάτι, η επιστροφή γίνεται στη ρίζα
  // (solidmedicalapp://), και επειδή αυτό ταιριάζει και σε OIDC redirect ΚΑΙ σε route του
  // expo-router, ο router προσπαθεί ΠΑΡΑΛΛΗΛΑ να την ερμηνεύσει ως πλοήγηση και πηγαίνει
  // στιγμιαία στην αρχική οθόνη (ρόλος/σύνδεση) - ανεξάρτητα από το "loading" μας, μιας και
  // είναι θέμα routing, όχι state. Με ξεχωριστό μονοπάτι που αντιστοιχεί σε πραγματική οθόνη
  // (βλ. app/auth-redirect.tsx) ο router πάει εκεί αντί στην αρχική, και δείχνει την ίδια
  // οθόνη φόρτωσης - χωρίς να πειράζει καθόλου την ανταλλαγή του κωδικού, που γίνεται από
  // ξεχωριστό listener του SDK και δεν εξαρτάται από το πού πλοηγεί ο router.
  const appRedirectUri = AuthSession.makeRedirectUri({ scheme: 'solidmedicalapp', path: 'auth-redirect' });

  // Η διεύθυνση που δηλώνεται στον provider - και που διαβάζει ο χρήστης στην οθόνη
  // συγκατάθεσης. Με γέφυρα είναι η σελίδα μας, αλλιώς το ίδιο το σχήμα της εφαρμογής.
  const redirectUri = AUTH_BRIDGE_URL || appRedirectUri;

  // Και η διεύθυνση που μας φέρνει πίσω. Με γέφυρα κρατάμε σκέτο το πρόθεμα του σχήματος:
  // η σελίδα προωθεί σε solidmedicalapp://auth?..., και η αναγνώριση της επιστροφής γίνεται
  // με απλή σύγκριση προθέματος - ένα '/' παραπάνω ή λιγότερο θα άφηνε τη σύνδεση να κρέμεται.
  const appReturnUri = AUTH_BRIDGE_URL ? APP_LINK_PREFIX : appRedirectUri;

  const [request, sdkResponse, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: dynamicClientId || '',
      scopes: ['openid', 'profile', 'offline_access', 'webid'],
      redirectUri,
      // prompt=login ζητάει credentials· max_age=0 λέει στον server ότι καμία υπάρχουσα
      // σύνδεση δεν είναι "αρκετά πρόσφατη", άρα πρέπει να ξαναζητήσει credentials ό,τι κι αν
      // θυμάται. Το prompt από μόνο του δεν αρκούσε: στο Android οι Custom Tabs μοιράζονται τα
      // cookies του browser της συσκευής (το preferEphemeralSession πιο κάτω ισχύει μόνο σε
      // iOS), οπότε αν το τελευταίο login στη συσκευή ήταν άλλος λογαριασμός, ο server τον
      // ξαναδίνει σιωπηλά αντί να ρωτήσει.
      extraParams: { prompt: 'login', max_age: '0' },
    },
    discoveryDocument
  );

  const isBrowserOpen = useRef(false);
  const expectingResponse = useRef(false);

  // --- ANDROID: IN-APP INCOGNITO WEBVIEW ΓΙΑ ΤΗ ΣΥΝΔΕΣΗ ΣΤΟ POD ---
  // Το Custom Tabs (system browser) στο Android μοιράζεται cookies με το Chrome της συσκευής,
  // και επιβεβαιώθηκε ότι ο συγκεκριμένος πάροχος αγνοεί το prompt=login/max_age=0 που ήδη
  // στέλνουμε: ένα session cookie από προηγούμενο login περνάει σιωπηλά, χωρίς να ζητηθούν
  // ξανά credentials. Ένα incognito WebView μέσα στην ίδια την εφαρμογή δεν έχει καθόλου
  // persistent cookies - κάθε άνοιγμα ξεκινάει από καθαρό μηδέν, άσχετα με τι κάνει ή δεν κάνει
  // ο πάροχος. Στο iOS δεν χρειάζεται: το preferEphemeralSession του SDK λύνει ήδη το ίδιο θέμα.
  const [webViewAuthUrl, setWebViewAuthUrl] = useState<string | null>(null);
  const webViewReturnResolver = useRef<((url: string | null) => void) | null>(null);

  // Κοινό σημείο: πιάνει την επιστροφή είτε από onShouldStartLoadWithRequest είτε από
  // onNavigationStateChange - το πρώτο ΔΕΝ καλείται πάντα στο Android για redirect που
  // ακολουθεί υποβολή φόρμας (π.χ. το "Allow" της οθόνης συγκατάθεσης), οπότε το δεύτερο
  // λειτουργεί σαν αξιόπιστο δίχτυ ασφαλείας. Το resolver γίνεται null μετά την πρώτη
  // επιτυχή σύλληψη, οπότε τυχόν δεύτερη κλήση απλώς δεν κάνει τίποτα.
  const captureReturnIfMatch = (url: string): boolean => {
    if (!url.startsWith(APP_LINK_PREFIX)) return false;
    webViewReturnResolver.current?.(url);
    webViewReturnResolver.current = null;
    return true;
  };

  const handleWebViewShouldStart = (navRequest: { url: string }): boolean => {
    return !captureReturnIfMatch(navRequest.url);
  };

  const handleWebViewNavStateChange = (navState: { url: string }) => {
    captureReturnIfMatch(navState.url);
  };

  const handleWebViewClose = () => {
    webViewReturnResolver.current?.(null);
    webViewReturnResolver.current = null;
  };

  // Δεύτερο σημείο σκουντήματος: κάθε φορά που η ίδια η εφαρμογή ξαναγίνει ενεργή (π.χ. έκλεισε
  // ο system browser), ό,τι κι αν άλλαξε ή όχι το "loading" στο ενδιάμεσο.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        forceRepaint((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // Με γέφυρα (ή στο Android, που περνάει πάντα από το incognito WebView - βλ. πιο κάτω), η
  // επιστροφή δεν έχει το σχήμα που περιμένει ο SDK για να την αναγνωρίσει από μόνος του,
  // οπότε τη διαβάζουμε μόνοι μας. Το σχήμα του αντικειμένου μένει ίδιο, ώστε η συνέχεια της
  // ροής - η ανταλλαγή του κωδικού με token - να μην ξέρει καν ποιος δρόμος ακολουθήθηκε.
  const [bridgeResponse, setBridgeResponse] = useState<any>(null);
  const response = (AUTH_BRIDGE_URL || Platform.OS === 'android') ? bridgeResponse : sdkResponse;

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
      } else if (data.web_id !== webId) {
        showMessage("Συνδεθήκατε σε λάθος Pod! Παρακαλώ συνδεθείτε με τον λογαριασμό που αντιστοιχεί στο ΑΜΚΑ σας.");
        return false;
      }

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
      } else if (data.web_id !== webId) {
        showMessage("Συνδεθήκατε σε λάθος Pod! Παρακαλώ συνδεθείτε με τον λογαριασμό που αντιστοιχεί στο ΑΜΚΑ σας.");
        return false;
      }

      return true;

    } catch (error) {
      console.error("Σφάλμα επαλήθευσης:", error);
      return false;
    }
  };

  // Μετά από αποτυχία, ένα απλό setLoading(false) αλλάζει σωστά το React state, αλλά σε
  // ορισμένες συσκευές Android η επιφάνεια της οθόνης δεν ξαναζωγραφίζεται μόνη της μετά την
  // επιστροφή από τον browser (επιβεβαιωμένο με logs: το "loading" γίνεται false κανονικά, η
  // οθόνη όμως μένει στο τελευταίο ζωγραφισμένο καρέ, το spinner). Μια πραγματική πλοήγηση
  // πίσω στην ίδια φόρμα αναγκάζει το react-native-screens να ξαναενεργοποιήσει και να
  // ξαναζωγραφίσει σωστά την οθόνη - κάτι που ένα απλό state update δεν καταφέρνει πάντα.
  const returnToLoginForm = () => {
    router.replace(role === 'patient' ? ROUTES.PATIENT_LOGIN : ROUTES.DOCTOR_LOGIN);
  };

  // Παρακολούθηση της επιστροφής από τον Browser (Όταν γίνει το Login)
  useEffect(() => {
    const getRealAccessToken = async () => {
      // Αγνοούμε ό,τι response δεν περιμένουμε (π.χ. stale από προηγούμενο login).
      if (!response || !expectingResponse.current) return;

      // Ο χρήστης δεν ολοκλήρωσε τη σύνδεση: έκλεισε τον browser, ακύρωσε τη συγκατάθεση, ή ο
      // πάροχος απάντησε με σφάλμα. Η οθόνη φόρτωσης σβήνει και ξαναδείχνει τη φόρμα - χωρίς
      // μήνυμα στην ακύρωση, που δεν είναι λάθος του χρήστη, μόνο στο πραγματικό σφάλμα.
      if (response.type !== 'success' || !response.params?.code) {
        expectingResponse.current = false;
        setLoading(false);
        returnToLoginForm();
        if (response.type === 'error') {
          showMessage('Η σύνδεση με το Pod απέτυχε ή απορρίφθηκε. Δοκιμάστε ξανά.');
        }
        return;
      }

      expectingResponse.current = false;
      const authCode = response.params.code;

      // Από εδώ και κάτω, κάθε δρόμος καταλήγει είτε σε επιτυχή σύνδεση είτε σε setLoading(false)
      // - η οθόνη φόρτωσης δεν πρέπει να μείνει ποτέ κολλημένη.
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

        if (tokenData.access_token) {
          setAccessToken(tokenData.access_token);
          if (tokenData.id_token) setIdToken(tokenData.id_token);

          const tokenParts = tokenData.access_token.split('.');
          const tokenPayload = JSON.parse(atob(tokenParts[1]));
          const webId = tokenPayload.webid || tokenPayload.sub || '';

          // Ο πάροχος απάντησε κανονικά, αλλά το Pod του έχει άλλη δομή από αυτή που ξέρει
          // η εφαρμογή. Χωρίς αυτόν τον έλεγχο η σύνδεση θα πετύχαινε και το ιστορικό θα
          // φαινόταν απλώς άδειο - το χειρότερο είδος σφάλματος σε ιατρικό φάκελο.
          if (!isSupportedWebId(webId)) {
            showMessage(
              'Ο λογαριασμός αυτού του παρόχου δεν έχει τη δομή Pod που υποστηρίζει η εφαρμογή. ' +
              'Δοκιμάστε κάποιον από τους υπόλοιπους παρόχους της λίστας.'
            );
            setLoading(false);
            returnToLoginForm();
            return;
          }

          if (role === 'patient') {
            const verified = await handlePatientLoginVerification(webId);
            if (verified) {
              // Το "loading" ΔΕΝ σβήνει εδώ. Το router.replace δεν αλλάζει οθόνη ακαριαία -
              // αν σβήσει τώρα, προλαβαίνει ένα ενδιάμεσο render όπου η φόρμα σύνδεσης
              // ξαναφαίνεται για μια στιγμή πριν προλάβει να μπει η επόμενη οθόνη. Μένει
              // αναμμένο μέχρι το logout(), οπότε δεν το ξαναβλέπει κανείς παρά μόνο όταν
              // γυρίσει ξανά στη φόρμα σύνδεσης.
              setIsLoggedIn(true);
              router.replace(ROUTES.PATIENT_HOME);

              // Κατεβάζουμε όλο το ιστορικό στο παρασκήνιο, ώστε οι κατηγορίες να
              // ανοίγουν ακαριαία. Δεν το περιμένουμε: αν αποτύχει, οι οθόνες
              // ρωτούν το Pod κανονικά όπως πριν.
              prefetchAllCategories(webId, tokenData.access_token).catch(() => {});
            } else {
              // Ο έλεγχος απέτυχε - handlePatientLoginVerification έδειξε ήδη το γιατί.
              // Μένουμε στη φόρμα σύνδεσης, οπότε εδώ το "loading" πρέπει να σβήσει.
              setLoading(false);
              returnToLoginForm();
            }
          } else if (role === 'doctor') {
            const verified = await handleDoctorLoginVerification(webId);
            if (verified) {
              setIsLoggedIn(true);
              router.replace(ROUTES.DOCTOR_HOME);
            } else {
              setLoading(false);
              returnToLoginForm();
            }
          } else {
            // Δεν θα έπρεπε ποτέ να συμβεί - ο ρόλος ορίζεται πριν καν ξεκινήσει η σύνδεση.
            // Ασφαλιστική δικλείδα, ώστε η οθόνη να μη μείνει κολλημένη σε "Σύνδεση με το Pod".
            setLoading(false);
          }
        } else {
          showMessage("Αποτυχία λήψης token: " + JSON.stringify(tokenData));
          setLoading(false);
          returnToLoginForm();
        }

      } catch (error) {
        console.error("Σφάλμα κατά την ανταλλαγή του token:", error);
        showMessage("Αποτυχία λήψης Access Token!");
        setLoading(false);
        returnToLoginForm();
      }
    };

    getRealAccessToken();
  }, [response]);

  // Σπάει ένα πλήρες URL επιστροφής (από το incognito WebView ή τη γέφυρα) σε params και
  // επιβεβαιώνει το state - κοινή λογική και για τους δύο δρόμους που δεν περνάνε από τον SDK.
  const handleReturnUrl = (returnUrl: string | null) => {
    if (!returnUrl) {
      setBridgeResponse({ type: 'dismiss' });
      return;
    }

    const query = returnUrl.split('?')[1] || '';
    const params: Record<string, string> = {};
    new URLSearchParams(query).forEach((value, key) => { params[key] = value; });

    // Το state είναι η προστασία απέναντι σε ξένη απάντηση: αν δεν είναι αυτό που στείλαμε,
    // ο κωδικός δεν ήρθε από τη δική μας σύνδεση και δεν τον αγγίζουμε.
    if (params.state !== request!.state) {
      setBridgeResponse({ type: 'error' });
      showMessage('Η απάντηση της σύνδεσης δεν αντιστοιχεί στο αίτημα. Δοκιμάστε ξανά.');
      return;
    }

    setBridgeResponse({ type: 'success', params });
  };

  /**
   * Ανοίγει τη σελίδα σύνδεσης του Pod και περιμένει την επιστροφή.
   *
   * Android: πάντα μέσω incognito WebView (βλ. σχόλιο στο webViewAuthUrl πιο πάνω) - το
   * Custom Tabs δεν είναι αξιόπιστο εδώ.
   *
   * iOS χωρίς γέφυρα το αναλαμβάνει όλο ο SDK. Με γέφυρα πρέπει να τα χωρίσουμε: στον provider
   * φεύγει η https διεύθυνση (αυτή που διαβάζει ο χρήστης), ενώ πίσω στην εφαρμογή γυρνάει
   * το σχήμα της - και ο SDK αναγνωρίζει την επιστροφή μόνο αν οι δύο ταυτίζονται.
   *
   * preferEphemeralSession: στο iOS αποτρέπει τη διατήρηση cookies/session ανάμεσα σε
   * διαδοχικά logins, ώστε να μη "θυμάται" τον προηγούμενο χρήστη.
   */
  const openLoginBrowser = async () => {
    if (Platform.OS === 'android') {
      const returnUrl = await new Promise<string | null>((resolve) => {
        webViewReturnResolver.current = resolve;
        setWebViewAuthUrl(request!.url);
      });
      setWebViewAuthUrl(null);
      handleReturnUrl(returnUrl);
      return;
    }

    if (!AUTH_BRIDGE_URL) {
      await promptAsync({ preferEphemeralSession: true });
      return;
    }

    const authUrl = await request!.makeAuthUrlAsync(discoveryDocument);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUri, { preferEphemeralSession: true });

    if (result.type !== 'success') {
      setBridgeResponse({ type: result.type });
      return;
    }

    handleReturnUrl(result.url);
  };

  // Όταν έχουμε το δυναμικό Client ID και το request είναι έτοιμο, ανοίγουμε τον browser
  useEffect(() => {
    // Το request χτίζεται ΑΣΥΓΧΡΟΝΑ από το useAuthRequest. Αν ανοίξουμε τον browser με
    // ένα request που φτιάχτηκε όσο το clientId ήταν ακόμα άδειο, το αίτημα φεύγει με άδειο
    // client_id και ο solid-server απαντά 403 Forbidden. Γι' αυτό περιμένουμε μέχρι το
    // request να ξαναχτιστεί με το σωστό client_id.
    if (dynamicClientId && request && request.clientId === dynamicClientId && !isBrowserOpen.current) {
      isBrowserOpen.current = true;
      expectingResponse.current = true;

      // Το dynamicClientId ΔΕΝ μηδενίζεται εδώ. Το useAuthRequest χτίζει το request από το clientId,
      // οπότε αν το σβήσουμε πριν ανοίξει ο browser, το αίτημα φεύγει με άδειο
      // client_id και ο solid-server απαντά 403 Forbidden. Μετρήθηκε: άδειο -> 403,
      // άκυρο -> 401, έγκυρο -> 302 προς /login. Μηδενίζεται μόλις κλείσει ο browser.
      //
      // preferEphemeralSession: στο iOS αποτρέπει τη διατήρηση cookies/session
      // ανάμεσα σε διαδοχικά logins, ώστε να μη «θυμάται» τον προηγούμενο χρήστη.
      openLoginBrowser().then(() => {
        isBrowserOpen.current = false;
        setDynamicClientId(null);
      }).catch(() => {
        isBrowserOpen.current = false;
        setDynamicClientId(null);
        // Δεν άνοιξε καν ο browser - δεν θα έρθει ποτέ response για να σβήσει το "loading".
        // Χωρίς αυτό η οθόνη θα έμενε κολλημένη σε "Σύνδεση με το Pod" για πάντα.
        expectingResponse.current = false;
        setLoading(false);
        showMessage('Δεν ήταν δυνατό το άνοιγμα της σελίδας σύνδεσης. Δοκιμάστε ξανά.');
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
      setBridgeResponse(null);

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
          await WebBrowser.openAuthSessionAsync(logoutUrl, appReturnUri);
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
        storedClientId.current = clientData.client_id;
        setDynamicClientId(clientData.client_id);
        // Το "loading" ΔΕΝ σβήνει εδώ: μένει αναμμένο όσο ανοίγει ο browser, περιμένουμε την
        // επιστροφή και ελέγχουμε τον χρήστη. Σβήνει στην απάντηση (βλ. το useEffect του
        // response) - είτε πετύχει η σύνδεση είτε αποτύχει σε οποιοδήποτε βήμα στο ενδιάμεσο.
      } else {
        showMessage("Ο Provider δεν υποστηρίζει Dynamic Registration.");
        setLoading(false);
      }
    } catch (error: any) {
      console.error("DCR Error:", error);
      showMessage(friendlyErrorMessage(error, "Αποτυχία επικοινωνίας με τον Provider."));
      setLoading(false);
    } finally {
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
    clearPodPrefetch();
    clearDoctorCache();
    setIsLoggedIn(false);
    // Έμεινε αναμμένο από την επιτυχή σύνδεση (βλ. σχόλιο στο getRealAccessToken) ώστε να
    // μην ξαναφανεί η φόρμα σύνδεσης λίγο πριν μπούμε στην εφαρμογή. Σβήνει τώρα, γιατί
    // τώρα πραγματικά γυρνάμε στη φόρμα.
    setLoading(false);
    setRole(null);
    setAccessToken('');
    setLoggedInPatientAmka('');
    setLoggedInDoctorAmka('');
    setActivePatientFolderUrl('');
    router.replace(ROUTES.LOGIN);
  };

  // --- ΑΥΤΟΜΑΤΗ ΑΠΟΣΥΝΔΕΣΗ ΛΟΓΩ ΑΔΡΑΝΕΙΑΣ ---
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  // Καλείται σε κάθε άγγιγμα της οθόνης (βλ. View με onStartShouldSetResponderCapture πιο κάτω)
  // - ξεκινάει ξανά το χρονόμετρο από την αρχή. Δεν πιάνει πληκτρολόγηση χωρίς κανένα άγγιγμα
  // ενδιάμεσα (σπάνιο σενάριο σε φόρμες αυτής της έκτασης), απλοποίηση συνειδητή.
  const resetIdleTimer = () => {
    if (!isLoggedIn) return;
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      showMessage('Αποσυνδεθήκατε λόγω αδράνειας.');
      logout();
    }, IDLE_LOGOUT_MS);
  };

  // Ξεκινάει μόλις γίνει το login και σταματάει στο logout - όχι νωρίτερα, ώστε η ίδια η οθόνη
  // σύνδεσης (όπου ο χρήστης μπορεί να αργήσει, π.χ. στον browser του Pod) να μην επηρεάζεται.
  useEffect(() => {
    if (isLoggedIn) {
      resetIdleTimer();
    } else {
      clearIdleTimer();
    }
    return clearIdleTimer;
  }, [isLoggedIn]);

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
      {/* onStartShouldSetResponderCapture: ενημερώνεται σε ΚΑΘΕ άγγιγμα σε ΟΛΗ την εφαρμογή
          πριν καν αποφασιστεί ποιο στοιχείο θα το χειριστεί, χωρίς όμως να "κλέβει" το άγγιγμα -
          το false στο τέλος αφήνει το κανονικό κουμπί/scroll από κάτω να δουλέψει κανονικά. */}
      <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => { resetIdleTimer(); return false; }}>
        {children}
      </View>

      {/* Android: η σύνδεση στο Pod ανοίγει εδώ, σε incognito WebView - βλ. σχόλιο στο
          webViewAuthUrl. onShouldStartLoadWithRequest πιάνει την επιστροφή ΠΡΙΝ προσπαθήσει
          το ίδιο το WebView να "φορτώσει" το solidmedicalapp:// (θα απέτυχε, δεν είναι σελίδα). */}
      <Modal visible={!!webViewAuthUrl} animationType="slide" onRequestClose={handleWebViewClose}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
            <TouchableOpacity onPress={handleWebViewClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ fontSize: 16, color: '#304674', fontWeight: 'bold' }}>Κλείσιμο</Text>
            </TouchableOpacity>
          </View>
          {webViewAuthUrl && (
            <WebView
              source={{ uri: webViewAuthUrl }}
              incognito
              onShouldStartLoadWithRequest={handleWebViewShouldStart}
              onNavigationStateChange={handleWebViewNavStateChange}
              startInLoadingState
              renderLoading={() => (
                <ActivityIndicator style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} size="large" color="#304674" />
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </AuthContext.Provider>
  );
}
