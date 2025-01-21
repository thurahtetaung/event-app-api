import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getOrganizations,
  getOrganizationById,
  updateOrganization,
  getOrganizationsByOwner,
} from './organizations.services';
import { UpdateOrganizationInput } from './organizations.schema';
import { logger } from '../../utils/logger';

export async function getOrganizationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const organizations = await getOrganizations();
    return reply.code(200).send(organizations);
  } catch (error) {
    logger.error(`Error getting organizations in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getOrganizationHandler(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const organization = await getOrganizationById(request.params.id);
    return reply.code(200).send(organization);
  } catch (error) {
    logger.error(`Error getting organization in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getMyOrganizationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const organizations = await getOrganizationsByOwner(request.user.id);
    return reply.code(200).send(organizations);
  } catch (error) {
    logger.error(`Error getting user organizations in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function updateOrganizationHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateOrganizationInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const organization = await updateOrganization(
      request.user.id,
      request.params.id,
      request.body,
      request.user.role,
    );
    return reply.code(200).send(organization);
  } catch (error) {
    logger.error(`Error updating organization in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}
