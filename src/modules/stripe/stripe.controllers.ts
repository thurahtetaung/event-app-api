import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createStripeConnectAccount,
  updateStripeAccountStatus,
  handleStripeWebhook,
  completeStripeOnboarding,
  refreshStripeOnboarding,
  getOrganizationWithStripeDetails,
  handleStripeConnectWebhook,
} from './stripe.services';
import { StripeAccountInput, StripeAccountStatusInput } from './stripe.schema';
import { handleError } from '../../utils/errors';

export async function connectStripeAccountHandler(
  request: FastifyRequest<{
    Body: StripeAccountInput;
  }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const result = await createStripeConnectAccount(request.body);
    return reply.code(200).send(result);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function completeStripeOnboardingHandler(
  request: FastifyRequest<{
    Params: { organizationId: string };
  }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const organization = await getOrganizationWithStripeDetails(
      request.params.organizationId,
    );

    const updatedOrg = await completeStripeOnboarding(
      organization.stripeAccountId,
    );
    return reply.code(200).send(updatedOrg);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function refreshStripeOnboardingHandler(
  request: FastifyRequest<{
    Params: { organizationId: string };
  }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const result = await refreshStripeOnboarding(request.params.organizationId);
    return reply.code(200).send(result);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateStripeAccountStatusHandler(
  request: FastifyRequest<{
    Body: StripeAccountStatusInput;
  }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const organization = await updateStripeAccountStatus(request.body);
    return reply.code(200).send(organization);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function stripeWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const signature = request.headers['stripe-signature'] as string;
    // Use the general webhook handler
    await handleStripeWebhook(signature, request.rawBody as Buffer);
    return reply.code(200).send({ received: true });
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function stripeConnectWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  try {
    const signature = request.headers['stripe-signature'] as string;
    // Use the Connect-specific webhook handler
    await handleStripeConnectWebhook(signature, request.rawBody as Buffer);
    return reply.code(200).send({ received: true });
  } catch (error) {
    return handleError(error, request, reply);
  }
}
