import { FastifyInstance } from 'fastify';
import {
  getOrganizationsHandler,
  getOrganizationHandler,
  updateOrganizationHandler,
  getMyOrganizationsHandler,
} from './organizations.controllers';
import {
  updateOrganizationSchema,
  UpdateOrganizationInput,
} from './organizations.schema';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function organizationRoutes(app: FastifyInstance) {
  // Get all organizations (admin only)
  app.get(
    '/',
    {
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getOrganizationsHandler,
  );

  // Get my organizations
  app.get(
    '/me',
    {
      preHandler: [authenticateRequest],
    },
    getMyOrganizationsHandler,
  );

  // Get organization by ID
  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [authenticateRequest],
    },
    getOrganizationHandler,
  );

  // Update organization (admin or owner)
  app.patch<{
    Params: { id: string };
    Body: UpdateOrganizationInput;
  }>(
    '/:id',
    {
      schema: {
        body: zodToJsonSchema(
          updateOrganizationSchema,
          'updateOrganizationSchema',
        ),
      },
      preHandler: [authenticateRequest],
    },
    updateOrganizationHandler,
  );
}
