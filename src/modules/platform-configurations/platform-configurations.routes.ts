import { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  createPlatformConfigHandler,
  updatePlatformConfigHandler,
  getPlatformConfigsHandler,
  getPlatformConfigByKeyHandler,
  deletePlatformConfigHandler,
} from './platform-configurations.controllers';
import {
  createPlatformConfigSchema,
  updatePlatformConfigSchema,
  CreatePlatformConfigInput,
  UpdatePlatformConfigInput,
} from './platform-configurations.schema';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import { platformConfigurationsEnum } from '../../db/schema';

type ConfigKeyParams = {
  key: (typeof platformConfigurationsEnum.enumValues)[number];
};

export async function platformConfigurationsRoutes(app: FastifyInstance) {
  // Create platform configuration (admin only)
  app.post<{ Body: CreatePlatformConfigInput }>(
    '/',
    {
      schema: {
        body: zodToJsonSchema(
          createPlatformConfigSchema,
          'createPlatformConfigSchema',
        ),
      },
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    createPlatformConfigHandler,
  );

  // Update platform configuration (admin only)
  app.patch<{
    Params: ConfigKeyParams;
    Body: UpdatePlatformConfigInput;
  }>(
    '/:key',
    {
      schema: {
        body: zodToJsonSchema(
          updatePlatformConfigSchema,
          'updatePlatformConfigSchema',
        ),
        params: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              enum: platformConfigurationsEnum.enumValues,
            },
          },
          required: ['key'],
        },
      },
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    updatePlatformConfigHandler,
  );

  // Get all platform configurations (authenticated users)
  app.get(
    '/',
    {
      preHandler: [authenticateRequest],
    },
    getPlatformConfigsHandler,
  );

  // Get platform configuration by key (authenticated users)
  app.get<{ Params: ConfigKeyParams }>(
    '/:key',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              enum: platformConfigurationsEnum.enumValues,
            },
          },
          required: ['key'],
        },
      },
      preHandler: [authenticateRequest],
    },
    getPlatformConfigByKeyHandler,
  );

  // Delete platform configuration (admin only)
  app.delete<{ Params: ConfigKeyParams }>(
    '/:key',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              enum: platformConfigurationsEnum.enumValues,
            },
          },
          required: ['key'],
        },
      },
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    deletePlatformConfigHandler,
  );
}
