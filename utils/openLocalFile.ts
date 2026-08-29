import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};

function guessMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[extension] || 'application/octet-stream';
}

// Ανοίγει ένα τοπικό αρχείο για προβολή (π.χ. PDF viewer, εικόνα) αντί να εμφανίζει
// το φύλλο "Κοινή χρήση" (Share sheet). Στο Android αυτό γίνεται με ACTION_VIEW intent
// πάνω σε ένα content:// URI (μέσω FileProvider) - στα υπόλοιπα platforms δεν υπάρχει
// αντίστοιχο native API, οπότε πέφτουμε πίσω στο Sharing (που τουλάχιστον προσφέρει "Open in...").
export async function openLocalFile(localUri: string, fileName: string): Promise<void> {
  const mimeType = guessMimeType(fileName);

  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(localUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: mimeType,
    });
    return;
  }

  await Sharing.shareAsync(localUri, { mimeType });
}
