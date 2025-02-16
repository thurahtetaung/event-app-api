import { eq, and, inArray, count, or } from 'drizzle-orm';
import { db } from '../../db';
import {
  events,
  organizations,
  tickets,
  orders,
  orderItems,
  users,
  ticketTypes,
} from '../../db/schema';
import { TicketSchema, UpdateTicketStatusInput } from './tickets.schema';
import { checkEventOwner } from '../events/events.services';
import { createCheckoutSession } from '../stripe/stripe.services';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  isTicketReserved,
  reserveTicket,
  releaseTicket,
  releaseUserTickets,
} from '../../utils/redis';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors';

interface PurchaseTicketsInput {
  eventId: string;
  tickets: { ticketId: string }[];
}

export async function createTicketsForTicketType(ticketTypeId: string, quantity: number) {
  try {
    logger.info(`Creating ${quantity} tickets for ticket type ${ticketTypeId}`);

    // Get ticket type details
    const [ticketType] = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.id, ticketTypeId))
      .limit(1);

    if (!ticketType) {
      throw new NotFoundError('Ticket type not found');
    }

    // Create tickets in bulk
    const ticketsToCreate = Array.from({ length: quantity }, () => ({
      eventId: ticketType.eventId,
      ticketTypeId: ticketType.id,
      name: ticketType.name,
      price: ticketType.price,
      currency: 'usd',
      status: 'available' as const,
    }));

    const createdTickets = await db.insert(tickets).values(ticketsToCreate).returning();
    logger.info(`Successfully created ${createdTickets.length} tickets`);

    return createdTickets;
  } catch (error) {
    logger.error('Error creating tickets:', error);
    throw new AppError(500, 'Failed to create tickets');
  }
}

export async function updateTicketStatus(
  ticketId: string,
  data: UpdateTicketStatusInput,
) {
  try {
    logger.info(`Updating ticket ${ticketId} status to ${data.status}`);

    const updateData: Partial<typeof tickets.$inferInsert> = {
      status: data.status,
      updatedAt: new Date(),
    };

    if (data.userId) {
      updateData.userId = data.userId;
    }

    if (data.status === 'reserved') {
      updateData.reservedAt = new Date();
    } else if (data.status === 'booked') {
      updateData.bookedAt = new Date();
    }

    const [updatedTicket] = await db
      .update(tickets)
      .set(updateData)
      .where(eq(tickets.id, ticketId))
      .returning();

    if (!updatedTicket) {
      throw new NotFoundError('Ticket not found');
    }

    logger.info(`Successfully updated ticket ${ticketId} status`);
    return updatedTicket;
  } catch (error) {
    logger.error('Error updating ticket status:', error);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update ticket status');
  }
}

export async function getAvailableTickets(eventId: string, ticketTypeId: string) {
  try {
    logger.info(`Getting available tickets for event ${eventId} and ticket type ${ticketTypeId}`);

    const availableTickets = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(tickets.ticketTypeId, ticketTypeId),
          eq(tickets.status, 'available')
        )
      );

    logger.info(`Found ${availableTickets.length} available tickets`);
    return availableTickets;
  } catch (error) {
    logger.error('Error getting available tickets:', error);
    throw new AppError(500, 'Failed to get available tickets');
  }
}

export async function getTicketsByUser(userId: string) {
  try {
    logger.info(`Getting tickets for user ${userId}`);

    const userTickets = await db
      .select({
        ticket: tickets,
        event: events,
        ticketType: ticketTypes,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .where(eq(tickets.userId, userId));

    logger.info(`Found ${userTickets.length} tickets for user`);
    return userTickets;
  } catch (error) {
    logger.error('Error getting user tickets:', error);
    throw new AppError(500, 'Failed to get user tickets');
  }
}

export async function purchaseTickets(
  userId: string,
  input: PurchaseTicketsInput,
) {
  try {
    // Using a transaction to ensure data consistency
    return await db.transaction(async (tx) => {
      // Step 1: Verify the event exists and is published
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, input.eventId))
        .limit(1);

      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status !== 'published') {
        throw new Error('Event is not published');
      }

      // Step 2: Check if any tickets are already reserved
      for (const ticket of input.tickets) {
        if (await isTicketReserved(ticket.ticketId)) {
          throw new Error('Some tickets are already reserved');
        }
      }

      // Step 3: Get and verify ticket availability
      const selectedTickets = await tx
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.eventId, input.eventId),
            inArray(
              tickets.id,
              input.tickets.map((t) => t.ticketId),
            ),
            eq(tickets.status, 'available'),
          ),
        );

      if (selectedTickets.length !== input.tickets.length) {
        throw new Error('Some tickets are not available');
      }

      // Step 4: Reserve tickets in Redis
      const reservationPromises = selectedTickets.map((ticket) =>
        reserveTicket(ticket.id, userId),
      );
      const reservationResults = await Promise.all(reservationPromises);

      if (reservationResults.some((result) => !result)) {
        // If any reservation failed, release any successful reservations
        await releaseUserTickets(userId);
        throw new Error('Failed to reserve tickets');
      }

      // Step 5: Calculate total amount in cents
      const totalAmount = selectedTickets.reduce((sum: number, ticket) => sum + ticket.price, 0);

      // Step 7: Create pending order
      const [order] = await tx
        .insert(orders)
        .values({
          userId,
          eventId: event.id,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info(`Order created: ${JSON.stringify(order)}`);

      // Step 8: Create order items
      const orderItemsResult = await tx
        .insert(orderItems)
        .values(
          selectedTickets.map((ticket) => ({
            orderId: order.id,
            ticketId: ticket.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        )
        .returning();
      logger.info(`Order items created: ${JSON.stringify(orderItemsResult)}`);

      // Step 6: Create Stripe Checkout session
      const session = await createCheckoutSession({
        amount: totalAmount,
        currency: 'usd',
        organizationId: event.organizationId,
        metadata: {
          orderId: order.id,
          eventId: event.id,
          userId,
          ticketIds: selectedTickets.map((t) => t.id).join(','),
        },
        successUrl: `${env.API_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.API_URL}/checkout/cancel`,
      });

      // Update order with checkout session ID
      await tx
        .update(orders)
        .set({
          stripeCheckoutSessionId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      logger.info(`Stripe session: ${JSON.stringify(session)}`);

      // Return both the order details and the checkout URL
      return {
        order,
        checkoutUrl: session.url,
      };
    });
  } catch (error) {
    // If anything fails, make sure to release any reserved tickets
    await releaseUserTickets(userId);
    logger.error(`Error purchasing tickets: ${error}`);
    throw error;
  }
}

export async function handlePaymentIntentCreated(
  payment_intent_id: string,
  metadata: {
    orderId: string;
    eventId: string;
    userId: string;
    ticketIds: string[];
  },
) {
  try {
    // Update the order with payment intent id
    const [order] = await db
      .update(orders)
      .set({
        stripePaymentIntentId: payment_intent_id,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, metadata.orderId))
      .returning();
    logger.info(`Order updated with payment intent id: ${payment_intent_id}`);
    return order;
  } catch (error) {
    logger.error(`Error handling payment intent created: ${error}`);
    throw error;
  }
}

export async function handleSuccessfulPayment(
  paymentIntentId: string,
  metadata: {
    orderId: string;
    eventId: string;
    userId: string;
    ticketIds: string[];
  },
) {
  try {
    logger.info(`Handling successful payment for payment ${paymentIntentId}`);
    // Update order status
    const [order] = await db
      .update(orders)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(
        or(
          eq(orders.stripePaymentIntentId, paymentIntentId),
          eq(orders.id, metadata.orderId),
        ),
      )
      .returning();

    if (order) {
      logger.info(
        `Order updated with status completed: ${JSON.stringify(order)}`,
      );
      // Get order items
      const orderItemsList = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      // Update ticket status to booked and release Redis reservations
      await Promise.all(
        orderItemsList.map(async (item) => {
          await releaseTicket(item.ticketId);
          await db
            .update(tickets)
            .set({
              status: 'booked',
              userId: metadata.userId,
              updatedAt: new Date(),
            })
            .where(eq(tickets.id, item.ticketId));
        }),
      );
    }

    return order;
  } catch (error) {
    logger.error(`Error handling successful payment: ${error}`);
    throw error;
  }
}

export async function handleFailedPayment(paymentIntentId: string) {
  try {
    return await db.transaction(async (tx) => {
      // Get the order
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntentId))
        .limit(1);

      if (!order) {
        throw new Error('Order not found');
      }

      // Get order items
      const orderItemsList = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      // Release Redis reservations
      await Promise.all(
        orderItemsList.map(async (item) => {
          await releaseTicket(item.ticketId);
        }),
      );

      // Update order status
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
        .returning();

      return updatedOrder;
    });
  } catch (error) {
    logger.error(`Error handling failed payment: ${error}`);
    throw error;
  }
}
