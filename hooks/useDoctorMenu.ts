import { useContext } from 'react';
import { DoctorMenuContext } from '../components/doctor/DoctorMenu';

export function useDoctorMenu() {
  const ctx = useContext(DoctorMenuContext);
  if (!ctx) throw new Error('useDoctorMenu must be used within a DoctorMenuProvider');
  return ctx;
}
