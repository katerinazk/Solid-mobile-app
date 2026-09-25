import React, { createContext, useState, useRef, useEffect, ReactNode } from 'react';
import { AppState, View, Platform, Modal, SafeAreaView, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { router, usePathname } from 'expo-router';
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
import { clearNewNotificationMarks } from '../services/notifications';
import { copyHistoryBetweenPods } from '../services/podMigration';
import { isSupportedWebId, getOwnerWebId } from '../services/solidPod';
import { askConfirm, showMessage } from '../utils/appMessage';
import { friendlyErrorMessage } from '../utils/networkError';

type Role = 'doctor' | 'patient';

const SOLID_PROVIDER_URL = 'https://datapod.igrant.io';

// Αυτόματη αποσύνδεση λόγω αδράνειας - σημαντικό σε κοινόχρηστο κινητό (π.χ. ιατρείο), ώστε ένα
// ανοιχτό ιατρικό ιστορικό να μην μένει προσβάσιμο σε όποιον πάρει στα χέρια του τη συσκευή.
const IDLE_LOGOUT_MS = 30 * 60 * 1000;

// Πόσο νωρίτερα από την πραγματική λήξη του access token ζητάμε ανανέωση - περιθώριο ώστε το
// αίτημα προλαβαίνει να ολοκληρωθεί πριν το παλιό token γίνει άκυρο, ακόμα και σε αργή σύνδεση.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

// Για τη μεταφορά ιστορικού σε άλλο Pod: το token του παλιού Pod πρέπει να ισχύει τουλάχιστον τόση
// ώρα, όσο κρατά η σύνδεση στο νέο. Αλλιώς ανανεώνεται πριν την αποσύνδεση.
const MIGRATION_MIN_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

// Οι οθόνες που ανοίγουν μόνο με σύνδεση. Οι υπόλοιπες (επιλογή ρόλου, φόρμες σύνδεσης και
// εγγραφής, επιστροφή από τον πάροχο) είναι ελεύθερες.
function requiresLogin(pathname: string): boolean {
  return (
    pathname.startsWith('/patient/screens') ||
    pathname.startsWith('/patient/istoriko') ||
    pathname.startsWith('/doctor/screens') ||
    pathname.startsWith('/doctor/patient_screens') ||
    pathname.startsWith('/forms') ||
    pathname === '/record_detail' ||
    pathname === '/notifications'
  );
}

function expiresWithin(token: string, ms: number): boolean {
  try {
    const exp = decodeJwtPayload(token).exp;
    return !exp || exp * 1000 - Date.now() <= ms;
  } catch {
    return true;
  }
}

// Διαβάζει το payload ενός JWT χωρίς επαλήθευση υπογραφής - χρησιμοποιείται μόνο για να
// διαβάσουμε πληροφορίες (webid, ημερομηνία λήξης) από token που μας έδωσε ήδη ο ίδιος ο
// server μέσα από HTTPS σύνδεση, όχι για να εμπιστευτούμε άγνωστο token.
function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  return JSON.parse(atob(parts[1]));
}

// Το όνομα με το οποίο συστήνεται η εφαρμογή στον Solid provider.
const APP_NAME = 'MedPod';

/**
 * Η σελίδα-γέφυρα που δηλώνεται ως redirect_uri στον Solid provider.
 *
 * Ο node-solid-server γράφει στην οθόνη συγκατάθεσης την ΠΡΟΕΛΕΥΣΗ αυτής της διεύθυνσης -
 * όχι το client_name που του στέλνουμε. Ένα σχήμα εφαρμογής (com.anonymous.medicalapp://) δεν έχει
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
const APP_LINK_PREFIX = 'com.anonymous.medicalapp://';

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
  isSwitchingPod: boolean;
  switchPodWithHistory: (providerUrl: string, copyHistory: boolean) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Δίχτυ ασφαλείας: αν για οποιονδήποτε λόγο (π.χ. κλείσιμο του παραθύρου σύνδεσης, αποτυχία
  // στη μέση της σύνδεσης) μείνει ανοιχτή οθόνη ιατρικού περιεχομένου χωρίς συνδεδεμένο
  // χρήστη, γυρνάμε στην αρχική οθόνη επιλογής ρόλου αντί να δείχνουμε άδεια, "ορφανή" οθόνη.
  const currentPath = usePathname();
  useEffect(() => {
    if (!isLoggedIn && requiresLogin(currentPath)) {
      router.replace(ROUTES.LOGIN);
    }
  }, [isLoggedIn, currentPath]);
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

  // Το "auth-redirect" ΔΕΝ είναι διακοσμητικό: χωρίς μονοπάτι, η επιστροφή γίνεται στη ρίζα
  // (com.anonymous.medicalapp://), και επειδή αυτό ταιριάζει και σε OIDC redirect ΚΑΙ σε route του
  // expo-router, ο router προσπαθεί ΠΑΡΑΛΛΗΛΑ να την ερμηνεύσει ως πλοήγηση και πηγαίνει
  // στιγμιαία στην αρχική οθόνη (ρόλος/σύνδεση) - ανεξάρτητα από το "loading" μας, μιας και
  // είναι θέμα routing, όχι state. Με ξεχωριστό μονοπάτι που αντιστοιχεί σε πραγματική οθόνη
  // (βλ. app/auth-redirect.tsx) ο router πάει εκεί αντί στην αρχική, και δείχνει την ίδια
  // οθόνη φόρτωσης - χωρίς να πειράζει καθόλου την ανταλλαγή του κωδικού, που γίνεται από
  // ξεχωριστό listener του SDK και δεν εξαρτάται από το πού πλοηγεί ο router.
  const appRedirectUri = AuthSession.makeRedirectUri({ scheme: 'com.anonymous.medicalapp', path: 'auth-redirect' });

  // Η διεύθυνση που δηλώνεται στον provider - και που διαβάζει ο χρήστης στην οθόνη
  // συγκατάθεσης. Με γέφυρα είναι η σελίδα μας, αλλιώς το ίδιο το σχήμα της εφαρμογής.
  const redirectUri = AUTH_BRIDGE_URL || appRedirectUri;

  // Και η διεύθυνση που μας φέρνει πίσω. Με γέφυρα κρατάμε σκέτο το πρόθεμα του σχήματος:
  // η σελίδα προωθεί σε com.anonymous.medicalapp://auth?..., και η αναγνώριση της επιστροφής γίνεται
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

  // Αλλαγή Pod με μεταφορά ιστορικού σε εξέλιξη (για την ένδειξη αναμονής στην οθόνη λογαριασμού).
  const [isSwitchingPod, setIsSwitchingPod] = useState(false);

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
        // Ασφαλιστική δικλείδα: το setTimeout της ανανέωσης μπορεί να καθυστερήσει ή να μην
        // προλάβει να τρέξει όσο η εφαρμογή ήταν στο παρασκήνιο (το λειτουργικό περιορίζει τους
        // background timers). Στην επιστροφή ελέγχουμε αμέσως αν χρειάζεται ανανέωση, αντί να
        // περιμένουμε το επόμενο πραγματικό αίτημα προς το Pod να αποτύχει πρώτα.
        refreshIfNeeded();
      }
    });
    return () => sub.remove();
  }, []);

  // --- ΑΝΑΝΕΩΣΗ ACCESS TOKEN ΜΕ REFRESH TOKEN ---
  // Το access token του Solid Pod λήγει μετά από κάποιο διάστημα (φυσιολογικό για OAuth/OIDC).
  // Χωρίς ανανέωση, μια απλή παρατεταμένη χρήση (π.χ. γιατρός που δουλεύει μισή ώρα με ανοιχτή
  // την εφαρμογή) θα οδηγούσε σε 401 από το Pod - που η εφαρμογή, αν δεν διακρίνει σωστά,
  // μπορεί να το μπερδέψει με 403 (πραγματική κατάργηση πρόσβασης από τον ασθενή). Με ενεργή
  // ανανέωση, ο χρήστης δεν χρειάζεται καν να το καταλάβει.
  const refreshTokenRef = useRef('');
  // Το token endpoint της δεύτερης σύνδεσης (αλλαγή Pod με μεταφορά). Όταν είναι κενό, ισχύει το
  // discoveryDocument της κανονικής σύνδεσης.
  const tokenEndpointOverrideRef = useRef('');
  // Το πιο πρόσφατο access token, διαθέσιμο αμέσως μετά από ανανέωση (το state ενημερώνεται αργότερα).
  const latestAccessTokenRef = useRef('');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshing = useRef(false);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  // true όταν το τρέχον access token έχει λήξει ή λήγει πολύ σύντομα.
  const isAccessTokenStale = (): boolean => {
    if (!accessToken) return false;
    try {
      const exp = decodeJwtPayload(accessToken).exp;
      if (!exp) return false;
      return exp * 1000 - Date.now() <= TOKEN_REFRESH_MARGIN_MS;
    } catch {
      return false;
    }
  };

  // Πραγματική ανταλλαγή του refresh token για νέο access token. Το isRefreshing αποτρέπει δύο
  // ταυτόχρονες ανανεώσεις (π.χ. από το AppState listener ΚΑΙ το χρονόμετρο σχεδόν ταυτόχρονα) -
  // πολλοί servers άκυρώνουν το παλιό refresh token μόλις εκδοθεί καινούργιο, οπότε μια δεύτερη,
  // παράλληλη χρήση του ίδιου (ήδη "καμένου") refresh token θα απέτυχε άδικα.
  const performTokenRefresh = async (): Promise<boolean> => {
    if (isRefreshing.current) return true;
    if (!refreshTokenRef.current || !(tokenEndpointOverrideRef.current || discoveryDocument?.tokenEndpoint) || !storedClientId.current) return false;

    isRefreshing.current = true;
    try {
      const tokenEndpoint = tokenEndpointOverrideRef.current || discoveryDocument.tokenEndpoint;
      const dpopForRefresh = await createDpopToken('POST', tokenEndpoint);

      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'DPoP': dpopForRefresh,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: storedClientId.current,
          refresh_token: refreshTokenRef.current,
        }).toString(),
      });

      if (!tokenResponse.ok) return false;

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) return false;

      // Πολλοί servers εκδίδουν ΚΑΙ νέο refresh token σε κάθε ανανέωση, ακυρώνοντας το παλιό -
      // αν δεν το κρατήσουμε, η επόμενη ανανέωση θα απέτυχε παρόλο που ο χρήστης δεν έκανε τίποτα.
      if (tokenData.refresh_token) refreshTokenRef.current = tokenData.refresh_token;
      latestAccessTokenRef.current = tokenData.access_token;
      setAccessToken(tokenData.access_token);
      return true;
    } catch (error) {
      // Συνήθως πρόβλημα δικτύου τη στιγμή της ανανέωσης - δεν ενοχλούμε τον χρήστη εδώ, θα
      // ξαναδοκιμάσει στην επόμενη ευκαιρία (επόμενο timer, ή επιστροφή από παρασκήνιο). Αν
      // τελικά λήξει πραγματικά το token, το επόμενο αίτημα προς το Pod θα το δείξει καθαρά.
      console.error("Αποτυχία ανανέωσης access token:", error);
      return false;
    } finally {
      isRefreshing.current = false;
    }
  };

  const refreshIfNeeded = () => {
    if (isAccessTokenStale()) performTokenRefresh();
  };

  // Προγραμματίζει την επόμενη ανανέωση λίγο πριν τη λήξη του δοσμένου token. Καλείται ξανά
  // αυτόματα από το useEffect του accessToken μόλις αλλάξει - είτε γιατί μόλις συνδεθήκαμε είτε
  // γιατί μόλις ανανεώθηκε - οπότε ο μηχανισμός συνεχίζει μόνος του όσο διαρκεί η συνεδρία.
  const scheduleTokenRefresh = (token: string) => {
    clearRefreshTimer();
    let exp: number | undefined;
    try {
      exp = decodeJwtPayload(token).exp;
    } catch {
      return;
    }
    if (!exp) return;

    const delay = Math.max(0, exp * 1000 - Date.now() - TOKEN_REFRESH_MARGIN_MS);
    refreshTimerRef.current = setTimeout(performTokenRefresh, delay);
  };

  useEffect(() => {
    if (!accessToken) {
      clearRefreshTimer();
      return;
    }
    scheduleTokenRefresh(accessToken);
    return clearRefreshTimer;
  }, [accessToken]);

  // Με γέφυρα (ή στο Android, που περνάει πάντα από το incognito WebView - βλ. πιο κάτω), η
  // επιστροφή δεν έχει το σχήμα που περιμένει ο SDK για να την αναγνωρίσει από μόνος του,
  // οπότε τη διαβάζουμε μόνοι μας. Το σχήμα του αντικειμένου μένει ίδιο, ώστε η συνέχεια της
  // ροής - η ανταλλαγή του κωδικού με token - να μην ξέρει καν ποιος δρόμος ακολουθήθηκε.
  const [bridgeResponse, setBridgeResponse] = useState<any>(null);
  const response = (AUTH_BRIDGE_URL || Platform.OS === 'android') ? bridgeResponse : sdkResponse;

  const handlePatientLoginVerification = async (webId: string): Promise<boolean> => {
    try {
      // Ελέγχουμε αν το webId ανήκει σε γιατρό με ΔΙΑΦΟΡΕΤΙΚΟ ΑΜΚΑ (cached browser session από
      // άλλο πρόσωπο) - το ίδιο ΑΜΚΑ επιτρέπεται να χρησιμοποιεί το ίδιο Pod και ως ασθενής
      // και ως γιατρός (π.χ. για δοκιμές), οπότε δεν το μπλοκάρουμε.
      const { data: doctorCheck } = await supabase
        .from('doctors')
        .select('amka')
        .eq('web_id', webId)
        .maybeSingle();

      if (doctorCheck && doctorCheck.amka !== loggedInPatientAmka) {
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
      // Ελέγχουμε αν το webId ανήκει σε ασθενή με ΔΙΑΦΟΡΕΤΙΚΟ ΑΜΚΑ (cached browser session από
      // άλλο πρόσωπο) - το ίδιο ΑΜΚΑ επιτρέπεται να χρησιμοποιεί το ίδιο Pod και ως ασθενής
      // και ως γιατρός (π.χ. για δοκιμές), οπότε δεν το μπλοκάρουμε.
      const { data: patientCheck } = await supabase
        .from('patients')
        .select('amka')
        .eq('web_id', webId)
        .maybeSingle();

      if (patientCheck && patientCheck.amka !== loggedInDoctorAmka) {
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
          latestAccessTokenRef.current = tokenData.access_token;
          setAccessToken(tokenData.access_token);
          // Χωρίς αυτό δεν θα υπήρχε τρόπος να ανανεωθεί το access token αργότερα - ο χρήστης
          // θα έβλεπε σφάλμα λήξης σύνδεσης μετά από κάθε παρατεταμένη χρήση.
          if (tokenData.refresh_token) refreshTokenRef.current = tokenData.refresh_token;

          const tokenPayload = decodeJwtPayload(tokenData.access_token);
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

  /**
   * Δεύτερη σύνδεση σε άλλο Pod, ΧΩΡΙΣ να αγγίξει την τρέχουσα συνεδρία: δεν γράφει τίποτα στο
   * state της σύνδεσης (token, ρόλος, φάκελος). Επιστρέφει τα στοιχεία του νέου Pod, ή null αν ο
   * χρήστης έκλεισε το παράθυρο. Ίδια βήματα με την κανονική σύνδεση: εγγραφή στον πάροχο,
   * σελίδα σύνδεσης σε ιδιωτικό παράθυρο, ανταλλαγή κωδικού με token (PKCE + DPoP).
   */
  const linkSecondPod = async (providerUrl: string): Promise<{ webId: string; accessToken: string; refreshToken: string; clientId: string; discovery: any } | null> => {
    const discoveryRes = await fetch(`${providerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`);
    if (!discoveryRes.ok) throw new Error(`Ο server απάντησε με κωδικό ${discoveryRes.status}.`);
    const discovery = await discoveryRes.json();

    const registrationRes = await fetch(discovery.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: APP_NAME,
        redirect_uris: [redirectUri],
        application_type: 'native',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    if (!registrationRes.ok) throw new Error(`Αποτυχία εγγραφής (DCR). Status: ${registrationRes.status}`);
    const { client_id: clientId } = await registrationRes.json();
    if (!clientId) throw new Error('Ο Provider δεν υποστηρίζει Dynamic Registration.');

    const authRequest = new AuthSession.AuthRequest({
      clientId,
      scopes: ['openid', 'profile', 'offline_access', 'webid'],
      redirectUri,
      extraParams: { prompt: 'login', max_age: '0' },
    });
    const authUrl = await authRequest.makeAuthUrlAsync({ authorizationEndpoint: discovery.authorization_endpoint });

    let returnUrl: string | null;
    if (Platform.OS === 'android') {
      returnUrl = await new Promise<string | null>((resolve) => {
        webViewReturnResolver.current = resolve;
        setWebViewAuthUrl(authUrl);
      });
      setWebViewAuthUrl(null);
    } else {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUri, { preferEphemeralSession: true });
      returnUrl = result.type === 'success' ? result.url : null;
    }
    if (!returnUrl) return null;

    const params: Record<string, string> = {};
    new URLSearchParams(returnUrl.split('?')[1] || '').forEach((value, key) => { params[key] = value; });
    if (params.state !== authRequest.state) throw new Error('Η απάντηση της σύνδεσης δεν αντιστοιχεί στο αίτημα.');
    if (!params.code) return null;

    const dpop = await createDpopToken('POST', discovery.token_endpoint);
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'DPoP': dpop },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: authRequest.codeVerifier || '',
      }).toString(),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error('Αποτυχία λήψης token από το νέο Pod.');

    const payload = decodeJwtPayload(tokenData.access_token);
    return {
      webId: payload.webid || payload.sub || '',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      clientId,
      discovery,
    };
  };

  const runDynamicLogin = async (providerUrl: string) => {
    if (isDcrRunning.current) return;
    isDcrRunning.current = true;
    try {
      setLoading(true);
      // Καθαρίζουμε το παλιό discovery ώστε το useAuthRequest να μηδενίσει το response
      setDiscoveryDocument(null);
      tokenEndpointOverrideRef.current = '';
      setBridgeResponse(null);

      const discoveryUrl = `${providerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const discoveryRes = await fetch(discoveryUrl);

      if (!discoveryRes.ok) {
        throw new Error(`Ο server απάντησε με κωδικό ${discoveryRes.status}. Βεβαιώσου ότι το URL του Provider είναι σωστό.`);
      }

      const discovery = await discoveryRes.json();

      // Δεν τερματίζουμε την παλιά συνεδρία στον πάροχο πριν το νέο login: η σύνδεση γίνεται
      // πάντα σε ιδιωτικό (incognito) παράθυρο χωρίς cookies από προηγούμενο χρήστη, οπότε δεν
      // υπάρχει τίποτα να καθαρίσει. Το βήμα άνοιγε επιπλέον μια σελίδα του παρόχου πριν τη φόρμα
      // σύνδεσης και, με id_token άλλου παρόχου, έδειχνε σελίδα σφάλματος.

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
          application_type: 'native',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });

      if (!registrationRes.ok) {
        // Ο πάροχος εξηγεί συνήθως στο σώμα της απάντησης τι απέρριψε - μένει στο log για διάγνωση.
        const registrationBody = await registrationRes.text().catch(() => '');
        console.error('Απάντηση παρόχου στο DCR:', registrationBody.substring(0, 300));
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
    clearNewNotificationMarks();
    latestAccessTokenRef.current = '';
    setIsLoggedIn(false);
    // Έμεινε αναμμένο από την επιτυχή σύνδεση (βλ. σχόλιο στο getRealAccessToken) ώστε να
    // μην ξαναφανεί η φόρμα σύνδεσης λίγο πριν μπούμε στην εφαρμογή. Σβήνει τώρα, γιατί
    // τώρα πραγματικά γυρνάμε στη φόρμα.
    setLoading(false);
    setRole(null);
    setAccessToken('');
    refreshTokenRef.current = '';
    tokenEndpointOverrideRef.current = '';
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

  // Αλλαγή Pod χωρίς να φύγει ο χρήστης πρώτα από το παλιό:
  //   1. συνδέεται στο νέο Pod (δεύτερη σύνδεση πάνω από την τρέχουσα)
  //   2. ελέγχεται ότι το νέο Pod δεν ανήκει σε άλλον
  //   3. (μόνο ασθενής, αν το ζήτησε) αντιγράφονται οι εγγραφές που λείπουν από το νέο Pod
  //   4. ΜΟΝΟ τότε αλλάζει η αντιστοίχιση του ΑΜΚΑ και η συνεδρία περνά στο νέο Pod
  // Αν οτιδήποτε αποτύχει πριν το 4, ο χρήστης μένει συνδεδεμένος στο παλιό Pod και δεν αλλάζει τίποτα.
  const switchPodWithHistory = async (providerUrl: string, copyHistory: boolean) => {
    if ((role !== 'patient' && role !== 'doctor') || isSwitchingPod) return;
    const isPatient = role === 'patient';
    const ownAmka = isPatient ? loggedInPatientAmka : loggedInDoctorAmka;
    // Η επιστροφή από τον browser ανοίγει την οθόνη auth-redirect (βλ. app/auth-redirect.tsx). Αν η
    // αλλαγή δεν ολοκληρωθεί, γυρνάμε στην οθόνη από την οποία ξεκίνησε ο χρήστης.
    const startPath = currentPath;
    let switched = false;
    setIsSwitchingPod(true);
    try {
      const linked = await linkSecondPod(providerUrl);
      if (!linked) return;

      if (!isSupportedWebId(linked.webId)) {
        showMessage('Ο λογαριασμός αυτού του παρόχου δεν έχει τη δομή Pod που υποστηρίζει η εφαρμογή. Δοκιμάστε κάποιον από τους υπόλοιπους παρόχους της λίστας.');
        return;
      }

      const currentPayload = decodeJwtPayload(accessToken);
      const oldWebId = isPatient ? getOwnerWebId(activePatientFolderUrl) : (currentPayload.webid || currentPayload.sub || '');
      if (linked.webId === oldWebId) {
        showMessage('Αυτό είναι το Pod στο οποίο είστε ήδη συνδεδεμένοι.');
        return;
      }

      // Ένα Pod ανήκει σε ένα πρόσωπο: ούτε άλλος ασθενής ούτε γιατρός με διαφορετικό ΑΜΚΑ.
      const { data: takenByPatient } = await supabase.from('patients').select('amka').eq('web_id', linked.webId).maybeSingle();
      const { data: takenByDoctor } = await supabase.from('doctors').select('amka').eq('web_id', linked.webId).maybeSingle();
      if ((takenByPatient && takenByPatient.amka !== ownAmka) || (takenByDoctor && takenByDoctor.amka !== ownAmka)) {
        showMessage('Αυτό το Pod χρησιμοποιείται ήδη από άλλον χρήστη. Συνδεθείτε με δικό σας Pod.');
        return;
      }

      let successMessage = 'Το Pod άλλαξε. Είστε πλέον συνδεδεμένοι στο νέο σας Pod.';

      if (isPatient && copyHistory) {
        // Το token του παλιού Pod μπορεί να έχει μείνει κοντά στη λήξη όσο ο ασθενής έκανε τη σύνδεση.
        let oldToken = accessToken;
        if (expiresWithin(oldToken, MIGRATION_MIN_TOKEN_LIFETIME_MS) && (await performTokenRefresh())) {
          oldToken = latestAccessTokenRef.current;
        }

        const migration = await copyHistoryBetweenPods(oldWebId, oldToken, linked.webId, linked.accessToken);
        const alreadyThere = migration.alreadyThere > 0
          ? ` Άλλες ${migration.alreadyThere} υπήρχαν ήδη στο νέο Pod και έμειναν όπως ήταν.`
          : '';

        if (migration.failed > 0) {
          const proceed = await askConfirm({
            message: `Μεταφέρθηκαν ${migration.copied} εγγραφές, αλλά ${migration.failed} δεν μεταφέρθηκαν.${alreadyThere}\n\nΤο παλιό Pod δεν έχει αλλάξει. Θέλετε να αλλάξετε Pod παρόλα αυτά;`,
            confirmText: 'Ναι',
            cancelText: 'Όχι',
          });
          if (!proceed) return;
        } else {
          successMessage = `Το ιατρικό σας ιστορικό μεταφέρθηκε στο νέο Pod (${migration.copied} εγγραφές).${alreadyThere} Είστε πλέον συνδεδεμένοι στο νέο σας Pod.`;
        }
      }

      // Το νέο Pod γίνεται το Pod του ΑΜΚΑ - το τελευταίο στο οποίο συνδέθηκε. Το νέο Pod ξεκινά
      // με άδειο ACL, οπότε οι προσβάσεις ξαναγράφονται μόνες τους.
      const { error } = isPatient
        ? await supabase.from('patients').update({ web_id: linked.webId }).eq('amka', ownAmka)
        : await supabase.from('doctors').update({ web_id: linked.webId }).eq('amka', ownAmka);
      if (error) {
        showMessage('Δεν ήταν δυνατή η αλλαγή του Pod. Το παλιό Pod παραμένει ενεργό.');
        return;
      }
      if (isPatient) {
        await resetAclSyncForPatient(ownAmka);
      } else {
        await resetAclSyncForDoctor(ownAmka);
      }

      // Η συνεδρία περνά στο νέο Pod χωρίς νέα σύνδεση: τα στοιχεία του νέου Pod (token, refresh
      // token, πάροχος) αντικαθιστούν τα παλιά, και μόνο στη μνήμη όπως πάντα. Τα παλιά
      // δεδομένα καθαρίζονται, ώστε καμία οθόνη να μη δείξει εγγραφές του παλιού Pod.
      clearRecordCache();
      clearPodPrefetch();
      clearDoctorCache();
      storedClientId.current = linked.clientId;
      // Ούτε το dynamicClientId ούτε το discoveryDocument αλλάζουν εδώ: κάθε αλλαγή τους
      // ξαναχτίζει το αίτημα σύνδεσης και θα άνοιγε ξανά τον browser.
      tokenEndpointOverrideRef.current = linked.discovery.token_endpoint;
      refreshTokenRef.current = linked.refreshToken;
      latestAccessTokenRef.current = linked.accessToken;
      if (isPatient) setActivePatientFolderUrl(linked.webId.replace('profile/card#me', 'public/'));
      setAccessToken(linked.accessToken);

      switched = true;
      showMessage(successMessage);
      if (isPatient) {
        router.replace(ROUTES.PATIENT_HOME);
        prefetchAllCategories(linked.webId, linked.accessToken).catch(() => {});
      } else {
        router.replace(ROUTES.DOCTOR_HOME);
      }
    } catch (error) {
      console.error('Αποτυχία αλλαγής Pod:', error);
      showMessage('Δεν ήταν δυνατή η αλλαγή Pod. Το παλιό Pod παραμένει ενεργό και δεν άλλαξε τίποτα.');
    } finally {
      setIsSwitchingPod(false);
      if (!switched) router.replace(startPath as any);
    }
  };

  const confirmSwitchPod = async () => {
    const consequence = role === 'patient'
      ? 'Οι καταχωρήσεις που έχετε σήμερα μένουν στο παλιό Pod και δεν μεταφέρονται στο νέο. Οι γιατροί που σας έχουν πρόσβαση θα την ξαναποκτήσουν μόλις συνδεθείτε στο νέο.'
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
        isSwitchingPod,
        switchPodWithHistory,
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
          το ίδιο το WebView να "φορτώσει" το com.anonymous.medicalapp:// (θα απέτυχε, δεν είναι σελίδα). */}
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
