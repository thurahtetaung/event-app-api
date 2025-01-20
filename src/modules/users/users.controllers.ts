import { FastifyReply, FastifyRequest } from 'fastify';
import {
  loginUser,
  registerUser,
  updateUserDetails,
  verifyLogin,
  verifyRegistration,
} from './users.services';
import {
  loginUserBodySchema,
  registerUserBodySchema,
  updateUserDetailsBodySchema,
  verifyLoginBodySchema,
  verifyRegistrationBodySchema,
} from './users.schema';
import { logger } from '../../utils/logger';

export async function registerUserHandler(
  request: FastifyRequest<{
    Body: registerUserBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { email, username, firstName, lastName, role } = request.body;
  const result = await registerUser({
    email,
    username,
    firstName,
    lastName,
    role,
  });
  return {
    message: 'OTP sent',
    result,
  };
}

export async function verifyRegistrationHandler(
  request: FastifyRequest<{
    Body: verifyRegistrationBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { email, otp } = request.body;
  const result = await verifyRegistration({
    email,
    otp,
  });
  return result;
}

export async function loginUserHandler(
  request: FastifyRequest<{
    Body: loginUserBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { email } = request.body;
  const result = await loginUser({
    email,
  });
  return {
    message: 'OTP sent',
    data: result,
  };
}

export async function verifyLoginHandler(
  request: FastifyRequest<{
    Body: verifyLoginBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { email, otp } = request.body;
  const result = await verifyLogin({
    email,
    otp,
  });
  return {
    message: 'OTP verified',
    data: result,
  };
}

export async function updateUserDetailsHandler(
  request: FastifyRequest<{
    Body: updateUserDetailsBodySchema;
  }>,
  reply: FastifyReply,
) {
  const { email, username, firstName, lastName, role, userId } = request.body;
  logger.info(`Updating user details for user ${userId}`);
  const result = await updateUserDetails(
    {
      email,
      username,
      firstName,
      lastName,
      role,
    },
    userId,
  );
  return {
    message: 'User details updated',
    data: result,
  };
}
