import { FastifyReply, FastifyRequest } from 'fastify';
import {
  loginUser,
  registerUser,
  verifyLogin,
  verifyRegistration,
} from './users.services';
import {
  loginUserBodySchema,
  registerUserBodySchema,
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
  try {
    const { email, username, role } = request.body;
    const result = await registerUser({
      email,
      username,
      role,
    });
    return reply.code(201).send({
      message: 'OTP sent',
      result,
    });
  } catch (error) {
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
