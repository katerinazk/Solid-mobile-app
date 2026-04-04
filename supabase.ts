import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// ΒΑΛΕ ΤΑ ΔΙΚΑ ΣΟΥ ΚΛΕΙΔΙΑ ΕΔΩ ΜΕΣΑ ΣΤΑ ΑΥΤΑΚΙΑ
const supabaseUrl = 'https://xlmpzemrubhmevcnyluv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsbXB6ZW1ydWJobWV2Y255bHV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODczNDAsImV4cCI6MjA5MDg2MzM0MH0.4-_R0yZ7u_uUdcp83O8tWqdR3rsoIMkuWaIFTRu67Q0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});