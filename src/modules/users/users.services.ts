import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema'; // Import users table
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
  ForbiddenError,
} from '../../utils/errors';
import jwt from 'jsonwebtoken';

// Define User type from schema
type User = typeof users.$inferSelect;

// Define minimal types for Supabase auth responses if not exported from the module
type SupabaseAuthUser = { id: string; [key: string]: unknown }; // Changed any to unknown
type SupabaseAuthSession = {
  access_token: string;
  refresh_token: string;
  [key: string]: unknown; // Changed any to unknown
};

// Define return types for functions that return user or array of users
type UserResponse = User | undefined;
type UsersResponse = User[];
type UserLoginResponse = Pick<
  User,
  'id' | 'email' | 'verified' | 'role' | 'status' | 'supabaseUserId'
>;

export async function findUserByEmail(email: string): Promise<UserResponse> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result[0];
}

export async function registerUser(
  data: registerUserBodySchema,
): Promise<User> {
  try {
    const existingUser = await findUserByEmail(data.email);
    if (existingUser) {
      throw new ValidationError('Email already exists');
    }

    // Create user in database
    const result = await createUser(data); // This can also throw if email is unique constraint
    logger.info(`Now requesting OTP for user: ${data.email}`);
    // Send the OTP
    const otpResponse = await requestOTP(data.email, { role: data.role });
    logger.info(`OTP response: ${JSON.stringify(otpResponse)}`); // Log the full response for clarity
    return result;
  } catch (e: unknown) {
    // Changed to unknown for better type safety
    logger.error(`Error registering user: ${e}`);
    if (e instanceof ValidationError) {
      throw e;
    }
    // Check for unique constraint violation (e.g., from createUser)
    // PostgreSQL unique violation code is '23505'
    // Safely access properties if 'e' is an object with 'code' or 'message'
    const errorCode = (e as { code?: string })?.code;
    const errorMessage = (e as { message?: string })?.message;

    if (
      errorCode === '23505' ||
      (errorMessage &&
        typeof errorMessage === 'string' &&
        errorMessage.toLowerCase().includes('unique constraint') &&
        errorMessage.toLowerCase().includes('email'))
    ) {
      throw new ValidationError('Email already exists');
    }
    if (e instanceof AppError) {
      throw new AppError(
        e.statusCode,
        `Failed to register user: ${e.message}`,
        e.code || 'REGISTRATION_FAILED',
        e.errors,
      );
    }
    throw new AppError(
      500,
      `Failed to register user: An unexpected error occurred.`,
      'INTERNAL_ERROR',
    );
  }
}

interface VerifyRegistrationResult extends User {
  access_token: string;
  refresh_token: string;
}

export async function verifyRegistration(
  data: verifyRegistrationBodySchema,
): Promise<VerifyRegistrationResult> {
  try {
    // First verify the OTP
    const supabaseUserResponse = (await verifyOTP(data.email, data.otp)) as {
      user: SupabaseAuthUser;
      session: SupabaseAuthSession;
    }; // Renamed for clarity and typed
    if (!supabaseUserResponse.user || !supabaseUserResponse.session) {
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
      supabaseUserResponse.user.id,
    );
    return {
      ...result,
      access_token: supabaseUserResponse.session.access_token,
      refresh_token: supabaseUserResponse.session.refresh_token,
    };
  } catch (e: unknown) {
    logger.error(`Error verifying registration: ${e}`);
    if (e instanceof ValidationError) {
      throw e;
    }
    const errorMessage = (e as Error)?.message || 'An unknown error occurred';
    throw new AppError(500, `Failed to verify registration: ${errorMessage}`);
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

export async function createUser(data: registerUserBodySchema): Promise<User> {
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
): Promise<User> {
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

export async function getUsers(): Promise<UsersResponse> {
  return db.select().from(users);
}

export async function getUserById(id: string): Promise<UserResponse> {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!result.length) {
    throw new NotFoundError('User not found');
  }

  return result[0];
}

export async function getUserByEmail(email: string): Promise<UserResponse> {
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

export async function loginUser(data: {
  email: string;
}): Promise<UserLoginResponse> {
  try {
    const userQuery = await db // Renamed to avoid conflict with User type
      .select({
        id: users.id,
        email: users.email,
        verified: users.verified,
        role: users.role,
        status: users.status,
        supabaseUserId: users.supabaseUserId,
      })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (userQuery.length === 0) {
      throw new NotFoundError('User not found');
    }
    const user = userQuery[0]; // Assign to user

    if (user.status === 'inactive' || user.status === 'banned') {
      const statusMessage =
        user.status === 'banned'
          ? 'Your account has been suspended. Please contact support for assistance.'
          : 'Your account is inactive. Please contact support to reactivate your account.';
      logger.warn(
        `Login attempt by ${data.email} blocked due to account status: ${user.status}`,
      );
      throw new ForbiddenError(statusMessage);
    }

    if (user.supabaseUserId?.startsWith('sb_')) {
      logger.info(
        `Seeded user detected - bypassing verification and OTP: ${user.email}`,
      );
      return user;
    }

    if (!user.verified) {
      // OTP is assumed to have been sent by Supabase automatically upon login attempt for an unverified user,
      // or during the initial registration process.
      // DO NOT send another OTP here to avoid rate-limiting.
      // Just inform the client that registration is pending.
      throw new UnauthorizedError(
        'Please complete your registration by verifying your email. An OTP may have already been sent to your email address. (REGISTRATION_PENDING)',
      );
    }

    // For verified users, send a login OTP
    await requestOTP(data.email);
    return user;
  } catch (e: unknown) {
    logger.error(`Error logging in user: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = (e as Error)?.message || 'An unknown error occurred';
    throw new AppError(500, `Failed to login user: ${errorMessage}`);
  }
}

interface VerifyLoginResult {
  access_token: string;
  refresh_token: string;
  user: User;
}

export async function verifyLogin(data: {
  email: string;
  otp: string;
}): Promise<VerifyLoginResult> {
  try {
    const userQuery = await db // Renamed
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (userQuery.length === 0) {
      throw new NotFoundError('User not found');
    }
    const user = userQuery[0]; // Assign

    if (user.status === 'inactive' || user.status === 'banned') {
      const statusMessage =
        user.status === 'banned'
          ? 'Your account has been suspended. Please contact support for assistance.'
          : 'Your account is inactive. Please contact support to reactivate your account.';
      logger.warn(
        `Login verification attempt by ${data.email} blocked due to account status: ${user.status}`,
      );
      throw new ForbiddenError(statusMessage);
    }

    const isSeededUser = user.supabaseUserId?.startsWith('sb_');

    if (isSeededUser) {
      if (data.otp !== '000000') {
        throw new UnauthorizedError(
          'Invalid OTP. For seeded users, use "000000"',
        );
      }
      logger.info(`Seeded user verified with magic code: ${user.email}`);
      const payload = { id: user.id, email: user.email, role: user.role };
      const access_token = jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: '24h',
      });
      const refresh_token = jwt.sign(
        { ...payload, type: 'refresh' },
        env.JWT_SECRET,
        { expiresIn: '30d' },
      );
      logger.info(`Seeded user login successful for: ${user.email}`);
      return { access_token, refresh_token, user };
    } else {
      const verifyResult = (await verifyOTP(data.email, data.otp)) as {
        user: SupabaseAuthUser;
        session: SupabaseAuthSession;
      }; // Typed
      if (!verifyResult || !verifyResult.session) {
        throw new ValidationError('Invalid or expired OTP');
      }
      return {
        access_token: verifyResult.session.access_token,
        refresh_token: verifyResult.session.refresh_token,
        user,
      };
    }
  } catch (e: unknown) {
    logger.error(`Error verifying login: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = (e as Error)?.message || 'An unknown error occurred';
    throw new AppError(500, `Failed to verify login: ${errorMessage}`);
  }
}

type ResendOTPResponse = Pick<User, 'id' | 'email' | 'verified' | 'role'>;

export async function resendRegistrationOTP(data: {
  email: string;
}): Promise<ResendOTPResponse> {
  try {
    const userQuery = await db // Renamed
      .select({
        id: users.id,
        email: users.email,
        verified: users.verified,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (userQuery.length === 0) {
      throw new NotFoundError('User not found');
    }
    const user = userQuery[0]; // Assign
    if (user.verified) {
      throw new ValidationError('User is already verified');
    }

    await requestOTP(data.email, { role: user.role });
    return user;
  } catch (e: unknown) {
    logger.error(`Error resending registration OTP: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = (e as Error)?.message || 'An unknown error occurred';
    throw new AppError(
      500,
      `Failed to resend registration OTP: ${errorMessage}`,
    );
  }
}

type ResendLoginOTPResponse = Pick<User, 'id' | 'email' | 'verified'>;

export async function resendLoginOTP(data: {
  email: string;
}): Promise<ResendLoginOTPResponse> {
  try {
    const userQuery = await db // Renamed
      .select({
        id: users.id,
        email: users.email,
        verified: users.verified,
      })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (userQuery.length === 0) {
      throw new NotFoundError('User not found');
    }
    const user = userQuery[0]; // Assign
    if (!user.verified) {
      throw new UnauthorizedError('User not verified');
    }

    await requestOTP(data.email);
    return user;
  } catch (e: unknown) {
    logger.error(`Error resending login OTP: ${e}`);
    if (e instanceof AppError) {
      throw e;
    }
    const errorMessage = (e as Error)?.message || 'An unknown error occurred';
    throw new AppError(500, `Failed to resend login OTP: ${errorMessage}`);
  }
}

interface RefreshTokenResult {
  access_token: string;
  refresh_token: string;
}
interface DecodedJwt {
  id: string;
  email: string;
  role: string;
  type?: string; // Make type optional as it's only for seeded user refresh tokens
}

export async function refreshToken(
  refreshToken: string,
): Promise<RefreshTokenResult> {
  try {
    logger.info('Refresh token request received');

    try {
      const decoded = jwt.verify(refreshToken, env.JWT_SECRET) as DecodedJwt;

      if (decoded.type === 'refresh') {
        const userQuery = await db // Renamed
          .select()
          .from(users)
          .where(eq(users.email, decoded.email))
          .limit(1);
        if (userQuery.length === 0)
          throw new UnauthorizedError('User not found');
        const user = userQuery[0]; // Assign

        if (!user.supabaseUserId?.startsWith('sb_'))
          throw new UnauthorizedError('Not a seeded user');

        const payload = { id: user.id, email: user.email, role: user.role };
        const access_token = jwt.sign(payload, env.JWT_SECRET, {
          expiresIn: '24h',
        });
        const new_refresh_token = jwt.sign(
          { ...payload, type: 'refresh' },
          env.JWT_SECRET,
          { expiresIn: '30d' },
        );
        logger.info('Token refresh successful for seeded user');
        return { access_token, refresh_token: new_refresh_token };
      }
    } catch (jwtError: unknown) {
      // Catch specific JWT errors
      // If token verification fails (e.g. expired, invalid), try Supabase. Log non-critical errors.
      if (jwtError instanceof jwt.TokenExpiredError) {
        logger.info('JWT refresh token expired, trying Supabase refresh.');
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        logger.info('Invalid JWT refresh token, trying Supabase refresh.');
      } else {
        // Log other unexpected JWT errors but still proceed to Supabase refresh attempt
        logger.warn(
          `Unexpected error during JWT refresh token verification: ${jwtError}, trying Supabase refresh.`,
        );
      }
    }

    const session = (await refreshSession(
      refreshToken,
    )) as SupabaseAuthSession | null; // Type Supabase session

    if (!session) {
      logger.error('No session returned after refresh from Supabase');
      throw new UnauthorizedError(
        'Invalid refresh token. Session could not be refreshed.',
      );
    }

    if (!session.access_token || !session.refresh_token) {
      logger.error('Supabase session missing required tokens after refresh');
      throw new UnauthorizedError(
        'Invalid session data from Supabase after refresh.',
      );
    }

    logger.info('Token refresh successful via Supabase');
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  } catch (error: unknown) {
    const errorMessage =
      (error as Error)?.message || 'An unknown error occurred';
    logger.error(`Error refreshing token: ${errorMessage}`);

    if (
      errorMessage.includes('Token expired') ||
      errorMessage.includes('Invalid refresh token') ||
      errorMessage.includes('Already used') ||
      errorMessage.includes('Session could not be refreshed') // Added from Supabase path
    ) {
      throw new UnauthorizedError('Session expired. Please log in again.');
    }

    if (error instanceof UnauthorizedError) {
      throw error;
    }
    // Ensure a default message if none is extracted
    throw new AppError(
      500,
      `Failed to refresh session: ${errorMessage || 'Please try again.'}`,
    );
  }
}
