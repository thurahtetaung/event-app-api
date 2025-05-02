import { FastifyInstance } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  connectStripeAccountHandler,
  updateStripeAccountStatusHandler,
  completeStripeOnboardingHandler,
  refreshStripeOnboardingHandler,
  stripeWebhookHandler, // General webhook handler
  stripeConnectWebhookHandler, // Connect webhook handler
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

  // Handle general Stripe webhooks (excluding Connect events)
  app.post(
    '/webhook',
    {
      config: {
        rawBody: true,
      },
    },
    stripeWebhookHandler, // Use the general handler
  );

  // Handle Stripe Connect webhooks (specifically account.updated)
  app.post(
    '/webhook/connect', // New endpoint for Connect webhooks
    {
      config: {
        rawBody: true,
      },
    },
    stripeConnectWebhookHandler, // Use the Connect-specific handler
  );
}
