import { useContext } from 'react';
import { PatientMenuContext } from '../components/patient/PatientMenu';

export function usePatientMenu() {
  const ctx = useContext(PatientMenuContext);
  if (!ctx) throw new Error('usePatientMenu must be used within a PatientMenuProvider');
  return ctx;
}
