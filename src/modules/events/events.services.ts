import { eq, InferInsertModel } from 'drizzle-orm';
import { db } from '../../db';
import { events, ticketTypes, users, organizations, tickets } from '../../db/schema';
import { logger } from '../../utils/logger';
import { count, desc } from 'drizzle-orm';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../utils/errors';
import { EventSchema, TicketTypeSchema } from './events.schema';
import { createTicketsForTicketType } from '../tickets/tickets.services';
import { sql } from 'drizzle-orm';
import { and } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';

// Permission check utility
export async function checkEventOwner(
  userId: string,
  eventId: string,
  userRole?: string,
) {
  logger.debug(
    `Checking event owner permissions for user ${userId} and event ${eventId}`,
  );
  // Allow admins to bypass checks
  if (userRole === 'admin') {
    const event = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event.length) {
      logger.warn(`Event not found during permission check: ${eventId}`);
      throw new NotFoundError('Event not found');
    }

    logger.debug(
      `Admin permission check passed for user ${userId} and event ${eventId}`,
    );
    return event[0];
  }

  // First get the event and its organization
  const event = await db
    .select({
      event: events,
      organization: organizations,
    })
    .from(events)
    .innerJoin(
      organizations,
      eq(events.organizationId, organizations.id),
    )
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event.length) {
    logger.warn(`Event not found during permission check: ${eventId}`);
    throw new NotFoundError('Event not found');
  }

  // Check if user owns the organization
  if (event[0].organization.ownerId !== userId) {
    logger.warn(
      `Unauthorized event modification attempt by user ${userId} for event ${eventId}`,
    );
    throw new ForbiddenError('Unauthorized to modify this event');
  }

  logger.debug(
    `Event owner permission check passed for user ${userId} and event ${eventId}`,
  );
  return event[0].event;
}

export async function createEvent(data: EventSchema) {
  try {
    logger.info('Creating new event');
    logger.debug(`Event data: ${JSON.stringify(data)}`);

    // Validate the data
    if (!data.title || !data.category || !data.organizationId) {
      throw new ValidationError('Missing required fields');
    }

    // Ensure category is treated as text
    const eventData = {
      title: data.title,
      description: data.description,
      startTimestamp: new Date(data.startTimestamp),
      endTimestamp: new Date(data.endTimestamp),
      venue: data.venue,
      address: data.address,
      category: data.category,
      isOnline: data.isOnline,
      capacity: data.capacity,
      coverImage: data.coverImage,
      organizationId: data.organizationId,
      status: data.status,
    };

    logger.debug(`Inserting event with data: ${JSON.stringify(eventData)}`);

    const [event] = await db.insert(events)
      .values(eventData)
      .returning();

    logger.info(`Event created successfully with ID ${event.id}`);
    return event;
  } catch (error) {
    logger.error(`Error creating event: ${error}`);
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AppError(500, 'Failed to create event');
  }
}

export async function createTicketType(data: TicketTypeSchema) {
  try {
    logger.info('Creating new ticket type');
    const [ticketType] = await db.insert(ticketTypes).values({
      name: data.name,
      description: data.description,
      price: Math.round(data.price * 100), // Convert to cents
      quantity: data.quantity,
      type: data.type,
      saleStart: new Date(data.saleStart),
      saleEnd: new Date(data.saleEnd),
      maxPerOrder: data.maxPerOrder,
      minPerOrder: data.minPerOrder,
      eventId: data.eventId,
    }).returning();

    logger.info(`Ticket type created successfully with ID ${ticketType.id}`);

    // Create tickets for this ticket type
    const tickets = await createTicketsForTicketType(ticketType.id, data.quantity);
    logger.info(`Created ${tickets.length} tickets for ticket type ${ticketType.id}`);

    return {
      ...ticketType,
      price: ticketType.price / 100, // Convert back to decimal
      tickets,
    };
  } catch (error) {
    logger.error(`Error creating ticket type: ${error}`);
    throw new AppError(500, 'Failed to create ticket type');
  }
}

export async function getEvents() {
  try {
    logger.info('Fetching all events');
    const result = await db
      .select()
      .from(events)
      .where(eq(events.status, 'published'));

    logger.debug(`Successfully fetched ${result.length} events`);
    return result;
  } catch (error) {
    logger.error(`Error fetching events: ${error}`);
    throw new AppError(500, 'Failed to fetch events');
  }
}

export async function getEventById(id: string) {
  try {
    logger.info(`Fetching event by ID ${id}`);
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Get ticket types with sold count
    const ticketTypesList = await db
      .select({
        id: ticketTypes.id,
        name: ticketTypes.name,
        description: ticketTypes.description,
        price: ticketTypes.price,
        quantity: ticketTypes.quantity,
        type: ticketTypes.type,
        saleStart: ticketTypes.saleStart,
        saleEnd: ticketTypes.saleEnd,
        maxPerOrder: ticketTypes.maxPerOrder,
        minPerOrder: ticketTypes.minPerOrder,
        eventId: ticketTypes.eventId,
        createdAt: ticketTypes.createdAt,
        updatedAt: ticketTypes.updatedAt,
        soldCount: sql<number>`COALESCE((
          SELECT COUNT(*)
          FROM ${tickets}
          WHERE ${tickets.ticketTypeId} = ${ticketTypes.id}
          AND ${tickets.status} = 'booked'
        ), 0)`,
        status: sql<'on-sale' | 'paused' | 'sold-out' | 'scheduled'>`
          CASE
            WHEN ${ticketTypes.quantity} <= (
              SELECT COUNT(*)
              FROM ${tickets}
              WHERE ${tickets.ticketTypeId} = ${ticketTypes.id}
              AND ${tickets.status} = 'booked'
            ) THEN 'sold-out'
            WHEN ${ticketTypes.saleStart} > NOW() THEN 'scheduled'
            WHEN ${ticketTypes.saleEnd} < NOW() THEN 'paused'
            ELSE 'on-sale'
          END
        `
      })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, id));

    return {
      ...event,
      ticketTypes: ticketTypesList.map(t => ({
        ...t,
        price: Number(t.price) / 100, // Convert back to decimal
      })),
    };
  } catch (error) {
    logger.error(`Error getting event: ${error}`);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch event');
  }
}

export async function updateEvent(
  userId: string,
  id: string,
  data: Partial<EventSchema>,
  userRole?: string,
) {
  try {
    logger.info(`Updating event ${id} by user ${userId}`);
    await checkEventOwner(userId, id, userRole);

    // If capacity is being updated, check existing tickets
    if (data.capacity !== undefined) {
      const [ticketCount] = await db
        .select({ count: count() })
        .from(ticketTypes)
        .where(eq(ticketTypes.eventId, id));

      if (ticketCount.count > data.capacity) {
        throw new ValidationError(
          `Cannot reduce event capacity below existing ticket count of ${ticketCount.count}`,
        );
      }
    }

    const [event] = await db
      .update(events)
      .set({
        ...data,
        startTimestamp: data.startTimestamp ? new Date(data.startTimestamp) : undefined,
        endTimestamp: data.endTimestamp ? new Date(data.endTimestamp) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    logger.info(`Event ${id} updated successfully`);
    return event;
  } catch (error) {
    logger.error(`Error updating event: ${error}`);
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update event');
  }
}

export async function deleteEvent(
  userId: string,
  id: string,
  userRole?: string,
) {
  try {
    logger.info(`Deleting event ${id} by user ${userId}`);
    await checkEventOwner(userId, id, userRole);

    const [event] = await db.delete(events).where(eq(events.id, id)).returning();
    logger.info(`Event ${id} deleted successfully`);
    return event;
  } catch (error) {
    logger.error(`Error deleting event: ${error}`);
    throw new AppError(500, 'Failed to delete event');
  }
}

export async function updateEventPublishStatus(
  userId: string,
  eventId: string,
  status: 'draft' | 'published' | 'cancelled',
  userRole?: string,
) {
  try {
    logger.info(
      `Updating event ${eventId} status to ${status} by user ${userId}`,
    );
    await checkEventOwner(userId, eventId, userRole);

    const [event] = await db
      .update(events)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))
      .returning();

    logger.info(
      `Event ${eventId} status updated successfully to ${event.status}`,
    );
    return event;
  } catch (error) {
    logger.error(`Error updating event status: ${error}`);
    throw new AppError(500, 'Failed to update event status');
  }
}

export async function checkEventExists(eventId: string) {
  const [event] = await db
    .select({
      id: events.id,
      organizationId: events.organizationId,
      status: events.status,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  return event;
}

export async function getEventsByOrganization(organizationId: string) {
  try {
    logger.info(`Fetching events for organization ${organizationId}`);
    const result = await db
      .select({
        id: events.id,
        title: events.title,
        startTimestamp: events.startTimestamp,
        status: events.status,
        ticketsSold: sql<number>`COALESCE((
          SELECT COUNT(*)
          FROM ${tickets}
          WHERE ${tickets.eventId} = ${events.id}
          AND ${tickets.status} = 'booked'
        ), 0)`,
      })
      .from(events)
      .where(eq(events.organizationId, organizationId))
      .orderBy(desc(events.createdAt));

    logger.debug(`Successfully fetched ${result.length} events for organization ${organizationId}`);
    return result;
  } catch (error) {
    logger.error(`Error fetching events for organization: ${error}`);
    throw new AppError(500, 'Failed to fetch organization events');
  }
}

export async function updateTicketType(eventId: string, ticketTypeId: string, data: Partial<TicketTypeSchema>) {
  try {
    logger.info(`Updating ticket type ${ticketTypeId} for event ${eventId}`);

    return await db.transaction(async (tx) => {
      // First verify the ticket type exists and belongs to the event
      const [existingTicket] = await tx
        .select()
        .from(ticketTypes)
        .where(
          and(
            eq(ticketTypes.id, ticketTypeId),
            eq(ticketTypes.eventId, eventId)
          )
        )
        .limit(1);

      if (!existingTicket) {
        throw new NotFoundError('Ticket type not found');
      }

      // If quantity is being updated, we need to handle ticket records
      if (data.quantity !== undefined && data.quantity !== existingTicket.quantity) {
        // Get count of booked tickets
        const [{ bookedCount }] = await tx
          .select({
            bookedCount: count()
          })
          .from(tickets)
          .where(
            and(
              eq(tickets.ticketTypeId, ticketTypeId),
              eq(tickets.status, 'booked')
            )
          );

        // Cannot reduce quantity below number of booked tickets
        if (data.quantity < bookedCount) {
          throw new ValidationError(`Cannot reduce quantity below number of booked tickets (${bookedCount})`);
        }

        // If increasing quantity, create new ticket records
        if (data.quantity > existingTicket.quantity) {
          const additionalTickets = data.quantity - existingTicket.quantity;
          const ticketsToCreate = Array.from({ length: additionalTickets }, () => ({
            eventId,
            ticketTypeId,
            name: existingTicket.name,
            price: existingTicket.price,
            currency: 'usd',
            status: 'available' as const,
          }));

          await tx.insert(tickets).values(ticketsToCreate);
        }
        // If decreasing quantity, delete available tickets
        else if (data.quantity < existingTicket.quantity) {
          // Get the IDs of excess available tickets
          const ticketsToDelete = await tx
            .select({ id: tickets.id })
            .from(tickets)
            .where(
              and(
                eq(tickets.ticketTypeId, ticketTypeId),
                eq(tickets.status, 'available')
              )
            )
            .limit(existingTicket.quantity - data.quantity);

          if (ticketsToDelete.length > 0) {
            await tx
              .delete(tickets)
              .where(
                inArray(
                  tickets.id,
                  ticketsToDelete.map(t => t.id)
                )
              );
          }
        }
      }

      // Update the ticket type
      const [updatedTicketType] = await tx
        .update(ticketTypes)
        .set({
          name: data.name,
          description: data.description,
          price: data.price ? Math.round(data.price * 100) : undefined,
          quantity: data.quantity,
          type: data.type,
          saleStart: data.saleStart ? new Date(data.saleStart) : undefined,
          saleEnd: data.saleEnd ? new Date(data.saleEnd) : undefined,
          maxPerOrder: data.maxPerOrder,
          minPerOrder: data.minPerOrder,
          updatedAt: new Date(),
        })
        .where(eq(ticketTypes.id, ticketTypeId))
        .returning();

      logger.info(`Successfully updated ticket type ${ticketTypeId}`);

      return {
        ...updatedTicketType,
        price: updatedTicketType.price / 100,
      };
    });
  } catch (error) {
    logger.error(`Error updating ticket type: ${error}`);
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update ticket type');
  }
}
