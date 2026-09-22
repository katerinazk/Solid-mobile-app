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
import { prefetchAllCategories } from '../utils/podPrefetch';
import { clearPodPrefetch } from '../utils/podPrefetchStore';
import { clearDoctorCache } from '../utils/doctorCache';
import { isSupportedWebId } from '../services/solidPod';
import { askConfirm, showMessage } from '../utils/appMessage';

type Role = 'doctor' | 'patient';

const SOLID_PROVIDER_URL = 'https://datapod.igrant.io';

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

  const appRedirectUri = AuthSession.makeRedirectUri({ scheme: 'solidmedicalapp' });

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
      extraParams: { prompt: 'login' }, // Αναγκάζει τον Solid server να ζητά credentials κάθε φορά
    },
    discoveryDocument
  );

  const isBrowserOpen = useRef(false);
  const expectingResponse = useRef(false);

  // Με γέφυρα, η επιστροφή δεν έχει το σχήμα που περιμένει ο SDK για να την αναγνωρίσει,
  // οπότε τη διαβάζουμε μόνοι μας. Το σχήμα του αντικειμένου μένει ίδιο, ώστε η συνέχεια
  // της ροής - η ανταλλαγή του κωδικού με token - να μην ξέρει καν ποιος δρόμος ακολουθήθηκε.
  const [bridgeResponse, setBridgeResponse] = useState<any>(null);
  const response = AUTH_BRIDGE_URL ? bridgeResponse : sdkResponse;

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
      // Αγνοούμε ό,τι response δεν περιμένουμε (π.χ. stale από προηγούμενο login).
      if (!response || !expectingResponse.current) return;

      // Ο χρήστης δεν ολοκλήρωσε τη σύνδεση: έκλεισε τον browser, ακύρωσε τη συγκατάθεση, ή ο
      // πάροχος απάντησε με σφάλμα. Η οθόνη φόρτωσης σβήνει και ξαναδείχνει τη φόρμα - χωρίς
      // μήνυμα στην ακύρωση, που δεν είναι λάθος του χρήστη, μόνο στο πραγματικό σφάλμα.
      if (response.type !== 'success' || !response.params?.code) {
        expectingResponse.current = false;
        setLoading(false);
        if (response.type === 'error') {
          showMessage('Η σύνδεση με το Pod απέτυχε ή απορρίφθηκε. Δοκιμάστε ξανά.');
        }
        return;
      }

      expectingResponse.current = false;
      const authCode = response.params.code;
      console.log("1. Πήραμε το Εισιτήριο (Auth Code):", authCode);

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
        console.log("Token Response:", JSON.stringify(tokenData));

        if (tokenData.access_token) {
          setAccessToken(tokenData.access_token);
          if (tokenData.id_token) setIdToken(tokenData.id_token);

          const tokenParts = tokenData.access_token.split('.');
          const tokenPayload = JSON.parse(atob(tokenParts[1]));
          const webId = tokenPayload.webid || tokenPayload.sub || '';
          console.log("🔑 WebID από token:", webId);

          // Ο πάροχος απάντησε κανονικά, αλλά το Pod του έχει άλλη δομή από αυτή που ξέρει
          // η εφαρμογή. Χωρίς αυτόν τον έλεγχο η σύνδεση θα πετύχαινε και το ιστορικό θα
          // φαινόταν απλώς άδειο - το χειρότερο είδος σφάλματος σε ιατρικό φάκελο.
          if (!isSupportedWebId(webId)) {
            showMessage(
              'Ο λογαριασμός αυτού του παρόχου δεν έχει τη δομή Pod που υποστηρίζει η εφαρμογή. ' +
              'Δοκιμάστε κάποιον από τους υπόλοιπους παρόχους της λίστας.'
            );
            setLoading(false);
            return;
          }

          if (role === 'patient') {
            const verified = await handlePatientLoginVerification(webId);
            if (verified) {
              setIsLoggedIn(true);
              setLoading(false);
              router.replace(ROUTES.PATIENT_HOME);

              // Κατεβάζουμε όλο το ιστορικό στο παρασκήνιο, ώστε οι κατηγορίες να
              // ανοίγουν ακαριαία. Δεν το περιμένουμε: αν αποτύχει, οι οθόνες
              // ρωτούν το Pod κανονικά όπως πριν.
              prefetchAllCategories(webId, tokenData.access_token).catch(() => {});
            } else {
              // Ο έλεγχος απέτυχε - handlePatientLoginVerification έδειξε ήδη το γιατί.
              setLoading(false);
            }
          } else if (role === 'doctor') {
            const verified = await handleDoctorLoginVerification(webId);
            if (verified) {
              setIsLoggedIn(true);
              setLoading(false);
              router.replace(ROUTES.DOCTOR_HOME);
            } else {
              setLoading(false);
            }
          } else {
            // Δεν θα έπρεπε ποτέ να συμβεί - ο ρόλος ορίζεται πριν καν ξεκινήσει η σύνδεση.
            // Ασφαλιστική δικλείδα, ώστε η οθόνη να μη μείνει κολλημένη σε "Σύνδεση με το Pod".
            setLoading(false);
          }
        } else {
          showMessage("Αποτυχία λήψης token: " + JSON.stringify(tokenData));
          setLoading(false);
        }

      } catch (error) {
        console.error("Σφάλμα κατά την ανταλλαγή του token:", error);
        showMessage("Αποτυχία λήψης Access Token!");
        setLoading(false);
      }
    };

    getRealAccessToken();
  }, [response]);

  /**
   * Ανοίγει τη σελίδα σύνδεσης του Pod και περιμένει την επιστροφή.
   *
   * Χωρίς γέφυρα το αναλαμβάνει όλο ο SDK. Με γέφυρα πρέπει να τα χωρίσουμε: στον provider
   * φεύγει η https διεύθυνση (αυτή που διαβάζει ο χρήστης), ενώ πίσω στην εφαρμογή γυρνάει
   * το σχήμα της - και ο SDK αναγνωρίζει την επιστροφή μόνο αν οι δύο ταυτίζονται.
   *
   * preferEphemeralSession: στο iOS αποτρέπει τη διατήρηση cookies/session ανάμεσα σε
   * διαδοχικά logins, ώστε να μη "θυμάται" τον προηγούμενο χρήστη.
   */
  const openLoginBrowser = async () => {
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

    const query = result.url.split('?')[1] || '';
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
        console.log("Πήραμε δυναμικό Client ID:", clientData.client_id);
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
      showMessage(error.message || "Αποτυχία επικοινωνίας με τον Provider.");
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
