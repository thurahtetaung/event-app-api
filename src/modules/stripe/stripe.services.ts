import Stripe from 'stripe';
import { eq, and, inArray, count, or } from 'drizzle-orm';
import { db } from '../../db';
import { organizations, users, orders } from '../../db/schema';
import { env } from '../../config/env';
import { StripeAccountInput, StripeAccountStatusInput } from './stripe.schema';
import { logger } from '../../utils/logger';
import { getPlatformConfigByKey } from '../platform-configurations/platform-configurations.services';
import {
  handleSuccessfulPayment,
  handleFailedPayment,
  handleCanceledPayment,
} from '../tickets/tickets.services';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

export async function createStripeConnectAccount(input: StripeAccountInput) {
  try {
    // Get the organization and owner's email
    const [organization] = await db
      .select({
        id: organizations.id,
        ownerId: organizations.ownerId,
        ownerEmail: users.email,
        stripeAccountId: organizations.stripeAccountId,
        country: organizations.country,
      })
      .from(organizations)
      .innerJoin(users, eq(users.id, organizations.ownerId))
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // First create a Connect account
    const account = await stripe.accounts.create({
      type: 'standard',
      country: organization.country,
      email: organization.ownerEmail,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Create an account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${env.FRONTEND_URL || 'http://localhost:3000'}/organizer/settings?tab=payments&refresh=true`,
      return_url: `${env.FRONTEND_URL || 'http://localhost:3000'}/organizer/settings?tab=payments&success=true`,
      type: 'account_onboarding',
    });

    // Update organization with initial Stripe account details
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        stripeAccountId: account.id,
        stripeAccountStatus: 'pending',
        stripeAccountCreatedAt: new Date(),
        stripeAccountUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, input.organizationId))
      .returning();

    return {
      organization: updatedOrg,
      onboardingUrl: accountLink.url,
    };
  } catch (error) {
    logger.error(`Error creating Stripe Connect account: ${error}`);
    if (error.name === 'NotFoundError') {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to create Stripe Connect account: ${error.message}`,
    );
  }
}

export async function completeStripeOnboarding(stripeAccountId: string) {
  try {
    // Find organization by Stripe account ID
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.stripeAccountId, stripeAccountId))
      .limit(1);

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Retrieve the account to check its status
    const account = await stripe.accounts.retrieve(stripeAccountId);
    logger.info(`Stripe account details: ${JSON.stringify(account)}`);
    logger.info(
      `Stripe account details submitted: ${account.details_submitted}`,
    );
    logger.info(`Stripe account charges enabled: ${account.charges_enabled}`);

    if (!account.details_submitted || !account.charges_enabled) {
      throw new ValidationError('Stripe account onboarding is not complete');
    }

    // Update organization status to active
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        stripeAccountStatus: 'active',
        stripeAccountUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organization.id))
      .returning();

    return updatedOrg;
  } catch (error) {
    logger.error(`Error completing Stripe onboarding: ${error}`);
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to complete Stripe onboarding: ${error.message}`,
    );
  }
}

export async function refreshStripeOnboarding(organizationId: string) {
  try {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization || !organization.stripeAccountId) {
      throw new NotFoundError('Organization or Stripe account not found');
    }

    // Create a new account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: organization.stripeAccountId,
      refresh_url: `${env.FRONTEND_URL || 'http://localhost:3000'}/organizer/settings?tab=payments&refresh=true`,
      return_url: `${env.FRONTEND_URL || 'http://localhost:3000'}/organizer/settings?tab=payments&success=true`,
      type: 'account_onboarding',
    });

    return { onboardingUrl: accountLink.url };
  } catch (error) {
    logger.error(`Error refreshing Stripe onboarding: ${error}`);
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to refresh Stripe onboarding: ${error.message}`,
    );
  }
}

export async function updateStripeAccountStatus(
  input: StripeAccountStatusInput,
) {
  try {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripeAccountId) {
      throw new ValidationError('Organization has no Stripe account');
    }

    // Update the account status
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        stripeAccountStatus: input.status,
        stripeAccountUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, input.organizationId))
      .returning();

    return updatedOrg;
  } catch (error) {
    logger.error(`Error updating Stripe account status: ${error}`);
    if (error.name === 'NotFoundError' || error.name === 'ValidationError') {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to update Stripe account status: ${error.message}`,
    );
  }
}

export async function createCheckoutSession({
  amount,
  currency,
  organizationId,
  metadata,
  successUrl,
  cancelUrl,
  lineItems,
}: {
  amount: number;
  currency: string;
  organizationId: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  lineItems: Array<{
    price_data: {
      currency: string;
      product_data: {
        name: string;
      };
      unit_amount: number;
    };
    quantity: number;
  }>;
}) {
  try {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripeAccountId) {
      throw new ValidationError('Organization has no Stripe account');
    }

    if (organization.stripeAccountStatus !== 'active') {
      throw new ForbiddenError('Organization Stripe account is not active');
    }

    // Calculate platform fee from configuration
    const platformFeeConfig = await getPlatformConfigByKey('platform_fee');
    if (!platformFeeConfig) {
      throw new ValidationError('Platform fee configuration not found');
    }
    const platformFeePercent = parseInt(platformFeeConfig.value, 10);
    const platformFee = Math.round((amount * platformFeePercent) / 100);

    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: organization.stripeAccountId,
        },
        metadata,
      },
    });

    // Update order with payment intent ID
    await db
      .update(orders)
      .set({
        stripePaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id,
        updatedAt: new Date(),
      })
      .where(eq(orders.stripeCheckoutSessionId, session.id));

    return session;
  } catch (error) {
    logger.error(`Error creating checkout session: ${error}`);
    if (
      error.name === 'NotFoundError' ||
      error.name === 'ValidationError' ||
      error.name === 'ForbiddenError'
    ) {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to create checkout session: ${error.message}`,
    );
  }
}

// export async function createPaymentIntent({
//   amount,
//   currency,
//   organizationId,
//   metadata,
// }: {
//   amount: number;
//   currency: string;
//   organizationId: string;
//   metadata: Record<string, string>;
// }) {
//   try {
//     const [organization] = await db
//       .select()
//       .from(organizations)
//       .where(eq(organizations.id, organizationId))
//       .limit(1);

//     if (!organization) {
//       throw new Error('Organization not found');
//     }

//     if (!organization.stripeAccountId) {
//       throw new Error('Organization has no Stripe account');
//     }

//     if (organization.stripeAccountStatus !== 'active') {
//       throw new Error('Organization Stripe account is not active');
//     }

//     // Calculate platform fee (e.g., 10%)
//     const platformFeePercent = 10;
//     const platformFee = Math.round((amount * platformFeePercent) / 100);

//     // Create a payment intent
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount,
//       currency,
//       metadata,
//       application_fee_amount: platformFee,
//       transfer_data: {
//         destination: organization.stripeAccountId,
//       },
//     });

//     return paymentIntent;
//   } catch (error) {
//     logger.error(`Error creating payment intent: ${error}`);
//     throw error;
//   }
// }

export async function handleStripeWebhook(
  signature: string,
  rawBody: Buffer,
): Promise<void> {
  try {
    logger.info('Processing general Stripe webhook...');

    // Verify webhook signature using the general secret
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET, // Use general webhook secret
    );

    logger.info(`Received general Stripe webhook event type: ${event.type}`);

    // Handle different event types (excluding account.updated)
    switch (event.type) {
      // case 'account.updated': // This is handled by the connect webhook
      //   break;

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info(
          `Processing checkout session completed event for session ${session.id}`,
        );

        // Get payment intent from session
        if (session.payment_intent) {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            session.payment_intent as string,
          );

          // Update order with payment intent ID
          await db
            .update(orders)
            .set({
              stripePaymentIntentId: paymentIntent.id,
              updatedAt: new Date(),
            })
            .where(eq(orders.stripeCheckoutSessionId, session.id));
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info(
          `Processing checkout session expired event for session ${session.id}`,
        );
        // Handle session expiration (e.g., update order status)
        await db
          .update(orders)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(eq(orders.stripeCheckoutSessionId, session.id));
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logger.info(
          `Processing successful payment event for payment ${paymentIntent.id}`,
        );
        await handleSuccessfulPayment(
          paymentIntent.id,
          paymentIntent.metadata as any,
        );
        break;
      }

      // case 'payment_intent.payment_failed': {
      //   const paymentIntent = event.data.object as Stripe.PaymentIntent;
      //   logger.info(
      //     `Processing failed payment event for payment ${paymentIntent.id}`,
      //   );
      //   await handleFailedPayment(paymentIntent);
      //   break;
      // }

      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logger.info(
          `Processing canceled payment event for payment ${paymentIntent.id}`,
        );
        await handleCanceledPayment(paymentIntent.id);
        break;
      }

      default:
        logger.info(`Unhandled general event type: ${event.type}`);
    }

    logger.info(`Successfully processed general webhook event ${event.id}`);
  } catch (error) {
    logger.error(`Error handling general Stripe webhook: ${error}`);
    if (
      error.name === 'NotFoundError' ||
      error.name === 'ValidationError' ||
      error.name === 'ForbiddenError'
    ) {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to handle general Stripe webhook: ${error.message}`,
    );
  }
}

export async function handleStripeConnectWebhook(
  signature: string,
  rawBody: Buffer,
): Promise<void> {
  try {
    logger.info('Processing Stripe Connect webhook...');

    // Verify webhook signature using the Connect secret
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_CONNECT_WEBHOOK_SECRET, // Use Connect webhook secret
    );

    logger.info(`Received Stripe Connect webhook event type: ${event.type}`);

    // Handle account.updated event
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      logger.info(
        `Processing account update event for account ${account.id} from Connect webhook`,
      );
      await completeStripeOnboarding(account.id);
    } else {
      logger.warn(
        `Received non-account.updated event type on Connect webhook: ${event.type}`,
      );
      // Optionally handle other Connect-specific events here if needed
    }

    logger.info(`Successfully processed Connect webhook event ${event.id}`);
  } catch (error) {
    logger.error(`Error handling Stripe Connect webhook: ${error}`);
    if (
      error.name === 'NotFoundError' ||
      error.name === 'ValidationError' ||
      error.name === 'ForbiddenError'
    ) {
      throw error;
    }
    throw new AppError(
      500,
      `Failed to handle Stripe Connect webhook: ${error.message}`,
    );
  }
}

export async function getOrganizationWithStripeDetails(organizationId: string) {
  const [organization] = await db
    .select({
      id: organizations.id,
      stripeAccountId: organizations.stripeAccountId,
      stripeAccountStatus: organizations.stripeAccountStatus,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  if (!organization.stripeAccountId) {
    throw new ValidationError('Organization has no Stripe account');
  }

  return {
    ...organization,
    stripeAccountId: organization.stripeAccountId,
  };
}
