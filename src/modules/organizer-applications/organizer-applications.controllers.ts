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
  checkOrganizerApplicationExists,
  getOrganizerApplicationByUserId,
} from './organizer-applications.services';
import { AppError, NotFoundError } from '../../utils/errors';

export async function createOrganizerApplicationHandler(
  request: FastifyRequest<{
    Body: CreateOrganizerApplicationInput;
  }>,
  reply: FastifyReply,
) {
  try {
    // Check if user already has an application (using a dedicated check function)
    const hasExistingApplication = await checkOrganizerApplicationExists(
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
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
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
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
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
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ message: error.message });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
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
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ message: error.message });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
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
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ message: error.message });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}
