import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema';
import {
  requestOTP,
  verifyOTP,
  refreshSession,
} from '../../services/supabase/auth';
import {
  registerUserBodySchema,
  verifyRegistrationBodySchema,
} from './users.schema';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
} from '../../utils/errors';
import jwt from 'jsonwebtoken';

export async function findUserByEmail(email: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result[0];
}

export async function registerUser(data: registerUserBodySchema) {
  try {
    // First check if user already exists
    const existingUser = await findUserByEmail(data.email);
    if (existingUser) {
      throw new ValidationError('Email already exists');
    }

    // Create user in database
    const result = await createUser(data);
    logger.info(`Now requesting OTP for user: ${data.email}`);
    // Send the OTP
    const otpResponse = await requestOTP(data.email, { role: data.role });
    logger.info(`OTP response: ${otpResponse}`);
    return result;
  } catch (e) {
    logger.error(`Error registering user: ${e}`);
    if (e instanceof ValidationError) {
      throw e;
    }
    if (e.code === '23505') {
      throw new ValidationError('Email already exists');
    }
    throw new AppError(500, `Failed to register user: ${e.message}`);
  }
}

export async function verifyRegistration(data: verifyRegistrationBodySchema) {
  try {
    // First verify the OTP
    const supabaseUser = await verifyOTP(data.email, data.otp);
    if (!supabaseUser.user || !supabaseUser.session) {
      throw new ValidationError('Invalid or expired OTP');
    }

    // Check if this is the superadmin registration
    if (data.email === env.SUPERADMIN_EMAIL) {
      // Create superadmin user if doesn't exist
      const existingSuperadmin = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (existingSuperadmin.length === 0) {
        await createUser({
          email: data.email,
          firstName: 'Admin',
          lastName: 'User',
          dateOfBirth: new Date().toISOString(),
          country: 'TH',
          role: 'admin',
        });
      }
    }

    // Then update the user in the database
    const result = await updateUserVerification(
      data.email,
      supabaseUser.user.id,
    );
    return {
      ...result,
      access_token: supabaseUser.session.access_token,
      refresh_token: supabaseUser.session.refresh_token,
    };
  } catch (e) {
    logger.error(`Error verifying registration: ${e}`);
    if (e instanceof ValidationError) {
      throw e;
    }
    throw new AppError(500, `Failed to verify registration: ${e.message}`);
  }
}

// Helper function to convert string date to Date object
function parseDate(dateString: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new ValidationError('Invalid date format');
  }
  return date;
}

export async function createUser(data: registerUserBodySchema) {
  const userData = {
    ...data,
    dateOfBirth:
      typeof data.dateOfBirth === 'string'
        ? parseDate(data.dateOfBirth)
        : data.dateOfBirth,
  };
  const result = await db.insert(users).values(userData).returning();
  return result[0];
}

export async function updateUserVerification(
  email: string,
  supabaseUserId: string,
) {
  const result = await db
    .update(users)
    .set({
      supabaseUserId,
      verified: true,
    })
    .where(eq(users.email, email))
    .returning();

  if (!result.length) {
    throw new NotFoundError('User not found');
  }

  return result[0];
}

export async function getUsers() {
  return db.select().from(users);
}

export async function getUserById(id: string) {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!result.length) {
    throw new NotFoundError('User not found');
  }

  return result[0];
}

export async function getUserByEmail(email: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!result.length) {
    throw new NotFoundError('User not found');
  }

  return result[0];
}

export async function loginUser(data: { email: string }) {
  try {
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        verified: users.verified,
        role: users.role,
        supabaseUserId: users.supabaseUserId,
      })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (user.length === 0) {
      throw new NotFoundError('User not found');
    }

    // Check if this is a seeded user (supabaseUserId starts with 'sb_')
    if (user[0].supabaseUserId?.startsWith('sb_')) {
      logger.info(
        `Seeded user detected - bypassing verification and OTP: ${user[0].email}`,
      );
      // Skip verification check and OTP sending for seeded users, but return normal response
      return user[0];
    }

    // Only check verification for non-seeded users
    if (!user[0].verified) {
      // Instead of blocking login, send registration OTP
      await requestOTP(data.email, { role: user[0].role });
      throw new UnauthorizedError(
        'Please complete your registration by verifying your email. A new verification code has been sent.',
      );
    }

    // Regular user - send OTP as usual
    await requestOTP(data.email);
    return user[0];
  } catch (e) {
    logger.error(`Error logging in user: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    throw new AppError(500, `Failed to login user: ${e.message}`);
  }
}

export async function verifyLogin(data: { email: string; otp: string }) {
  try {
    // Get the user by email
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (user.length === 0) {
      throw new NotFoundError('User not found');
    }

    // Check if this is a seeded user (supabaseUserId starts with 'sb_')
    const isSeededUser = user[0].supabaseUserId?.startsWith('sb_');

    // Handle verification based on user type
    if (isSeededUser) {
      // For seeded users, accept the magic code "000000"
      if (data.otp !== '000000') {
        throw new UnauthorizedError(
          'Invalid OTP. For seeded users, use "000000"',
        );
      }

      logger.info(`Seeded user verified with magic code: ${user[0].email}`);

      // Generate tokens for seeded users
      const payload = {
        id: user[0].id,
        email: user[0].email,
        role: user[0].role,
      };

      // Create access token
      const access_token = jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: '24h', // 24 hours
      });

      // Create refresh token
      const refresh_token = jwt.sign(
        { ...payload, type: 'refresh' },
        env.JWT_SECRET,
        { expiresIn: '30d' }, // 30 days
      );

      logger.info(`Seeded user login successful for: ${user[0].email}`);
      return {
        access_token,
        refresh_token,
        user: user[0],
      };
    } else {
      // For regular users, verify with Supabase
      const verifyResult = await verifyOTP(data.email, data.otp);

      if (!verifyResult || !verifyResult.session) {
        throw new ValidationError('Invalid or expired OTP');
      }

      return {
        access_token: verifyResult.session.access_token,
        refresh_token: verifyResult.session.refresh_token,
        user: user[0],
      };
    }
  } catch (e) {
    logger.error(`Error verifying login: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    throw new AppError(500, `Failed to verify login: ${e.message}`);
  }
}

export async function resendRegistrationOTP(data: { email: string }) {
  try {
    // Check if user exists and is not verified
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        verified: users.verified,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (user.length === 0) {
      throw new NotFoundError('User not found');
    }
    if (user[0].verified) {
      throw new ValidationError('User is already verified');
    }

    // Send new OTP
    await requestOTP(data.email, { role: user[0].role });
    return user[0];
  } catch (e) {
    logger.error(`Error resending registration OTP: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    throw new AppError(500, `Failed to resend registration OTP: ${e.message}`);
  }
}

export async function resendLoginOTP(data: { email: string }) {
  try {
    // Check if user exists and is verified
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        verified: users.verified,
      })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (user.length === 0) {
      throw new NotFoundError('User not found');
    }
    if (!user[0].verified) {
      throw new UnauthorizedError('User not verified');
    }

    // Send new OTP
    await requestOTP(data.email);
    return user[0];
  } catch (e) {
    logger.error(`Error resending login OTP: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    throw new AppError(500, `Failed to resend login OTP: ${e.message}`);
  }
}

export async function refreshToken(refreshToken: string) {
  try {
    logger.info('Refresh token request received');

    // Check if this is a seeded user token
    try {
      const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as {
        id: string;
        email: string;
        role: string;
        type: string;
      };

      // If this is a refresh token for a seeded user
      if (decoded.type === 'refresh') {
        // Verify that the user still exists and is a seeded user
        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, decoded.email))
          .limit(1);

        if (user.length === 0) {
          throw new UnauthorizedError('User not found');
        }

        // Check if this is a seeded user (has supabaseUserId starting with 'sb_')
        if (!user[0].supabaseUserId?.startsWith('sb_')) {
          throw new UnauthorizedError('Not a seeded user');
        }

        // Generate new tokens
        const payload = {
          id: user[0].id,
          email: user[0].email,
          role: user[0].role,
        };

        // Create new access token
        const access_token = jwt.sign(payload, env.JWT_SECRET, {
          expiresIn: '24h', // 24 hours
        });

        // Create new refresh token
        const new_refresh_token = jwt.sign(
          { ...payload, type: 'refresh' },
          env.JWT_SECRET,
          { expiresIn: '30d' }, // 30 days
        );

        logger.info('Token refresh successful for seeded user');
        return {
          access_token,
          refresh_token: new_refresh_token,
        };
      }
    } catch (err) {
      // If token verification fails, try Supabase
      logger.info('Not a seeded user token, trying Supabase refresh');
    }

    // Attempt to refresh the Supabase session
    const session = await refreshSession(refreshToken);

    if (!session) {
      logger.error('No session returned after refresh');
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (!session.access_token || !session.refresh_token) {
      logger.error('Session missing required tokens');
      throw new UnauthorizedError('Invalid session data');
    }

    logger.info('Token refresh successful');
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  } catch (error: any) {
    logger.error(`Error refreshing token: ${error.message}`);

    // Handle specific Supabase error cases
    if (
      error.message?.includes('Token expired') ||
      error.message?.includes('Invalid refresh token') ||
      error.message?.includes('Already used')
    ) {
      throw new UnauthorizedError('Session expired. Please log in again.');
    }

    if (error instanceof UnauthorizedError) {
      throw error;
    }

    throw new AppError(500, 'Failed to refresh session. Please try again.');
  }
}
