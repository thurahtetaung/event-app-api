import { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { organizations } from '../../db/schema';
import { db } from '../../db';
import {
  createStripeConnectAccount,
  updateStripeAccountStatus,
  handleStripeWebhook,
  completeStripeOnboarding,
  refreshStripeOnboarding,
  getOrganizationWithStripeDetails,
} from './stripe.services';
import { StripeAccountInput, StripeAccountStatusInput } from './stripe.schema';
import { logger } from '../../utils/logger';

export async function connectStripeAccountHandler(
  request: FastifyRequest<{
    Body: StripeAccountInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await createStripeConnectAccount(request.body);
    return reply.code(200).send(result);
  } catch (error) {
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function completeStripeOnboardingHandler(
  request: FastifyRequest<{
    Params: { organizationId: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const organization = await getOrganizationWithStripeDetails(
      request.params.organizationId,
    );

    const updatedOrg = await completeStripeOnboarding(
      organization.stripeAccountId,
    );
    return reply.code(200).send(updatedOrg);
  } catch (error) {
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function refreshStripeOnboardingHandler(
  request: FastifyRequest<{
    Params: { organizationId: string };
  }>,
  reply: FastifyReply,
) {
  try {
    const result = await refreshStripeOnboarding(request.params.organizationId);
    return reply.code(200).send(result);
  } catch (error) {
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function updateStripeAccountStatusHandler(
  request: FastifyRequest<{
    Body: StripeAccountStatusInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const organization = await updateStripeAccountStatus(request.body);
    return reply.code(200).send(organization);
  } catch (error) {
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}

export async function stripeWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const signature = request.headers['stripe-signature'] as string;
    await handleStripeWebhook(signature, request.rawBody as Buffer);
    return reply.code(200).send({ received: true });
  } catch (error) {
    logger.error(`Error handling Stripe webhook in controller: ${error}`);
    if (error instanceof Error) {
      return reply.code(400).send({ message: error.message });
    }
    return reply.code(500).send({ message: 'Internal server error' });
  }
}
