import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getOrganizations,
  getOrganizationById,
  updateOrganization,
  getCurrentOrganization,
  getOrganizationAnalytics,
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
    const organization = await getCurrentOrganization(request.user.id);
    return reply.code(200).send(organization || null);
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

export async function getOrganizationAnalyticsHandler(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply,
) {
  try {
    logger.info(`Getting analytics for organization ${request.params.id}`);

    // Check if user has access to this organization (this will throw if not authorized)
    await getOrganizationById(request.params.id);

    const analytics = await getOrganizationAnalytics(request.params.id);
    return reply.code(200).send(analytics);
  } catch (error) {
    logger.error(
      `Error getting organization analytics in controller: ${error}`,
    );
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function getMyOrganizationAnalyticsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    logger.info(`Getting analytics for current user's organization`);

    // Get the user's organization
    const organization = await getCurrentOrganization(request.user.id);

    if (!organization) {
      return reply
        .code(404)
        .send({ message: 'No organization found for this user' });
    }

    const analytics = await getOrganizationAnalytics(organization.id);
    return reply.code(200).send(analytics);
  } catch (error) {
    logger.error(
      `Error getting user's organization analytics in controller: ${error}`,
    );
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}
