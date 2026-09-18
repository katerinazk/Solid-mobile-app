// Κεντρικό σημείο για τα παράθυρα διαλόγου της εφαρμογής.
//
// Αντικαθιστά το alert() και το Alert.alert() του συστήματος, που εμφάνιζαν λευκό κουτί με
// τίτλο "Alert" και δεν ακολουθούσαν καθόλου την εμφάνιση της εφαρμογής. Εδώ κρατάμε μόνο τον
// δίαυλο: ποιος θα δείξει τον διάλογο το ορίζει ο AppMessageHost, που ζει μία φορά στη ρίζα.
//
// Είναι σκόπιμα απλές συναρτήσεις και όχι hooks, ώστε να καλούνται και από σημεία που δεν
// είναι συστατικά React, όπως το AuthContext και οι υπηρεσίες.

export interface ConfirmOptions {
  message: string;
  /** Το κείμενο του κουμπιού που προχωράει. Προεπιλογή "Ναι". */
  confirmText?: string;
  /** Το κείμενο του κουμπιού που ακυρώνει. Προεπιλογή "Όχι". */
  cancelText?: string;
}

export interface TextPromptOptions {
  message: string;
  /** Το κείμενο μέσα στο άδειο πεδίο. */
  placeholder?: string;
  /** Το κείμενο του κουμπιού που προχωράει. Προεπιλογή "Καταχώρηση". */
  confirmText?: string;
  /** Το κείμενο του κουμπιού που ακυρώνει. Προεπιλογή "Ακύρωση". */
  cancelText?: string;
}

export type Dialog =
  | { kind: 'message'; message: string }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (confirmed: boolean) => void }
  | { kind: 'prompt'; options: TextPromptOptions; resolve: (text: string | null) => void };

type DialogHandler = (dialog: Dialog) => void;

let handler: DialogHandler | null = null;

export function setDialogHandler(fn: DialogHandler | null) {
  handler = fn;
}

/** Δείχνει ένα ενημερωτικό μήνυμα με ένα μόνο κουμπί. */
export function showMessage(message: string) {
  if (handler) {
    handler({ kind: 'message', message });
    return;
  }
  // Πριν προλάβει να συνδεθεί η ρίζα, δεν χάνουμε το μήνυμα - πάει στην κονσόλα.
  console.warn('Μήνυμα χωρίς παράθυρο:', message);
}

/**
 * Ρωτάει τον χρήστη και περιμένει την απάντηση.
 *
 * Επιστρέφει Promise ώστε η ροή που ρωτάει να μπορεί να συνεχίσει από εκεί που σταμάτησε,
 * αντί να σπάει σε συνάρτηση επιστροφής. Χωρίς παράθυρο θεωρούμε άρνηση: καμία ενέργεια δεν
 * εκτελείται χωρίς ρητή συγκατάθεση.
 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (!handler) {
    console.warn('Ερώτηση χωρίς παράθυρο:', options.message);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => handler!({ kind: 'confirm', options, resolve }));
}

/**
 * Ζητάει ένα σύντομο κείμενο και περιμένει την απάντηση. Επιστρέφει null όταν ο χρήστης
 * ακυρώσει - ώστε το "δεν απάντησε" να ξεχωρίζει από το "απάντησε κενό".
 */
export function askText(options: TextPromptOptions): Promise<string | null> {
  if (!handler) {
    console.warn('Ερώτηση χωρίς παράθυρο:', options.message);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => handler!({ kind: 'prompt', options, resolve }));
}
