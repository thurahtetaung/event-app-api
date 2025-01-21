import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

interface JWTPayload {
  sub: string;
  email: string;
  role: string;
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
    };
    logger.info(`Current user: ${JSON.stringify(decoded)}`);
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, decoded.email))
      .limit(1);

    if (!user.length) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    request.user = {
      id: user[0].id,
      email: user[0].email,
      role: user[0].role,
    };
  } catch (error) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
}

export function checkRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Allow admins to do anything organizers can do
    if (request.user.role === 'admin') {
      return;
    }
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({ message: 'Forbidden' });
    }
  };
}
