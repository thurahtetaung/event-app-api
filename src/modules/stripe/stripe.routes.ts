import { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  connectStripeAccountHandler,
  updateStripeAccountStatusHandler,
  completeStripeOnboardingHandler,
  refreshStripeOnboardingHandler,
  stripeWebhookHandler,
} from './stripe.controllers';
import {
  stripeAccountSchema,
  stripeAccountStatusSchema,
  StripeAccountInput,
  StripeAccountStatusInput,
} from './stripe.schema';
import { authenticateRequest, checkRole } from '../../middleware/auth';

export async function stripeRoutes(app: FastifyInstance) {
  // Create Stripe Connect account and start onboarding
  app.post<{ Body: StripeAccountInput }>(
    '/connect',
    {
      schema: {
        body: zodToJsonSchema(stripeAccountSchema, 'stripeAccountSchema'),
      },
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    connectStripeAccountHandler,
  );

  // Complete Stripe onboarding
  app.get<{ Params: { organizationId: string } }>(
    '/onboard/complete/:organizationId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
          },
          required: ['organizationId'],
        },
      },
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    completeStripeOnboardingHandler,
  );

  // Refresh Stripe onboarding
  app.get<{ Params: { organizationId: string } }>(
    '/onboard/refresh/:organizationId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
          },
          required: ['organizationId'],
        },
      },
      preHandler: [authenticateRequest, checkRole(['organizer'])],
    },
    refreshStripeOnboardingHandler,
  );

  // Update Stripe account status
  app.patch<{ Body: StripeAccountStatusInput }>(
    '/status',
    {
      schema: {
        body: zodToJsonSchema(
          stripeAccountStatusSchema,
          'stripeAccountStatusSchema',
        ),
      },
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    updateStripeAccountStatusHandler,
  );

  // Handle Stripe webhooks
  app.post(
    '/webhook',
    {
      config: {
        rawBody: true,
      },
    },
    stripeWebhookHandler,
  );
}
