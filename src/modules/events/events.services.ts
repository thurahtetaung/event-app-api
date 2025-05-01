import { eq, InferInsertModel } from 'drizzle-orm';
import { db } from '../../db';
import {
  events,
  ticketTypes as dbTicketTypes,
  users,
  organizations,
  tickets,
  categories,
} from '../../db/schema';
import { logger } from '../../utils/logger';
import { count, desc, gt, asc, gte, lte } from 'drizzle-orm';
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
import { sum } from 'drizzle-orm';
import { or } from 'drizzle-orm';
import { getReservedTicketCount } from '../../utils/redis';

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
    .innerJoin(organizations, eq(events.organizationId, organizations.id))
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
    if (!data.title || !data.categoryId || !data.organizationId) {
      throw new ValidationError('Missing required fields');
    }

    // Validate start and end timestamps
    const startDate = new Date(data.startTimestamp);
    const endDate = new Date(data.endTimestamp);
    if (endDate <= startDate) {
      throw new ValidationError('End time must be after start time');
    }

    // Fetch the category to ensure it exists
    if (data.categoryId) {
      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, data.categoryId))
        .limit(1);

      if (!category) {
        throw new ValidationError('Invalid category ID');
      }

      // Category name should only be stored for logging purposes
      logger.debug(`Using category: ${category.name} (${data.categoryId})`);
    }

    // Prepare event data
    const eventData = {
      title: data.title,
      description: data.description,
      startTimestamp: new Date(data.startTimestamp),
      endTimestamp: new Date(data.endTimestamp),
      venue: data.venue,
      address: data.address,
      categoryId: data.categoryId,
      isOnline: data.isOnline,
      capacity: data.capacity,
      coverImage: data.coverImage,
      organizationId: data.organizationId,
      status: data.status,
    };

    logger.debug(`Inserting event with data: ${JSON.stringify(eventData)}`);

    const [event] = await db.insert(events).values(eventData).returning();

    logger.info(`Event created successfully with ID ${event.id}`);
    return event;
  } catch (error) {
    logger.error(`Error creating event: ${error}`);
    if (error.name === 'ValidationError') {
      throw error;
    }
    throw new AppError(500, 'Failed to create event');
  }
}

async function validateEventCapacity(eventId: string, newCapacity?: number) {
  // Get total tickets created for this event
  const [result] = await db
    .select({
      totalTickets: sum(dbTicketTypes.quantity),
    })
    .from(dbTicketTypes)
    .where(eq(dbTicketTypes.eventId, eventId));

  const totalTickets = Number(result?.totalTickets) || 0;

  if (newCapacity !== undefined && totalTickets > newCapacity) {
    throw new ValidationError(
      `Cannot reduce event capacity to ${newCapacity}. There are already ${totalTickets} tickets created.`,
    );
  }

  return totalTickets;
}

async function validateTicketTypeCreation(eventId: string, quantity: number) {
  // Get event capacity and current total tickets across all ticket types
  const [event] = await db
    .select({
      capacity: events.capacity,
      totalTickets: sql<number>`COALESCE((
        SELECT SUM(${dbTicketTypes.quantity})
        FROM ${dbTicketTypes}
        WHERE ${dbTicketTypes.eventId} = ${eventId}
      ), 0)`,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const totalTickets = Number(event.totalTickets);
  const newTotal = totalTickets + quantity;

  if (newTotal > event.capacity) {
    throw new ValidationError(
      `Cannot create ${quantity} tickets. This would exceed the event capacity of ${event.capacity}. ` +
        `Current total tickets: ${totalTickets}. Maximum additional tickets allowed: ${event.capacity - totalTickets}`,
    );
  }
}

export async function createTicketType(data: TicketTypeSchema) {
  try {
    // Validate ticket quantity against event capacity
    await validateTicketTypeCreation(data.eventId, data.quantity);

    // Validate sale period
    const saleStart = new Date(data.saleStart);
    const saleEnd = new Date(data.saleEnd);

    if (saleEnd <= saleStart) {
      throw new ValidationError('Sale end date must be after sale start date');
    }

    // Validate min/max per order
    if (
      data.minPerOrder &&
      data.maxPerOrder &&
      Number(data.minPerOrder) > Number(data.maxPerOrder)
    ) {
      throw new ValidationError(
        'Minimum per order cannot be greater than maximum per order',
      );
    }

    if (data.maxPerOrder && Number(data.maxPerOrder) > data.quantity) {
      throw new ValidationError(
        'Maximum per order cannot exceed total quantity',
      );
    }

    // Convert price to cents for storage
    const priceInCents = Math.round(data.price * 100);

    const [ticketType] = await db
      .insert(dbTicketTypes)
      .values({
        ...data,
        price: priceInCents,
        saleStart: new Date(data.saleStart),
        saleEnd: new Date(data.saleEnd),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create tickets using the dedicated service
    await createTicketsForTicketType(ticketType.id, data.quantity);

    return {
      ...ticketType,
      price: ticketType.price / 100, // Convert back to dollars for frontend
    };
  } catch (error) {
    logger.error(`Error creating ticket type: ${error}`);
    // Let validation, not found, and forbidden errors propagate as is
    if (
      error.name === 'ValidationError' ||
      error.name === 'NotFoundError' ||
      error.name === 'ForbiddenError'
    ) {
      throw error;
    }
    // For unknown errors, wrap in AppError
    throw new AppError(500, 'Failed to create ticket type');
  }
}

export async function getEvents(params?: {
  category?: string;
  query?: string;
  sort?: 'date' | 'price-low' | 'price-high';
  startDate?: string; // Add startDate
  endDate?: string; // Add endDate
  priceRange?: 'all' | 'free' | 'paid';
  minPrice?: string;
  maxPrice?: string;
  isOnline?: boolean | string;
  isInPerson?: boolean | string;
  limit?: number;
}) {
  try {
    // Safe parameter logging
    const safeParams = {
      ...params,
      isOnline:
        params?.isOnline === 'true' || params?.isOnline === true || false,
      isInPerson:
        params?.isInPerson === 'true' || params?.isInPerson === true || false,
    };

    logger.info(
      'Fetching events with params:',
      Object.fromEntries(
        Object.entries(safeParams).filter(([_, v]) => v !== undefined),
      ),
    );

    // Build the where conditions
    const conditions = [
      eq(events.status, 'published'),
      gt(events.startTimestamp, new Date()), // Add condition for upcoming events
    ];

    // Category filter
    if (params?.category && params.category !== 'All Categories') {
      // First try exact match on category name
      const [categoryByName] = await db
        .select()
        .from(categories)
        .where(eq(categories.name, params.category))
        .limit(1);

      if (categoryByName) {
        // If found by exact name, filter by categoryId
        conditions.push(eq(events.categoryId, categoryByName.id));
        logger.debug(
          'Added category filter by ID (exact match):',
          categoryByName.id,
        );
      } else {
        // Try partial match on category name
        const searchTerm = `%${params.category.toLowerCase()}%`;
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM ${categories}
            WHERE ${categories.id} = ${events.categoryId}
            AND LOWER(${categories.name}) LIKE ${searchTerm}
          )`,
        );
        logger.debug(
          'Added category filter by partial name match:',
          params.category,
        );
      }
    }

    // Search query filter
    if (params?.query) {
      const searchTerm = `%${params.query.toLowerCase()}%`;
      conditions.push(
        sql`(
          LOWER(${events.title}) LIKE ${searchTerm} OR
          LOWER(${events.description}) LIKE ${searchTerm} OR
          LOWER(${events.venue}) LIKE ${searchTerm} OR
          LOWER(${events.address}) LIKE ${searchTerm} OR
          EXISTS (
            SELECT 1 FROM ${categories}
            WHERE ${categories.id} = ${events.categoryId}
            AND LOWER(${categories.name}) LIKE ${searchTerm}
          )
        )`,
      );
      logger.debug('Added search filter:', params.query);
    }

    // Date range filter
    if (params?.startDate) {
      try {
        const start = new Date(params.startDate);
        // Set time to the beginning of the day
        start.setHours(0, 0, 0, 0);
        conditions.push(gte(events.startTimestamp, start));
        logger.debug('Added start date filter:', start.toISOString());
      } catch (e) {
        logger.warn('Invalid start date format:', params.startDate);
      }
    }
    if (params?.endDate) {
      try {
        const end = new Date(params.endDate);
        // Set time to the end of the day
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(events.startTimestamp, end));
        logger.debug('Added end date filter:', end.toISOString());
      } catch (e) {
        logger.warn('Invalid end date format:', params.endDate);
      }
    }

    // Online/In-person filter
    if (params?.isOnline) {
      conditions.push(eq(events.isOnline, true));
      logger.debug('Added online filter');
    } else if (params?.isInPerson) {
      conditions.push(eq(events.isOnline, false));
      logger.debug('Added in-person filter');
    }

    // Price range filters
    if (params?.priceRange === 'free') {
      conditions.push(sql`NOT EXISTS (
        SELECT 1 FROM ${dbTicketTypes}
        WHERE ${dbTicketTypes.eventId} = ${events.id}
        AND ${dbTicketTypes.price} > 0
      )`);
      logger.debug('Added free price filter');
    } else if (params?.priceRange === 'paid') {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ${dbTicketTypes}
        WHERE ${dbTicketTypes.eventId} = ${events.id}
        AND ${dbTicketTypes.price} > 0
      )`);
      logger.debug('Added paid price filter');
    }

    // Min/Max price filters
    if (params?.minPrice) {
      const minPriceInCents = Math.round(parseFloat(params.minPrice) * 100);
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ${dbTicketTypes}
        WHERE ${dbTicketTypes.eventId} = ${events.id}
        AND ${dbTicketTypes.price} >= ${minPriceInCents}
      )`);
      logger.debug('Added min price filter:', params.minPrice);
    }

    if (params?.maxPrice) {
      const maxPriceInCents = Math.round(parseFloat(params.maxPrice) * 100);
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ${dbTicketTypes}
        WHERE ${dbTicketTypes.eventId} = ${events.id}
        AND ${dbTicketTypes.price} <= ${maxPriceInCents}
      )`);
      logger.debug('Added max price filter:', params.maxPrice);
    }

    logger.debug('Number of conditions:', conditions.length);

    // Create the base query with all conditions
    const baseQuery = db
      .select({
        event: events,
        organization: organizations,
        category: categories,
        lowestPrice: sql<number>`COALESCE(
          (
            SELECT MIN(${dbTicketTypes.price})
            FROM ${dbTicketTypes}
            WHERE ${dbTicketTypes.eventId} = ${events.id}
          ),
          0
        )`,
      })
      .from(events)
      .leftJoin(organizations, eq(events.organizationId, organizations.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(and(...conditions));

    // Build the query with sorting and limit
    let query;

    // Apply sorting
    if (params?.sort === 'price-low') {
      query = baseQuery.orderBy(sql`COALESCE(
        (
          SELECT MIN(${dbTicketTypes.price})
          FROM ${dbTicketTypes}
          WHERE ${dbTicketTypes.eventId} = ${events.id}
        ),
        0
      ) ASC`);
    } else if (params?.sort === 'price-high') {
      query = baseQuery.orderBy(sql`COALESCE(
        (
          SELECT MIN(${dbTicketTypes.price})
          FROM ${dbTicketTypes}
          WHERE ${dbTicketTypes.eventId} = ${events.id}
        ),
        0
      ) DESC`);
    } else {
      // Default sort by startTimestamp ascending (earliest first)
      query = baseQuery.orderBy(asc(events.startTimestamp));
    }

    // Apply limit if specified
    if (params?.limit && params.limit > 0) {
      query = query.limit(params.limit);
      logger.debug(`Applied limit: ${params.limit}`);
    }

    const result = await query;

    // Transform result to include ticket types
    const eventsWithTickets = await Promise.all(
      result.map(async ({ event, organization, category, lowestPrice }) => {
        const eventTickets = await db
          .select()
          .from(dbTicketTypes)
          .where(eq(dbTicketTypes.eventId, event.id));

        return {
          ...event,
          organization: organization
            ? {
                name: organization.name,
              }
            : undefined,
          categoryObject: category
            ? {
                id: category.id,
                name: category.name,
                icon: category.icon,
              }
            : undefined,
          ticketTypes: eventTickets.map((tt) => ({
            ...tt,
            price: Number(tt.price) / 100, // Convert cents to dollars
          })),
        };
      }),
    );

    logger.debug(`Successfully fetched ${eventsWithTickets.length} events`);
    return eventsWithTickets;
  } catch (error) {
    logger.error(`Error fetching events: ${error}`);
    throw new AppError(500, 'Failed to fetch events');
  }
}

export async function getEventById(id: string) {
  try {
    logger.info(`Fetching event by ID ${id}`);
    const [event] = await db
      .select({
        event: events,
        organization: organizations,
        category: categories,
      })
      .from(events)
      .leftJoin(organizations, eq(events.organizationId, organizations.id))
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Get ticket types with sold count
    const ticketTypesList = await db
      .select({
        id: dbTicketTypes.id,
        name: dbTicketTypes.name,
        description: dbTicketTypes.description,
        price: dbTicketTypes.price,
        quantity: dbTicketTypes.quantity,
        type: dbTicketTypes.type,
        saleStart: dbTicketTypes.saleStart,
        saleEnd: dbTicketTypes.saleEnd,
        maxPerOrder: dbTicketTypes.maxPerOrder,
        minPerOrder: dbTicketTypes.minPerOrder,
        eventId: dbTicketTypes.eventId,
        createdAt: dbTicketTypes.createdAt,
        updatedAt: dbTicketTypes.updatedAt,
        status: sql<'on-sale' | 'paused' | 'sold-out' | 'scheduled'>`
          CASE
            WHEN ${dbTicketTypes.quantity} <= (
              SELECT COUNT(*)
              FROM ${tickets}
              WHERE ${tickets.ticketTypeId} = ${dbTicketTypes.id}
              AND ${tickets.status} = 'booked'
            ) THEN 'sold-out'
            WHEN ${dbTicketTypes.saleStart} > NOW() THEN 'scheduled'
            WHEN ${dbTicketTypes.saleEnd} < NOW() THEN 'paused'
            ELSE 'on-sale'
          END
        `,
      })
      .from(dbTicketTypes)
      .where(eq(dbTicketTypes.eventId, id));

    // Debug log ticket types
    logger.info(
      `Event ${id} ticket types fetched: ${JSON.stringify(
        ticketTypesList.map((t) => ({ id: t.id, name: t.name })),
        null,
        2,
      )}`,
    );

    // Get sold count for each ticket type
    const ticketTypesWithSoldCount = await Promise.all(
      ticketTypesList.map(async (ticketType) => {
        const [bookedTicketsResult] = await db
          .select({
            count: count(),
          })
          .from(tickets)
          .where(
            and(
              eq(tickets.ticketTypeId, ticketType.id),
              eq(tickets.status, 'booked'),
            ),
          );

        const soldCount = Number(bookedTicketsResult.count);
        logger.info(
          `Ticket type ${ticketType.id} (${ticketType.name}) has ${soldCount} booked tickets`,
        );

        // Recalculate status based on actual sold count
        const status =
          soldCount >= ticketType.quantity
            ? 'sold-out'
            : new Date(ticketType.saleStart) > new Date()
              ? 'scheduled'
              : new Date(ticketType.saleEnd) < new Date()
                ? 'paused'
                : 'on-sale';

        logger.info(
          `Ticket type ${ticketType.id} status updated from ${ticketType.status} to ${status} based on actual sold count`,
        );

        return {
          ...ticketType,
          soldCount,
          status,
        };
      }),
    );

    // Get Redis reservation counts for each ticket type
    const ticketTypesWithReservations = await Promise.all(
      ticketTypesWithSoldCount.map(async (ticketType) => {
        const reservedCount = await getReservedTicketCount(ticketType.id);
        logger.info(
          `Ticket type ${ticketType.id} has ${reservedCount} tickets reserved in Redis and ${ticketType.soldCount} tickets booked in database`,
        );
        return {
          ...ticketType,
          price: Number(ticketType.price) / 100, // Convert from cents to dollars
          reservedCount, // Keep track of reserved count separately
          soldCount: Number(ticketType.soldCount), // Keep booked count separate
          totalSoldCount: Number(ticketType.soldCount) + reservedCount, // Add reserved count to sold count for total
        };
      }),
    );

    return {
      ...event.event,
      organization: event.organization
        ? {
            id: event.organization.id,
            name: event.organization.name,
            website: event.organization.website,
            socialLinks: event.organization.socialLinks,
          }
        : undefined,
      categoryObject: event.category
        ? {
            id: event.category.id,
            name: event.category.name,
            icon: event.category.icon,
          }
        : undefined,
      ticketTypes: ticketTypesWithReservations,
    };
  } catch (error) {
    logger.error(`Error getting event: ${error}`);
    if (error.name === 'NotFoundError') {
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
    await checkEventOwner(userId, id, userRole);

    // Validate start and end timestamps
    if (data.startTimestamp && data.endTimestamp) {
      const startDate = new Date(data.startTimestamp);
      const endDate = new Date(data.endTimestamp);
      if (endDate <= startDate) {
        throw new ValidationError('End time must be after start time');
      }
    }

    // If capacity is being updated, validate it
    if (data.capacity !== undefined) {
      await validateEventCapacity(id, data.capacity);
    }

    // Validate venue and address for in-person events
    if (data.isOnline === false) {
      if (!data.venue) {
        throw new ValidationError('Venue is required for in-person events');
      }
      if (!data.address) {
        throw new ValidationError('Address is required for in-person events');
      }
    }

    // Check if categoryId is being updated and validate it exists
    if (data.categoryId) {
      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, data.categoryId))
        .limit(1);

      if (!category) {
        throw new ValidationError('Invalid category ID');
      }

      logger.debug(
        `Updating event to use category: ${category.name} (${data.categoryId})`,
      );
    }

    const [updatedEvent] = await db
      .update(events)
      .set({
        ...data,
        startTimestamp: data.startTimestamp
          ? new Date(data.startTimestamp)
          : undefined,
        endTimestamp: data.endTimestamp
          ? new Date(data.endTimestamp)
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();

    return updatedEvent;
  } catch (error) {
    logger.error(`Error updating event: ${error}`);
    // Let validation, not found, and forbidden errors propagate as is
    if (
      error.name === 'ValidationError' ||
      error.name === 'NotFoundError' ||
      error.name === 'ForbiddenError'
    ) {
      throw error;
    }
    // For unknown errors, wrap in AppError
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

    const [event] = await db
      .delete(events)
      .where(eq(events.id, id))
      .returning();
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

    // Get events with tickets sold count
    const result = await db
      .select({
        id: events.id,
        title: events.title,
        startTimestamp: events.startTimestamp,
        status: events.status,
        ticketsSold: sql<number>`CAST(COALESCE((
          SELECT COUNT(*)
          FROM ${tickets}
          WHERE ${tickets.eventId} = ${events.id}
          AND ${tickets.status} = 'booked'
        ), 0) AS integer)`,
      })
      .from(events)
      .where(eq(events.organizationId, organizationId))
      .orderBy(desc(events.createdAt));

    logger.debug(
      `Successfully fetched ${result.length} events for organization ${organizationId}`,
    );

    // Ensure all ticketsSold values are proper numbers
    const processedResults = result.map((event) => {
      // Convert ticketsSold to a number explicitly
      return {
        ...event,
        ticketsSold: Number(event.ticketsSold),
      };
    });

    // Log ticket counts for debugging
    for (const event of processedResults) {
      logger.debug(
        `Event ${event.id} has ${event.ticketsSold} tickets sold according to SQL expression`,
      );

      // Double check with direct queries
      const [bookedCount] = await db
        .select({
          count: count(),
        })
        .from(tickets)
        .where(
          and(eq(tickets.eventId, event.id), eq(tickets.status, 'booked')),
        );

      const [reservedCount] = await db
        .select({
          count: count(),
        })
        .from(tickets)
        .where(
          and(eq(tickets.eventId, event.id), eq(tickets.status, 'reserved')),
        );

      const [availableCount] = await db
        .select({
          count: count(),
        })
        .from(tickets)
        .where(
          and(eq(tickets.eventId, event.id), eq(tickets.status, 'available')),
        );

      logger.debug(
        `Event ${event.id} detailed counts - Booked: ${bookedCount.count}, Reserved: ${reservedCount.count}, Available: ${availableCount.count}`,
      );

      // Update the count if needed
      if (event.ticketsSold !== Number(bookedCount.count)) {
        logger.warn(
          `Ticket count mismatch for event ${event.id}: SQL expression returned ${event.ticketsSold} but direct query found ${bookedCount.count} booked tickets`,
        );
        event.ticketsSold = Number(bookedCount.count);
      }
    }

    return processedResults;
  } catch (error) {
    logger.error(`Error fetching events for organization: ${error}`);
    throw new AppError(500, 'Failed to fetch organization events');
  }
}

export async function updateTicketType(
  eventId: string,
  ticketTypeId: string,
  data: Partial<TicketTypeSchema>,
) {
  try {
    // Get current ticket type
    const [currentTicketType] = await db
      .select({
        quantity: dbTicketTypes.quantity,
        soldCount: sql<number>`COALESCE((
          SELECT COUNT(*)
          FROM ${tickets}
          WHERE ${tickets.ticketTypeId} = ${dbTicketTypes.id}
          AND ${tickets.status} = 'booked'
        ), 0)`,
      })
      .from(dbTicketTypes)
      .where(eq(dbTicketTypes.id, ticketTypeId))
      .limit(1);

    if (!currentTicketType) {
      throw new NotFoundError('Ticket type not found');
    }

    // If quantity is being updated, validate it
    if (data.quantity !== undefined) {
      // Check if new quantity is less than sold tickets
      if (data.quantity < currentTicketType.soldCount) {
        throw new ValidationError(
          `Cannot reduce quantity to ${data.quantity}. There are already ${currentTicketType.soldCount} tickets sold.`,
        );
      }

      // Get total tickets for all ticket types
      const [totalResult] = await db
        .select({
          totalTickets: sql<number>`COALESCE(SUM(${dbTicketTypes.quantity}), 0)`,
        })
        .from(dbTicketTypes)
        .where(eq(dbTicketTypes.eventId, eventId));

      // Get event capacity
      const [event] = await db
        .select({
          capacity: events.capacity,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (!event) {
        throw new NotFoundError('Event not found');
      }

      const currentTotal = Number(totalResult.totalTickets);
      const quantityDiff = data.quantity - currentTicketType.quantity;
      const newTotal = currentTotal + quantityDiff;

      if (newTotal > event.capacity) {
        throw new ValidationError(
          `Cannot update quantity. Total tickets would exceed event capacity of ${event.capacity}. ` +
            `Current total tickets: ${currentTotal}. Maximum additional tickets allowed: ${event.capacity - currentTotal}`,
        );
      }
    }

    // Validate sale period if being updated
    if (data.saleStart && data.saleEnd) {
      const saleStart = new Date(data.saleStart);
      const saleEnd = new Date(data.saleEnd);
      if (saleEnd <= saleStart) {
        throw new ValidationError(
          'Sale end date must be after sale start date',
        );
      }
    }

    // Validate min/max per order
    if (
      data.minPerOrder &&
      data.maxPerOrder &&
      Number(data.minPerOrder) > Number(data.maxPerOrder)
    ) {
      throw new ValidationError(
        'Minimum per order cannot be greater than maximum per order',
      );
    }

    if (
      data.maxPerOrder &&
      data.quantity &&
      Number(data.maxPerOrder) > data.quantity
    ) {
      throw new ValidationError(
        'Maximum per order cannot exceed total quantity',
      );
    }

    // Calculate the new price in cents
    const newPriceInCents =
      data.type === 'free'
        ? 0
        : data.price
          ? Math.round(data.price * 100)
          : undefined;

    // Set price to 0 if type is being changed to 'free'
    const updateData = {
      ...data,
      price: newPriceInCents,
      saleStart: data.saleStart ? new Date(data.saleStart) : undefined,
      saleEnd: data.saleEnd ? new Date(data.saleEnd) : undefined,
      updatedAt: new Date(),
    };

    const [updatedTicketType] = await db
      .update(dbTicketTypes)
      .set(updateData)
      .where(eq(dbTicketTypes.id, ticketTypeId))
      .returning();

    // If price is being updated, update all available tickets
    if (newPriceInCents !== undefined) {
      await db
        .update(tickets)
        .set({
          price: newPriceInCents,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tickets.ticketTypeId, ticketTypeId),
            eq(tickets.status, 'available'),
          ),
        );
    }

    // If quantity increased, create additional tickets
    if (data.quantity && data.quantity > currentTicketType.quantity) {
      const additionalTickets = data.quantity - currentTicketType.quantity;
      const ticketsToCreate = Array.from({ length: additionalTickets }, () => ({
        eventId,
        ticketTypeId,
        name: updatedTicketType.name,
        price: updatedTicketType.price,
        currency: 'usd',
        status: 'available' as const,
      }));

      await db.insert(tickets).values(ticketsToCreate);
    }

    return {
      ...updatedTicketType,
      price: updatedTicketType.price / 100, // Convert back to dollars for frontend
    };
  } catch (error) {
    logger.error(`Error updating ticket type: ${error}`);
    // Let validation, not found, and forbidden errors propagate as is
    if (
      error.name === 'ValidationError' ||
      error.name === 'NotFoundError' ||
      error.name === 'ForbiddenError'
    ) {
      throw error;
    }
    // For unknown errors, wrap in AppError
    throw new AppError(500, 'Failed to update ticket type');
  }
}

export async function getEventAnalytics(eventId: string) {
  try {
    logger.info(`Getting analytics for event ${eventId}`);

    // Get total tickets sold and revenue
    const [totals] = await db
      .select({
        totalTicketsSold: count(tickets.id),
        totalRevenue: sql<number>`COALESCE(SUM(${tickets.price}), 0)`,
      })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'booked')));

    // Get stats per ticket type
    const ticketTypesList = await db
      .select({
        id: dbTicketTypes.id,
        name: dbTicketTypes.name,
        type: dbTicketTypes.type,
        quantity: dbTicketTypes.quantity,
        totalSold: sql<number>`CAST(COUNT(CASE WHEN ${tickets.status} = 'booked' THEN 1 END) AS integer)`,
        totalRevenue: sql<number>`CAST(COALESCE(SUM(CASE WHEN ${tickets.status} = 'booked' THEN ${tickets.price} END), 0) AS integer)`,
        status: sql<'on-sale' | 'paused' | 'sold-out' | 'scheduled'>`
          CASE
            WHEN CAST(COUNT(CASE WHEN ${tickets.status} = 'booked' THEN 1 END) AS integer) >= ${dbTicketTypes.quantity} THEN 'sold-out'
            WHEN ${dbTicketTypes.saleStart} > NOW() THEN 'scheduled'
            WHEN ${dbTicketTypes.saleEnd} < NOW() THEN 'paused'
            ELSE 'on-sale'
          END
        `,
      })
      .from(dbTicketTypes)
      .leftJoin(
        tickets,
        and(
          eq(tickets.ticketTypeId, dbTicketTypes.id),
          eq(tickets.eventId, eventId),
        ),
      )
      .where(eq(dbTicketTypes.eventId, eventId))
      .groupBy(dbTicketTypes.id);

    // Log ticket type stats for debugging
    logger.info(
      `Ticket type stats for event ${eventId}: ${JSON.stringify(ticketTypesList, null, 2)}`,
    );

    // Double check booked tickets directly
    const bookedTickets = await db
      .select({
        ticketTypeId: tickets.ticketTypeId,
        count: sql<number>`CAST(COUNT(*) AS integer)`,
      })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'booked')))
      .groupBy(tickets.ticketTypeId);

    logger.info(
      `Booked tickets count for event ${eventId}: ${JSON.stringify(bookedTickets, null, 2)}`,
    );

    // Get sales by day for all time
    const salesByDay = await db
      .select({
        date: sql<string>`DATE(${tickets.bookedAt})::text`,
        count: count(tickets.id),
        revenue: sql<number>`COALESCE(SUM(${tickets.price}), 0)`,
      })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'booked')))
      .groupBy(sql`DATE(${tickets.bookedAt})`)
      .orderBy(sql`DATE(${tickets.bookedAt})`);

    return {
      totalTicketsSold: Number(totals.totalTicketsSold),
      totalRevenue: Number(totals.totalRevenue) / 100, // Convert from cents to dollars
      ticketTypeStats: ticketTypesList.map((stat) => ({
        ...stat,
        totalSold: Number(stat.totalSold),
        totalRevenue: Number(stat.totalRevenue) / 100, // Convert from cents to dollars
      })),
      salesByDay: salesByDay.map((day) => ({
        ...day,
        count: Number(day.count),
        revenue: Number(day.revenue) / 100, // Convert from cents to dollars
      })),
    };
  } catch (error) {
    logger.error(`Error getting event analytics: ${error}`);
    throw new AppError(500, 'Failed to get event analytics');
  }
}
