import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema';
import { requestOTP, verifyOTP } from '../../services/supabase/auth';
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

export async function registerUser(data: registerUserBodySchema) {
  try {
    // First store the user in the database
    const result = await createUser(data);
    // Then send the OTP
    await requestOTP(data.email, { role: data.role });
    return result;
  } catch (e) {
    logger.error(`Error registering user: ${e}`);
    if (e.code === '23505') {
      throw new ValidationError('Email or username already exists');
    }
    throw new AppError(500, `Failed to register user: ${e.message}`);
  }
}

async function createUser(data: registerUserBodySchema) {
  const result = await db.insert(users).values(data).returning();
  return result[0];
}

async function updateUserVerification(email: string, supabaseUserId: string) {
  const result = await db
    .update(users)
    .set({ verified: true, supabaseUserId, updatedAt: new Date() })
    .where(eq(users.email, email))
    .returning();
  return result[0];
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
          username: 'admin',
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

export async function getUsers() {
  try {
    logger.info('Fetching all users...');
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        verified: users.verified,
      })
      .from(users);

    logger.debug(`Successfully fetched ${result.length} users`);
    return result;
  } catch (error) {
    logger.error(`Error fetching users: ${error}`);
    throw new AppError(500, 'Failed to fetch users');
  }
}

export async function getUserById(userId: string) {
  try {
    logger.info(`Fetching user by ID ${userId}`);
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        verified: users.verified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result[0]) {
      logger.warn(`User not found with ID ${userId}`);
      throw new NotFoundError(`User not found with ID ${userId}`);
    }

    logger.debug(`User found with ID ${userId}`);
    return result[0];
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error(`Error fetching user by ID: ${error}`);
    throw new AppError(500, 'Failed to fetch user');
  }
}

export async function loginUser(data: { email: string }) {
  try {
    // First check if the user exists or verified
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

    // Then send the OTP
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
    // First verify the OTP
    const supabaseUser = await verifyOTP(data.email, data.otp);
    // Then return the user token
    if (!supabaseUser.session) {
      throw new ValidationError('Invalid or expired OTP');
    }
    return {
      access_token: supabaseUser.session.access_token,
      refresh_token: supabaseUser.session.refresh_token,
    };
  } catch (e) {
    logger.error(`Error verifying login: ${e}`);
    if (e instanceof ValidationError) {
      throw e;
    }
    throw new AppError(500, `Failed to verify login: ${e.message}`);
  }
}
