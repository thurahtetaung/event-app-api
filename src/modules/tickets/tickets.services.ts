import { eq, and, inArray, count, or } from 'drizzle-orm';
import { db } from '../../db';
import {
  events,
  organizations,
  tickets,
  orders,
  orderItems,
  users,
} from '../../db/schema';
import { TicketGenerationInput, PurchaseTicketsInput } from './tickets.schema';
import { checkEventOrganizer } from '../events/events.services';
import { createCheckoutSession } from '../stripe/stripe.services';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  isTicketReserved,
  reserveTicket,
  releaseTicket,
  releaseUserTickets,
} from '../../utils/redis';
import redisClient from '../../utils/redis';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors';

function generateSeatNumber(
  index: number,
  config: TicketGenerationInput['sections'][0]['seatNumbering'],
): string {
  switch (config.type) {
    case 'numbered':
      const number = (config.startFrom || 1) + index;
      return `${config.prefix || ''}${number}${config.suffix || ''}`;
    case 'alphabet':
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const letter = alphabet[index % 26];
      const row = Math.floor(index / 26);
      return `${config.prefix || ''}${row > 0 ? row : ''}${letter}${config.suffix || ''}`;
    case 'custom':
      return `${config.prefix || ''}${index + 1}${config.suffix || ''}`;
    default:
      return `${index + 1}`;
  }
}

export async function generateTickets(
  userId: string,
  input: TicketGenerationInput,
) {
  try {
    logger.info('Starting ticket generation process...');

    // Get user role and check permissions
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Only check event organizer permission if user is not an admin
    if (user?.role !== 'admin') {
      logger.debug(
        `Checking organizer permissions for user ${userId} on event ${input.eventId}...`,
      );
      await checkEventOrganizer(userId, input.eventId);
      logger.debug('Organizer permissions verified');
    } else {
      logger.debug('Admin user detected, bypassing organizer check');
    }

    // Get event capacity and existing ticket count
    const [event] = await db
      .select({
        capacity: events.capacity,
      })
      .from(events)
      .where(eq(events.id, input.eventId))
      .limit(1);

    if (!event) {
      logger.error(`Event not found: ${input.eventId}`);
      throw new Error('Event not found');
    }

    const [ticketCount] = await db
      .select({ count: count() })
      .from(tickets)
      .where(eq(tickets.eventId, input.eventId));

    // Calculate total new tickets to be generated
    const newTicketsCount = input.sections.reduce(
      (sum, section) => sum + section.numberOfSeats,
      0,
    );

    // Check if total tickets would exceed capacity
    if (ticketCount.count + newTicketsCount > event.capacity) {
      logger.error(
        `Ticket generation would exceed event capacity. Current tickets: ${ticketCount.count}, New tickets: ${newTicketsCount}, Capacity: ${event.capacity}`,
      );
      throw new Error(
        `Cannot generate tickets: would exceed event capacity of ${event.capacity}`,
      );
    }

    // Generate tickets for each section
    logger.info(
      `Generating tickets for ${input.sections.length} sections in event ${input.eventId}...`,
    );

    // Start a transaction to ensure all operations are atomic
    return await db.transaction(async (tx) => {
      logger.info('Starting database transaction for ticket generation...');

      // Generate and insert tickets for each section
      const ticketsToInsert = input.sections.flatMap((section) => {
        const sectionTickets = [];
        for (let i = 0; i < section.numberOfSeats; i++) {
          sectionTickets.push({
            eventId: input.eventId,
            name: section.name,
            price: section.price,
            currency: section.currency,
            seatNumber: generateSeatNumber(i, section.seatNumbering),
            status: 'available' as const,
          });
        }
        return sectionTickets;
      });

      try {
        // Insert all tickets
        const result = await tx
          .insert(tickets)
          .values(ticketsToInsert)
          .returning();
        logger.info(
          `Ticket generation completed successfully, generated ${result.length} tickets`,
        );
        return result;
      } catch (error) {
        // Check if it's a unique constraint violation
        if (
          error.code === '23505' &&
          error.constraint === 'tickets_event_seat_unique'
        ) {
          logger.error(
            `Duplicate seat numbers detected for event ${input.eventId}`,
          );
          throw new Error(
            'Some seat numbers already exist for this event. Please check your seat numbering configuration to avoid duplicates.',
          );
        }
        throw error;
      }
    });
  } catch (error) {
    logger.error(`Error generating tickets: ${error}`);
    throw error;
  }
}

// export async function purchaseTickets(
//   userId: string,
//   input: PurchaseTicketsInput,
// ) {
//   try {
//     // Start a transaction
//     return await db.transaction(async (tx) => {
//       // Get the event
//       const [event] = await tx
//         .select()
//         .from(events)
//         .where(eq(events.id, input.eventId))
//         .limit(1);

//       if (!event) {
//         throw new Error('Event not found');
//       }

//       if (!event.isPublished) {
//         throw new Error('Event is not published');
//       }

//       // Check if any of the tickets are already reserved in Redis
//       for (const ticket of input.tickets) {
//         if (await isTicketReserved(ticket.ticketId)) {
//           throw new Error('Some tickets are already reserved');
//         }
//       }

//       // Get the tickets and verify they are available
//       const selectedTickets = await tx
//         .select()
//         .from(tickets)
//         .where(
//           and(
//             eq(tickets.eventId, input.eventId),
//             inArray(
//               tickets.id,
//               input.tickets.map((t) => t.ticketId),
//             ),
//             eq(tickets.status, 'available'),
//           ),
//         );

//       if (selectedTickets.length !== input.tickets.length) {
//         throw new Error('Some tickets are not available');
//       }

//       // Reserve tickets in Redis
//       const reservationPromises = selectedTickets.map((ticket) =>
//         reserveTicket(ticket.id, userId),
//       );
//       const reservationResults = await Promise.all(reservationPromises);

//       if (reservationResults.some((result) => !result)) {
//         // If any reservation failed, release any successful reservations
//         await releaseUserTickets(userId);
//         throw new Error('Failed to reserve tickets');
//       }

//       // Calculate total amount
//       const totalAmount = selectedTickets.reduce(
//         (sum, ticket) => sum + ticket.price,
//         0,
//       );

//       // Create payment intent
//       const paymentIntent = await createPaymentIntent({
//         amount: totalAmount,
//         currency: 'usd', // TODO: Make this configurable
//         organizationId: event.organizationId,
//         metadata: {
//           eventId: event.id,
//           userId,
//           ticketIds: selectedTickets.map((t) => t.id).join(','),
//         },
//       });

//       // Create order
//       const [order] = await tx
//         .insert(orders)
//         .values({
//           userId,
//           eventId: event.id,
//           stripePaymentId: paymentIntent.id,
//           status: 'pending',
//         })
//         .returning();

//       // Create order items
//       await tx.insert(orderItems).values(
//         selectedTickets.map((ticket) => ({
//           orderId: order.id,
//           ticketId: ticket.id,
//         })),
//       );

//       return {
//         order,
//         clientSecret: paymentIntent.client_secret,
//       };
//     });
//   } catch (error) {
//     // Release any reserved tickets on error
//     await releaseUserTickets(userId);
//     logger.error(`Error purchasing tickets: ${error}`);
//     throw error;
//   }
// }

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

      if (!event.isPublished) {
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
      const totalAmount =
        selectedTickets.reduce((sum, ticket) => sum + ticket.price, 0) * 100;

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
