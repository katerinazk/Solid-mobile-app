import { ACCESS_NONE } from '../constants/accessTypes';
import { patientSubject } from './notifications';

/**
 * Γιατί ο γιατρός δεν έχει (ακόμα) πρόσβαση στον φάκελο ενός ασθενή, σε μορφή μηνύματος. Επιστρέφει
 * null όταν η πρόσβαση ισχύει κανονικά.
 *
 * Όταν η καταχώρηση υπάρχει με τύπο πρόσβασης αλλά δεν είναι συγχρονισμένη (acl_synced = false),
 * ο ασθενής δεν έχει καταργήσει τίποτα: αλλάζει (ή άλλαξε) Pod και η πρόσβαση ξαναγράφεται στο νέο Pod μόλις
 * μπει στην εφαρμογή. Το μήνυμα "κατάργησε την πρόσβασή σας" εκεί δεν θα ήταν αλήθεια.
 */
export async function accessUnavailableMessage(
  entry: { access_type: string; acl_synced: boolean } | null,
  patientAmka: string
): Promise<string | null> {
  if (!entry || entry.access_type === ACCESS_NONE) {
    return 'Ο ασθενής κατάργησε την πρόσβασή σας στον φάκελό του.';
  }
  if (!entry.acl_synced) {
    return `${await patientSubject(patientAmka)} αλλάζει Pod αυτή τη στιγμή. Δοκιμάστε ξανά αργότερα.`;
  }
  return null;
}
