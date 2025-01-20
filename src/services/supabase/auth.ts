import { supabase } from './client';

// Request OTP
export const requestOTP = async (
  email: string,
  metadata?: {
    role?: string;
  },
) => {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: metadata || {},
    },
  });
  if (error) throw new Error(error.message);
  return data;
};

// Verify OTP
export const verifyOTP = async (email: string, token: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) throw new Error(error.message);
  return data;
};
