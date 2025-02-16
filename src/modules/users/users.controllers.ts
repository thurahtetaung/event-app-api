import { FastifyReply, FastifyRequest } from 'fastify';
import {
  loginUser,
  registerUser,
  verifyLogin,
  verifyRegistration,
  resendRegistrationOTP,
  resendLoginOTP,
  findUserByEmail,
  createUser,
  refreshToken
} from './users.services';
import {
  loginUserBodySchema,
  registerUserBodySchema,
  verifyLoginBodySchema,
  verifyRegistrationBodySchema,
  resendOTPBodySchema,
} from './users.schema';
import { logger } from '../../utils/logger';
import { AppError, UnauthorizedError } from '../../utils/errors';
import { users } from '../../db/schema';

interface AuthenticatedRequest extends FastifyRequest {
  user: typeof users.$inferSelect;
}

export async function getCurrentUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    logger.info(`Getting current user: ${request.user.email}`);
    return reply.code(200).send(request.user);
  } catch (error) {
    logger.error(`Error getting current user: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to get current user');
  }
}

export async function registerUserHandler(
  request: FastifyRequest<{
    Body: registerUserBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await registerUser(request.body);
    return reply.code(200).send(result);
  } catch (error) {
    logger.error(`Error registering user in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function verifyRegistrationHandler(
  request: FastifyRequest<{
    Body: verifyRegistrationBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const { email, otp } = request.body;
    const result = await verifyRegistration({
      email,
      otp,
    });
    return reply.code(200).send(result);
  } catch (error) {
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function loginUserHandler(
  request: FastifyRequest<{
    Body: loginUserBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const { email } = request.body;
    const result = await loginUser({
      email,
    });
    return reply.code(200).send({
      message: 'OTP sent',
      data: result,
    });
  } catch (error) {
    logger.error(`Error logging in user in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function verifyLoginHandler(
  request: FastifyRequest<{
    Body: verifyLoginBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const { email, otp } = request.body;
    const result = await verifyLogin({
      email,
      otp,
    });
    return reply.code(200).send({
      message: 'OTP verified',
      data: result,
    });
  } catch (error) {
    logger.error(`Error verifying login in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function resendRegistrationOTPHandler(
  request: FastifyRequest<{
    Body: resendOTPBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const { email } = request.body;
    const result = await resendRegistrationOTP({
      email,
    });
    return reply.code(200).send({
      message: 'OTP resent',
      data: result,
    });
  } catch (error) {
    logger.error(`Error resending registration OTP in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function resendLoginOTPHandler(
  request: FastifyRequest<{
    Body: resendOTPBodySchema;
  }>,
  reply: FastifyReply,
) {
  try {
    const { email } = request.body;
    const result = await resendLoginOTP({
      email,
    });
    return reply.code(200).send({
      message: 'OTP resent',
      data: result,
    });
  } catch (error) {
    logger.error(`Error resending login OTP in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function refreshTokenHandler(
  request: FastifyRequest<{
    Body: { refresh_token: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const { refresh_token } = request.body;
    if (!refresh_token) {
      return reply.code(400).send({ message: 'Refresh token is required' });
    }

    const result = await refreshToken(refresh_token);
    return reply.code(200).send(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return reply.code(401).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Failed to refresh token' });
  }
}
