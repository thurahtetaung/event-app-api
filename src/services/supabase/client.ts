import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

const options = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};
// Create a single supabase client for interacting with your database
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  options,
);
