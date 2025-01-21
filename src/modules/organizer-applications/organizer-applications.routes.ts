import { FastifyInstance } from 'fastify';
import {
  createOrganizerApplicationSchema,
  updateOrganizerApplicationStatusSchema,
  CreateOrganizerApplicationInput,
  UpdateOrganizerApplicationStatusInput,
} from './organizer-applications.schema';
import {
  createOrganizerApplicationHandler,
  getOrganizerApplicationsHandler,
  getOrganizerApplicationHandler,
  updateOrganizerApplicationStatusHandler,
} from './organizer-applications.controllers';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function organizerApplicationRoutes(app: FastifyInstance) {
  // Create organizer application (authenticated users only)
  app.post<{ Body: CreateOrganizerApplicationInput }>(
    '/',
    {
      schema: {
        body: zodToJsonSchema(
          createOrganizerApplicationSchema,
          'createOrganizerApplicationSchema',
        ),
      },
      preHandler: [authenticateRequest],
    },
    createOrganizerApplicationHandler,
  );

  // Get all organizer applications (admin only)
  app.get(
    '/',
    {
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getOrganizerApplicationsHandler,
  );

  // Get organizer application by id (admin only)
  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getOrganizerApplicationHandler,
  );

  // Update organizer application status (admin only)
  app.patch<{
    Params: { id: string };
    Body: UpdateOrganizerApplicationStatusInput;
  }>(
    '/:id/status',
    {
      schema: {
        body: zodToJsonSchema(
          updateOrganizerApplicationStatusSchema,
          'updateOrganizerApplicationStatusSchema',
        ),
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    updateOrganizerApplicationStatusHandler,
  );
}
