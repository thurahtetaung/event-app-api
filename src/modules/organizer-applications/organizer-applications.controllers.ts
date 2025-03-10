import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateOrganizerApplicationInput,
  UpdateOrganizerApplicationStatusInput,
} from './organizer-applications.schema';
import {
  createOrganizerApplication,
  getOrganizerApplicationById,
  getOrganizerApplications,
  updateOrganizerApplicationStatus,
  checkPendingOrganizerApplicationExists,
  getOrganizerApplicationByUserId,
  getPendingApplicationsStats,
} from './organizer-applications.services';
import { handleError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export async function createOrganizerApplicationHandler(
  request: FastifyRequest<{
    Body: CreateOrganizerApplicationInput;
  }>,
  reply: FastifyReply,
) {
  try {
    // Check if user already has an application (using a dedicated check function)
    const hasExistingApplication = await checkPendingOrganizerApplicationExists(
      request.user.id,
    );
    if (hasExistingApplication) {
      return reply.code(400).send({
        message: 'You already have a pending application',
      });
    }

    const application = await createOrganizerApplication(
      request.user.id,
      request.body,
    );
    return reply.code(201).send(application);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getOrganizerApplicationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const applications = await getOrganizerApplications();
    return reply.code(200).send(applications);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getOrganizerApplicationHandler(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const application = await getOrganizerApplicationById(request.params.id);
    return reply.code(200).send(application);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateOrganizerApplicationStatusHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateOrganizerApplicationStatusInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const application = await updateOrganizerApplicationStatus(
      request.params.id,
      request.user.id,
      request.body,
    );
    return reply.code(200).send(application);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getCurrentUserApplicationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const application = await getOrganizerApplicationByUserId(request.user.id);
    return reply.code(200).send(application);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getPendingApplicationsStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const stats = await getPendingApplicationsStats();
    return reply.code(200).send(stats);
  } catch (error) {
    return handleError(error, request, reply);
  }
}
