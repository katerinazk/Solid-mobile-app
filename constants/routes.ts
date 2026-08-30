// Κεντρικές σταθερές για όλα τα routes της εφαρμογής.
// Χρησιμοποίησέ τες σε κάθε router.push/replace αντί για strings,
// ώστε μια μελλοντική μετονομασία αρχείου να χρειάζεται αλλαγή σε ΕΝΑ σημείο.
export const ROUTES = {
  LOGIN: '/login',
  PATIENT_LOGIN: '/patient/patient_login',
  PATIENT_REGISTER: '/patient/patient_register',
  PATIENT_ACCESS: '/patient/screens/patient_access',
  DOCTOR_LOGIN: '/doctor/doctor_login',
  DOCTOR_HOME: '/doctor/screens/doctor_home',
  DOCTOR_ACCESS: '/doctor/screens/doctor_access',
  DOCTOR_SETTINGS: '/doctor/screens/doctor_settings',
  DOCTOR_MED_HISTORY: '/doctor/patient_screens/med_history',
  DOCTOR_DIAGNOSEIS: '/doctor/patient_screens/doctor_diagnoseis',
  DOCTOR_VACCINATIONS: '/doctor/patient_screens/doctor_vaccinations',
  DOCTOR_ALLERGIES: '/doctor/patient_screens/doctor_allergies',
  DOCTOR_HOSPITALIZATIONS: '/doctor/patient_screens/doctor_hospitalizations',
  DOCTOR_MEDICATIONS: '/doctor/patient_screens/doctor_medications',
  DOCTOR_EXAMS: '/doctor/patient_screens/doctor_exams',
} as const;
