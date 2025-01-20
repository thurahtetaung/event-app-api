import { eq, InferInsertModel } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema';
import { requestOTP, verifyOTP } from '../../services/supabase/auth';
import {
  registerUserBodySchema,
  verifyRegistrationBodySchema,
} from './users.schema';
import { logger } from '../../utils/logger';

export async function registerUser(data: registerUserBodySchema) {
  try {
    // First store the user in the database
    const result = await createUser(data);
    // Then send the OTP
    await requestOTP(data.email, { role: data.role });
    return result;
  } catch (e) {
    logger.error(e);
    throw new Error(`Failed to register user: ${e.message}`);
  }
}

async function createUser(data: InferInsertModel<typeof users>) {
  const result = await db.insert(users).values(data).returning();
  return result[0];
}

async function updateUserVerification(email: string, supabaseUserId: string) {
  const result = await db
    .update(users)
    .set({ verified: true, supabaseUserId })
    .where(eq(users.email, email))
    .returning();
  return result[0];
}

export async function verifyRegistration(data: verifyRegistrationBodySchema) {
  try {
    // First verify the OTP
    const supabaseUser = await verifyOTP(data.email, data.otp);
    if (!supabaseUser.user || !supabaseUser.session) {
      throw new Error('Failed to verify OTP');
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
    logger.error(e);
    throw new Error(`Failed to verify registration: ${e.message}`);
  }
}

export async function getusers() {
  const result = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      supabaseUserId: users.supabaseUserId,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      verified: users.verified,
    })
    .from(users);
  return result;
}

async function getUserById(userId: string) {
  const result = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      supabaseUserId: users.supabaseUserId,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      verified: users.verified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result;
}

export async function updateUserDetails(
  data: InferInsertModel<typeof users>,
  userId: string,
) {
  try {
    // First check if the user exists
    const user = await getUserById(userId);
    if (user.length === 0) {
      throw new Error('User not found');
    }
    const result = await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  } catch (e) {
    logger.error(e);
    throw new Error(`Failed to update user: ${e.message}`);
  }
}

export async function loginUser(data: { email: string }) {
  // First check if the user exists or verified
  try {
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
      throw new Error('User not found');
    }
    if (!user[0].verified) {
      throw new Error('User not verified');
    }
    // Then send the OTP
    await requestOTP(data.email);
    return user[0];
  } catch (e) {
    logger.error(e);
    throw new Error(`Failed to login user: ${e.message}`);
  }
}

export async function verifyLogin(data: { email: string; otp: string }) {
  try {
    // First verify the OTP
    const supabaseUser = await verifyOTP(data.email, data.otp);
    // Then return the user token
    if (!supabaseUser.session) {
      throw new Error('Failed to verify OTP');
    }
    return {
      access_token: supabaseUser.session.access_token,
      refresh_token: supabaseUser.session.refresh_token,
    };
  } catch (e) {
    logger.error(e);
    throw new Error(`Failed to verify login: ${e.message}`);
  }
}
