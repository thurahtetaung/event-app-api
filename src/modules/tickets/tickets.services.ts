import { eq, and, inArray, count, or, sql } from 'drizzle-orm';
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
  getTicketReservation,
} from '../../utils/redis';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors';
import { checkOrganizationAccess } from '../organizations/organizations.services';
import { DatabaseError } from 'pg-protocol/dist';

interface PurchaseTicketsInput {
  eventId: string;
  tickets: Array<{ ticketTypeId: string; quantity: number }>;
}

interface ReserveTicketsInput {
  eventId: string;
  tickets: Array<{ ticketTypeId: string; quantity: number }>;
}

interface ReservedTicket {
  id: string;
  ticketTypeId: string;
  name: string;
  price: number;
  quantity: number;
  ticketIds: string[];
}

export async function createTicketsForTicketType(
  ticketTypeId: string,
  quantity: number,
) {
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

    const createdTickets = await db
      .insert(tickets)
      .values(ticketsToCreate)
      .returning();
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

export async function getAvailableTickets(
  eventId: string,
  ticketTypeId: string,
) {
  try {
    logger.info(
      `Getting available tickets for event ${eventId} and ticket type ${ticketTypeId}`,
    );

    const availableTickets = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.eventId, eventId),
          eq(tickets.ticketTypeId, ticketTypeId),
          eq(tickets.status, 'available'),
        ),
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
        organization: organizations,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .leftJoin(organizations, eq(events.organizationId, organizations.id))
      .where(eq(tickets.userId, userId));

    // Transform the result to match the expected format
    const formattedTickets = userTickets.map(
      ({ ticket, event, ticketType, organization }) => ({
        ticket,
        event: {
          id: event.id,
          title: event.title,
          startTimestamp: event.startTimestamp,
          endTimestamp: event.endTimestamp,
          venue: event.venue,
          address: event.address,
          isOnline: event.isOnline,
          coverImage: event.coverImage,
          organization: organization
            ? {
                name: organization.name,
              }
            : undefined,
        },
        ticketType,
      }),
    );

    logger.info(`Found ${formattedTickets.length} tickets for user`);
    return formattedTickets;
  } catch (error) {
    logger.error(`Error getting user tickets: ${error}`);
    throw new AppError(500, 'Failed to get user tickets');
  }
}

export async function purchaseTickets(
  userId: string,
  input: PurchaseTicketsInput & { specificTicketIds?: string[] },
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

      let selectedTickets = [];

      // If specific ticket IDs were provided, use those exact tickets
      // This ensures we use exactly the same tickets that were reserved
      if (input.specificTicketIds && input.specificTicketIds.length > 0) {
        logger.info(
          `Using ${input.specificTicketIds.length} specific ticket IDs`,
        );

        // Get tickets by their exact IDs
        const exactTickets = await tx
          .select({
            ticket: tickets,
            ticketType: ticketTypes,
          })
          .from(tickets)
          .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
          .where(inArray(tickets.id, input.specificTicketIds));

        if (exactTickets.length !== input.specificTicketIds.length) {
          throw new Error(
            `Some specified tickets are no longer available. Expected ${input.specificTicketIds.length}, found ${exactTickets.length}`,
          );
        }

        // Ensure each ticket is either available or already reserved by this user
        await Promise.all(
          exactTickets.map(async ({ ticket }) => {
            const reservation = await getTicketReservation(ticket.id);
            if (
              ticket.status !== 'available' &&
              (!reservation || reservation !== userId)
            ) {
              throw new Error(
                `Ticket ${ticket.id} is not available and not reserved by you`,
              );
            }
          }),
        );

        selectedTickets = exactTickets;
      } else {
        // Step 2: Get reserved tickets for each ticket type
        selectedTickets = [];
        const MAX_TICKETS_PER_ORDER = 10; // Global limit
        let totalTicketsRequested = 0;

        for (const ticketRequest of input.tickets) {
          totalTicketsRequested += ticketRequest.quantity;
          if (totalTicketsRequested > MAX_TICKETS_PER_ORDER) {
            throw new Error(
              `Maximum ${MAX_TICKETS_PER_ORDER} tickets allowed per order`,
            );
          }

          // CHECK IF TICKETS ARE ALREADY RESERVED BY THIS USER
          // First get available tickets of this type
          const availableTickets = await tx
            .select({
              ticket: tickets,
              ticketType: ticketTypes,
            })
            .from(tickets)
            .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
            .where(
              and(
                eq(tickets.eventId, input.eventId),
                eq(tickets.ticketTypeId, ticketRequest.ticketTypeId),
                eq(tickets.status, 'available'),
              ),
            )
            .limit(ticketRequest.quantity * 3); // Fetch more to check reservations

          if (availableTickets.length < ticketRequest.quantity) {
            throw new Error(
              `Not enough tickets available for type ${ticketRequest.ticketTypeId}`,
            );
          }

          // Find tickets that are reserved by THIS user
          const userReservedTickets = await Promise.all(
            availableTickets.map(async (ticketObj) => {
              const isReservedByUser =
                (await getTicketReservation(ticketObj.ticket.id)) === userId;
              return {
                ...ticketObj,
                isReservedByUser,
              };
            }),
          );

          // Prioritize tickets reserved by this user
          const reservedByUser = userReservedTickets.filter(
            (t) => t.isReservedByUser,
          );
          const otherAvailable = userReservedTickets.filter(
            (t) => !t.isReservedByUser,
          );

          // If we don't have enough reserved by this user, we'll use other available tickets
          const ticketsToUse = [...reservedByUser, ...otherAvailable].slice(
            0,
            ticketRequest.quantity,
          );

          if (ticketsToUse.length < ticketRequest.quantity) {
            throw new Error(
              `Not enough tickets available for type ${ticketRequest.ticketTypeId}`,
            );
          }

          // Log information about the selected tickets
          const reservedCount = reservedByUser.length;
          const newCount = ticketRequest.quantity - reservedCount;

          logger.info(
            `Using ${reservedCount} tickets already reserved by user and ${newCount} new tickets for type ${ticketRequest.ticketTypeId}`,
          );

          // Reserve any new tickets that weren't already reserved
          await Promise.all(
            ticketsToUse.map(async ({ ticket, isReservedByUser }) => {
              if (!isReservedByUser) {
                await reserveTicket(ticket.id, userId);
              }
            }),
          );

          // Remove the isReservedByUser property before adding to selectedTickets
          selectedTickets.push(
            ...ticketsToUse.map(({ ticket, ticketType }) => ({
              ticket,
              ticketType,
            })),
          );
        }
      }

      // Check if all tickets are free
      const allTicketsAreFree = selectedTickets.every(
        ({ ticketType }) => ticketType.type === 'free',
      );

      if (allTicketsAreFree) {
        // For free tickets, directly confirm the purchase
        const [order] = await tx
          .insert(orders)
          .values({
            userId,
            eventId: event.id,
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // Create order items and update ticket status
        await tx.insert(orderItems).values(
          selectedTickets.map(({ ticket }) => ({
            orderId: order.id,
            ticketId: ticket.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );

        // Update ticket status to booked and generate access tokens
        await Promise.all(
          selectedTickets.map(async ({ ticket }) => {
            logger.info(
              `Releasing free ticket ${ticket.id} from Redis reservations before marking as booked`,
            );
            await releaseTicket(ticket.id);
            logger.info(`Updating free ticket ${ticket.id} status to 'booked'`);
            await tx
              .update(tickets)
              .set({
                status: 'booked',
                userId,
                bookedAt: new Date(),
                updatedAt: new Date(),
                accessToken: sql`uuid_generate_v4()`,
              })
              .where(eq(tickets.id, ticket.id));
          }),
        );

        return {
          success: true,
          message: 'Free tickets confirmed successfully',
          order,
          isFree: true,
        };
      }

      // For paid tickets, proceed with Stripe checkout
      // Step 4: Group tickets by type and calculate totals
      const ticketsByType = selectedTickets.reduce(
        (acc, { ticket, ticketType }) => {
          const key = ticketType.id;
          if (!acc[key]) {
            acc[key] = {
              name: ticketType.name,
              unitPrice: Number(ticket.price),
              quantity: 0,
              tickets: [],
            };
          }
          acc[key].quantity += 1;
          acc[key].tickets.push(ticket);
          return acc;
        },
        {} as Record<
          string,
          {
            name: string;
            unitPrice: number;
            quantity: number;
            tickets: (typeof tickets.$inferSelect)[];
          }
        >,
      );

      // Step 5: Create pending order
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

      // Step 6: Create order items
      await tx.insert(orderItems).values(
        selectedTickets.map(({ ticket }) => ({
          orderId: order.id,
          ticketId: ticket.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );

      // Step 7: Create Stripe Checkout session with proper line items and ticket IDs
      const session = await createCheckoutSession({
        amount: selectedTickets.reduce(
          (sum, { ticket }) => sum + Number(ticket.price),
          0,
        ),
        currency: 'usd',
        organizationId: event.organizationId,
        metadata: {
          orderId: order.id,
          eventId: event.id,
          userId,
          ticketIds: JSON.stringify(
            selectedTickets.map(({ ticket }) => ticket.id),
          ),
        },
        successUrl: `${env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.FRONTEND_URL}/checkout/cancelled`,
        lineItems: Object.values(ticketsByType).map(
          ({ name, unitPrice, quantity }) => ({
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${event.title} - ${name}`,
                description: `Ticket price: $${(unitPrice / 100).toFixed(2)}`,
              },
              unit_amount: unitPrice,
            },
            quantity: quantity,
            adjustable_quantity: {
              enabled: false,
            },
          }),
        ),
      });

      // Update order with checkout session ID
      await tx
        .update(orders)
        .set({
          stripeCheckoutSessionId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      // Return both the order details and the checkout URL
      return {
        success: true,
        order,
        checkoutUrl: session.url,
        isFree: false,
      };
    });
  } catch (error) {
    // If anything fails, make sure to release any reserved tickets
    await releaseUserTickets(userId);
    logger.error(`Error purchasing tickets: ${error}`);
    throw error;
  }
}

export async function handleSuccessfulPayment(
  paymentIntentId: string,
  metadata: {
    orderId: string;
    eventId: string;
    userId: string;
    ticketIds: string;
  },
) {
  try {
    logger.info(`Handling successful payment for payment ${paymentIntentId}`);

    // Parse ticket IDs from metadata
    const ticketIds = JSON.parse(metadata.ticketIds) as string[];

    return await db.transaction(async (tx) => {
      // Update order status
      const [order] = await tx
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

      if (!order) {
        throw new Error('Order not found');
      }

      // Get the tickets that were reserved during checkout
      const selectedTickets = await tx
        .select()
        .from(tickets)
        .where(inArray(tickets.id, ticketIds));

      if (selectedTickets.length !== ticketIds.length) {
        throw new Error('Some selected tickets are no longer available');
      }

      // Create order items for the specific tickets
      await tx.insert(orderItems).values(
        selectedTickets.map((ticket) => ({
          orderId: order.id,
          ticketId: ticket.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );

      // Update ticket status to booked and generate access tokens
      await Promise.all(
        selectedTickets.map(async (ticket) => {
          // Check if ticket is actually reserved in Redis before trying to release it
          const isReserved = await isTicketReserved(ticket.id);
          if (isReserved) {
            logger.info(
              `Releasing ticket ${ticket.id} from Redis reservations before marking as booked`,
            );
            await releaseTicket(ticket.id);
          } else {
            logger.info(
              `Ticket ${ticket.id} is not reserved in Redis, no need to release`,
            );
          }

          logger.info(`Updating ticket ${ticket.id} status to 'booked'`);
          await tx
            .update(tickets)
            .set({
              status: 'booked',
              userId: metadata.userId,
              bookedAt: new Date(),
              updatedAt: new Date(),
              accessToken: sql`uuid_generate_v4()`,
            })
            .where(eq(tickets.id, ticket.id));
        }),
      );

      return order;
    });
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

export async function reserveTickets(
  userId: string,
  input: ReserveTicketsInput,
) {
  try {
    return await db.transaction(async (tx) => {
      // Get available tickets with ticket type details
      const availableTickets = await tx
        .select({
          ticket: tickets,
          ticketType: ticketTypes,
        })
        .from(tickets)
        .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
        .where(
          and(
            inArray(
              tickets.ticketTypeId,
              input.tickets.map((t) => t.ticketTypeId),
            ),
            eq(tickets.status, 'available'),
          ),
        )
        .orderBy(tickets.id);

      // Check which tickets are not already reserved in Redis
      const ticketReservationChecks = await Promise.all(
        availableTickets.map(async (ticketObj) => {
          const isReserved = await isTicketReserved(ticketObj.ticket.id);
          return {
            ticketObj,
            isReserved,
          };
        }),
      );

      const trulyAvailableTickets = availableTickets.filter(
        (_, index) => !ticketReservationChecks[index].isReserved,
      );

      // Group tickets by ticket type using a Map
      const ticketsByType = new Map();
      trulyAvailableTickets.forEach(
        (ticket: {
          ticket: typeof tickets.$inferSelect;
          ticketType: typeof ticketTypes.$inferSelect;
        }) => {
          const typeId = ticket.ticketType.id;
          if (!ticketsByType.has(typeId)) {
            ticketsByType.set(typeId, []);
          }
          ticketsByType.get(typeId).push(ticket);
        },
      );

      const reservedTickets: ReservedTicket[] = [];

      // Process each ticket request
      for (const ticketRequest of input.tickets) {
        const availableForType =
          ticketsByType.get(ticketRequest.ticketTypeId) || [];

        if (availableForType.length < ticketRequest.quantity) {
          await releaseUserTickets(userId);
          throw new Error(
            `Not enough tickets available for type ${ticketRequest.ticketTypeId}. Requested: ${ticketRequest.quantity}, Available: ${availableForType.length}`,
          );
        }

        // Take only the number of tickets we need
        const ticketsToReserve = availableForType.slice(
          0,
          ticketRequest.quantity,
        );

        // Reserve all tickets at once
        const reservationResults = await Promise.all(
          ticketsToReserve.map(
            ({ ticket }: { ticket: typeof tickets.$inferSelect }) =>
              reserveTicket(ticket.id, userId),
          ),
        );

        if (reservationResults.some((result) => !result)) {
          await releaseUserTickets(userId);
          throw new Error('Failed to reserve tickets');
        }

        // Add successfully reserved tickets to our list with ALL individual ticket IDs
        const ticketType = ticketsToReserve[0].ticketType;
        reservedTickets.push({
          id: ticketType.id, // This is the ticket type ID
          ticketTypeId: ticketType.id,
          name: ticketType.name,
          price: Number(ticketType.price) / 100,
          quantity: ticketRequest.quantity,
          // Store ALL individual ticket IDs
          ticketIds: ticketsToReserve.map(
            (item: { ticket: typeof tickets.$inferSelect }) => item.ticket.id,
          ),
        });
      }

      return {
        success: true,
        message: 'Tickets reserved successfully',
        tickets: reservedTickets,
      };
    });
  } catch (error) {
    logger.error('Error reserving tickets:', error);
    throw error;
  }
}

export async function getTicketAccessToken(
  userId: string,
  eventId: string,
  ticketId: string,
) {
  try {
    logger.info(
      `Getting access token for ticket ${ticketId} of event ${eventId}`,
    );

    // Get the ticket with its access token
    const [ticket] = await db
      .select({
        id: tickets.id,
        status: tickets.status,
        userId: tickets.userId,
        accessToken: tickets.accessToken,
        event: {
          id: events.id,
          organizationId: events.organizationId,
        },
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.eventId, eventId),
          eq(tickets.status, 'booked'),
        ),
      )
      .limit(1);

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Check if the user owns the ticket
    if (ticket.userId !== userId) {
      throw new ForbiddenError('You do not have access to this ticket');
    }

    // Check if the ticket has an access token
    if (!ticket.accessToken) {
      throw new ValidationError('Ticket access token not available');
    }

    return {
      accessToken: ticket.accessToken,
    };
  } catch (error) {
    logger.error(`Error getting ticket access token: ${error}`);
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw new AppError(500, 'Failed to get ticket access token');
  }
}

/**
 * Gets ticket details without requiring access token verification
 * This is used for the ticket verification page to display basic info before validation
 */
export async function getTicketDetails(eventId: string, ticketId: string) {
  try {
    logger.info(`Getting details for ticket ${ticketId} for event ${eventId}`);

    // Get the ticket with its details including user and ticket type info
    const [ticketData] = await db
      .select({
        ticket: {
          id: tickets.id,
          status: tickets.status,
          isValidated: tickets.isValidated,
          validatedAt: tickets.validatedAt,
          bookedAt: tickets.updatedAt, // Use updatedAt as bookedAt since that's when it's marked as booked
          price: tickets.price,
        },
        ticketType: {
          id: ticketTypes.id,
          name: ticketTypes.name,
          type: ticketTypes.type,
        },
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
        event: {
          id: events.id,
          title: events.title,
          startTimestamp: events.startTimestamp,
          endTimestamp: events.endTimestamp,
          venue: events.venue,
          address: events.address,
        },
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.eventId, eventId),
          eq(tickets.status, 'booked'),
        ),
      )
      .limit(1);

    if (!ticketData) {
      throw new NotFoundError('Ticket not found');
    }

    return {
      success: true,
      ticket: {
        ...ticketData.ticket,
        ticketType: ticketData.ticketType,
        user: ticketData.user,
        event: ticketData.event,
      },
    };
  } catch (error) {
    logger.error(`Error getting ticket details: ${error}`);
    if (error instanceof DatabaseError && error.code === '22P02') {
      throw new ValidationError('Invalid ticket ID');
    }
    throw error;
  }
}

/**
 * Verifies a ticket using its access token and returns ticket details
 */
export async function verifyTicketWithAccessToken(
  eventId: string,
  ticketId: string,
  accessToken: string,
) {
  try {
    logger.info(
      `Verifying ticket ${ticketId} for event ${eventId} with access token`,
    );

    // Get the ticket with its details including user and ticket type info
    const [ticketData] = await db
      .select({
        ticket: {
          id: tickets.id,
          status: tickets.status,
          isValidated: tickets.isValidated,
          validatedAt: tickets.validatedAt,
          accessToken: tickets.accessToken,
        },
        ticketType: {
          id: ticketTypes.id,
          name: ticketTypes.name,
          type: ticketTypes.type,
        },
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
        event: {
          id: events.id,
          title: events.title,
          organizationId: events.organizationId,
        },
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.eventId, eventId),
          eq(tickets.status, 'booked'),
        ),
      )
      .limit(1);

    if (!ticketData) {
      throw new NotFoundError('Ticket not found');
    }

    // Verify access token
    if (ticketData.ticket.accessToken !== accessToken) {
      throw new ForbiddenError('Invalid access token');
    }

    // Return ticket details without the access token for security
    const { accessToken: _, ...ticketDetails } = ticketData.ticket;

    return {
      success: true,
      ticket: {
        ...ticketDetails,
        ticketType: ticketData.ticketType,
        user: ticketData.user,
        event: ticketData.event,
      },
    };
  } catch (error) {
    logger.error(`Error verifying ticket: ${error}`);
    throw error;
  }
}

/**
 * Validates a ticket by marking it as validated and updating relevant fields
 */
export async function validateTicket(
  organizerId: string,
  eventId: string,
  ticketId: string,
  accessToken: string,
) {
  try {
    logger.info(`Validating ticket ${ticketId} for event ${eventId}`);

    // First verify the ticket and access token
    let ticketData;
    try {
      ticketData = await verifyTicketWithAccessToken(
        eventId,
        ticketId,
        accessToken,
      );
    } catch (error) {
      logger.error(`Error in verifyTicketWithAccessToken: ${error}`);
      // Make sure to re-throw NotFoundError and ForbiddenError
      throw error;
    }

    // Check if ticket is already validated
    if (ticketData.ticket.isValidated) {
      return {
        success: true,
        message: 'Ticket has already been validated',
        ticket: {
          id: ticketData.ticket.id,
          isValidated: ticketData.ticket.isValidated,
          validatedAt: ticketData.ticket.validatedAt,
        },
      };
    }

    // Check if user has access to the organization that owns the event
    try {
      await checkOrganizationAccess(
        organizerId,
        ticketData.ticket.event.organizationId,
      );
    } catch (error) {
      logger.error(
        `Organization access check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Specifically check for and re-throw ForbiddenError
      if (error instanceof ForbiddenError) {
        throw new ForbiddenError(
          `You don't have permission to validate tickets for this event: ${error.message}`,
        );
      }
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new AppError(
        500,
        `Organization access check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Update ticket status to validated and generate access token
    await db
      .update(tickets)
      .set({
        status: 'booked',
        isValidated: true,
        validatedAt: new Date(),
        accessToken: sql`uuid_generate_v4()`,
      })
      .where(eq(tickets.id, ticketId));

    return {
      success: true,
      message: 'Ticket validated successfully',
      ticket: {
        id: ticketData.ticket.id,
        isValidated: ticketData.ticket.isValidated,
        validatedAt: ticketData.ticket.validatedAt,
      },
    };
  } catch (error) {
    logger.error(`Error validating ticket: ${error}`);
    throw error;
  }
}
