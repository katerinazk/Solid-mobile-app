import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { HISTORY_CATEGORIES } from '../services/solidPod';
import { fetchCategoryRecords, HistoryRecordSummary } from '../services/historyRecords';
import { formatDate } from './age';
import { showMessage } from './appMessage';
import { friendlyErrorMessage } from './networkError';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderCategorySection(category: string, records: HistoryRecordSummary[]): string {
  if (records.length === 0) return '';

  const rows = records.map((record) => {
    const heading = [record.title, record.parentName].filter(Boolean).map(String).map(escapeHtml).join(' - ');
    const meta = [
      record.date ? formatDate(record.date) : null,
      record.doctorName ? `Ιατρός: ${escapeHtml(record.doctorName)}` : null,
      record.retraction ? 'ΑΝΑΚΛΗΘΗΚΕ' : null,
    ].filter(Boolean).join(' &middot; ');
    return `<li><strong>${heading}</strong><br/><span class="meta">${meta}</span></li>`;
  }).join('');

  return `<h2>${escapeHtml(category)}</h2><ul>${rows}</ul>`;
}

/**
 * Φτιάχνει ένα PDF με περίληψη όλου του ιστορικού του ασθενή και ανοίγει το system share
 * sheet για αποστολή/εκτύπωση - χρήσιμο π.χ. σε επίσκεψη χωρίς σύνδεση στο Pod τη στιγμή αυτή.
 *
 * Το ιατρικό περιεχόμενο δεν μένει στη συσκευή πέρα από τη στιγμή της κοινοποίησης: το
 * προσωρινό αρχείο γράφεται στην cache μόνο όσο χρειάζεται το ίδιο το λειτουργικό σύστημα για
 * να το παραδώσει στην εφαρμογή/εκτυπωτή που θα διαλέξει ο χρήστης, και διαγράφεται αμέσως μετά.
 */
export async function exportPatientHistoryPdf(webId: string, accessToken: string, patientName: string): Promise<void> {
  let fileUri: string | null = null;

  try {
    const perCategory = await Promise.all(
      HISTORY_CATEGORIES.map((category) => fetchCategoryRecords(webId, category, accessToken))
    );

    const hasAnyRecord = perCategory.some((records) => records.length > 0);
    const sections = HISTORY_CATEGORIES
      .map((category, i) => renderCategorySection(category, perCategory[i]))
      .join('');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Roboto, sans-serif; padding: 24px; color: #222; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .generated { color: #666; font-size: 12px; margin-bottom: 24px; }
            h2 { font-size: 16px; color: #304674; border-bottom: 1px solid #c6d3e3; padding-bottom: 4px; margin-top: 24px; }
            ul { list-style: none; padding: 0; margin: 8px 0; }
            li { padding: 8px 0; border-bottom: 1px solid #eee; }
            .meta { color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Ατομικό Αναμνηστικό - ${escapeHtml(patientName)}</h1>
          <div class="generated">Δημιουργήθηκε στις ${formatDate(new Date().toISOString())}</div>
          ${hasAnyRecord ? sections : '<p>Δεν υπάρχουν καταχωρημένες εγγραφές.</p>'}
        </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html });
    fileUri = uri;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      showMessage('Η κοινοποίηση αρχείων δεν υποστηρίζεται σε αυτή τη συσκευή.');
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Εξαγωγή Ατομικού Αναμνηστικού',
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    showMessage(friendlyErrorMessage(error, 'Αποτυχία εξαγωγής ιστορικού.'));
  } finally {
    if (fileUri) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    }
  }
}
