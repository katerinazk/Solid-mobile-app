// Η διάρκεια μιας αγωγής γράφεται σε μήνες και μέρες, όπως τη λέει ο γιατρός ("δύο μήνες",
// "δέκα μέρες", "ένας μήνας και πέντε μέρες"). Οι δύο τιμές κρατιούνται χωριστά στο Pod και
// δεν μετατρέπονται σε σύνολο ημερών: ο μήνας δεν έχει σταθερό μήκος, και ο ασθενής πρέπει να
// βλέπει ακριβώς αυτό που του συνταγογραφήθηκε.

export function formatDuration(days?: number, months?: number): string {
  const parts: string[] = [];

  if (months) parts.push(months === 1 ? '1 μήνας' : `${months} μήνες`);
  if (days) parts.push(days === 1 ? '1 μέρα' : `${days} μέρες`);

  return parts.length > 0 ? parts.join(' και ') : '—';
}

// Πότε τελειώνει η αγωγή. Οι μήνες προστίθενται ως ημερολογιακοί, όχι ως 30 μέρες: αγωγή
// ενός μήνα που ξεκινά 31 Ιανουαρίου λήγει στα τέλη Φεβρουαρίου, όχι στις 2 Μαρτίου.
export function medicationEndDate(startDate: string, days?: number, months?: number): Date {
  const endDate = new Date(startDate);
  if (months) endDate.setMonth(endDate.getMonth() + months);
  if (days) endDate.setDate(endDate.getDate() + days);
  return endDate;
}
