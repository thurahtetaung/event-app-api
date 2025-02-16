import { supabase } from './client';
import { logger } from '../../utils/logger';



// Request OTP
export async function requestOTP(email: string, metadata?: Record<string, any>) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: metadata,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

// Verify OTP
export async function verifyOTP(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    throw error;
  }
  return data;
}

export async function refreshSession(refreshToken: string) {
  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error) {
      logger.error(`Error refreshing session: ${error.message}`);
      throw error;
    }

    if (!data) {
      logger.error('No session returned after refresh');
      throw new Error('Failed to refresh session');
    }

    // Validate the new session has required fields
    const session = data.session;
    if (!session) {
      logger.error('No session returned after refresh');
      throw new Error('Failed to refresh session');
    }
    if (!session.access_token || !session.refresh_token) {
      logger.error('Invalid session data received');
      throw new Error('Invalid session data');
    }
    logger.info('Successfully refreshed session');
    return session;
  } catch (error) {
    logger.error(`Failed to refresh session: ${error.message}`);
    throw error;
  }
}
