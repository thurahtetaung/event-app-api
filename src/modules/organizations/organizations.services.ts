import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { organizations, categories } from '../../db/schema';
import { logger } from '../../utils/logger';
import { AppError, NotFoundError, ForbiddenError } from '../../utils/errors';
import { UpdateOrganizationInput } from './organizations.schema';

export async function getOrganizations() {
  try {
    logger.info('Fetching all organizations...');
    const result = await db.select().from(organizations);

    logger.debug(`Successfully fetched ${result.length} organizations`);
    return result;
  } catch (error) {
    logger.error(`Error fetching organizations: ${error}`);
    throw new AppError(500, 'Failed to fetch organizations');
  }
}

export async function getOrganizationById(id: string) {
  try {
    logger.info(`Fetching organization by ID ${id}`);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!organization) {
      logger.warn(`Organization not found with ID ${id}`);
      throw new NotFoundError(`Organization not found with ID ${id}`);
    }

    logger.debug(`Successfully fetched organization ${id}`);
    return organization;
  } catch (error) {
    logger.error(`Error fetching organization: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch organization');
  }
}

export async function checkOrganizationAccess(
  userId: string,
  organizationId: string,
  userRole?: string,
) {
  logger.debug(
    `Checking organization access for user ${userId} and organization ${organizationId}`,
  );

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  // Allow admins to bypass ownership check
  if (userRole === 'admin') {
    return organization;
  }

  // Check if user is the owner
  if (organization.ownerId !== userId) {
    throw new ForbiddenError('Unauthorized to access this organization');
  }

  return organization;
}

export async function updateOrganization(
  userId: string,
  organizationId: string,
  data: UpdateOrganizationInput,
  userRole?: string,
) {
  try {
    logger.info(`Updating organization ${organizationId} by user ${userId}`);
    await checkOrganizationAccess(userId, organizationId, userRole);

    const { eventTypes, socialLinks, ...restData } = data;
    const updateData = {
      ...restData,
      updatedAt: new Date(),
      ...(eventTypes && { eventTypes: JSON.stringify(eventTypes) }),
      ...(socialLinks && { socialLinks: JSON.stringify(socialLinks) }),
    };

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, organizationId))
      .returning();

    logger.info(`Organization ${organizationId} updated successfully`);
    return updatedOrg;
  } catch (error) {
    logger.error(`Error updating organization: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update organization');
  }
}

export async function getCurrentOrganization(userId: string) {
  try {
    logger.info(`Fetching organization for owner ${userId}`);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);

    logger.debug(`Successfully fetched organization for owner ${userId}`);
    return organization;
  } catch (error) {
    logger.error(`Error fetching organization by owner: ${error}`);
    throw new AppError(500, 'Failed to fetch organization');
  }
}

export async function getOrganizationAnalytics(organizationId: string) {
  try {
    logger.info(`Fetching analytics for organization ${organizationId}`);

    // Ensure the organization exists
    const organization = await getOrganizationById(organizationId);
    if (!organization) {
      throw new NotFoundError(
        `Organization not found with ID ${organizationId}`,
      );
    }

    // Import necessary schemas here to avoid circular dependencies
    const {
      events,
      tickets,
      ticketTypes: dbTicketTypes,
    } = require('../../db/schema');
    const { and, sql, count } = require('drizzle-orm');

    // Define date ranges for current and previous periods
    const now = new Date();
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setMonth(now.getMonth() - 1); // Last month

    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1); // Month before last

    const previousPeriodEnd = new Date(currentPeriodStart);
    previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1); // Day before current period start

    // Get total events count - current period
    const [currentEventCountResult] = await db
      .select({
        count: count(events.id),
      })
      .from(events)
      .where(
        and(
          eq(events.organizationId, organizationId),
          sql`${events.createdAt} >= ${currentPeriodStart}`,
          sql`${events.createdAt} <= ${now}`,
        ),
      );

    // Get total events count - previous period
    const [previousEventCountResult] = await db
      .select({
        count: count(events.id),
      })
      .from(events)
      .where(
        and(
          eq(events.organizationId, organizationId),
          sql`${events.createdAt} >= ${previousPeriodStart}`,
          sql`${events.createdAt} <= ${previousPeriodEnd}`,
        ),
      );

    // Get total attendees (unique tickets with booked status) - current period
    const [currentAttendeeCountResult] = await db
      .select({
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${currentPeriodStart}`,
          sql`${tickets.bookedAt} <= ${now}`,
        ),
      );

    // Get total attendees - previous period
    const [previousAttendeeCountResult] = await db
      .select({
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${previousPeriodStart}`,
          sql`${tickets.bookedAt} <= ${previousPeriodEnd}`,
        ),
      );

    // Get total revenue - current period
    const [currentRevenueResult] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${tickets.price}), 0)`,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${currentPeriodStart}`,
          sql`${tickets.bookedAt} <= ${now}`,
        ),
      );

    // Get total revenue - previous period
    const [previousRevenueResult] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${tickets.price}), 0)`,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${previousPeriodStart}`,
          sql`${tickets.bookedAt} <= ${previousPeriodEnd}`,
        ),
      );

    // Get tickets sold count - current period
    const [currentTicketsSoldResult] = await db
      .select({
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${currentPeriodStart}`,
          sql`${tickets.bookedAt} <= ${now}`,
        ),
      );

    // Get tickets sold count - previous period
    const [previousTicketsSoldResult] = await db
      .select({
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${previousPeriodStart}`,
          sql`${tickets.bookedAt} <= ${previousPeriodEnd}`,
        ),
      );

    // Calculate percentage changes
    const calculatePercentageChange = (
      current: number,
      previous: number,
    ): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const eventsChange = calculatePercentageChange(
      Number(currentEventCountResult.count),
      Number(previousEventCountResult.count),
    );

    const attendeesChange = calculatePercentageChange(
      Number(currentAttendeeCountResult.count),
      Number(previousAttendeeCountResult.count),
    );

    const revenueChange = calculatePercentageChange(
      Number(currentRevenueResult.revenue),
      Number(previousRevenueResult.revenue),
    );

    const ticketsChange = calculatePercentageChange(
      Number(currentTicketsSoldResult.count),
      Number(previousTicketsSoldResult.count),
    );

    // Get all-time stats
    const [eventCountResult] = await db
      .select({
        count: count(events.id),
      })
      .from(events)
      .where(eq(events.organizationId, organizationId));

    const [attendeeCountResult] = await db
      .select({
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
        ),
      );

    const [revenueResult] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${tickets.price}), 0)`,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
        ),
      );

    const [ticketsSoldResult] = await db
      .select({
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
        ),
      );

    // Get recent events with their stats (last 5 events)
    const recentEvents = await db
      .select({
        id: events.id,
        title: events.title,
        startTimestamp: events.startTimestamp,
        status: events.status,
        ticketsSold: sql<number>`CAST(COUNT(CASE WHEN ${tickets.status} = 'booked' THEN 1 END) AS integer)`,
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.status} = 'booked' THEN ${tickets.price} END), 0)`,
      })
      .from(events)
      .leftJoin(tickets, eq(tickets.eventId, events.id))
      .where(eq(events.organizationId, organizationId))
      .groupBy(events.id)
      .orderBy(sql`${events.createdAt} DESC`)
      .limit(5);

    // Get events by category
    const eventsByCategory = await db
      .select({
        category: categories.name,
        count: count(events.id),
      })
      .from(events)
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(eq(events.organizationId, organizationId))
      .groupBy(categories.name);

    // Get revenue by month (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const revenueByMonth = await db
      .select({
        month: sql<string>`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`,
        revenue: sql<number>`COALESCE(SUM(${tickets.price}), 0)`,
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${twelveMonthsAgo}`,
        ),
      )
      .groupBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`);

    // Get ticket sales by month (last 12 months)
    const ticketSalesByMonth = await db
      .select({
        month: sql<string>`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`,
        count: count(tickets.id),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          sql`${tickets.bookedAt} >= ${twelveMonthsAgo}`,
        ),
      )
      .groupBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`);

    // Return analytics data
    return {
      totalEvents: Number(eventCountResult.count),
      totalAttendees: Number(attendeeCountResult.count),
      totalRevenue: Number(revenueResult.revenue) / 100, // Convert from cents to dollars
      ticketsSold: Number(ticketsSoldResult.count),
      periodChanges: {
        eventsChange: parseFloat(eventsChange.toFixed(1)),
        attendeesChange: parseFloat(attendeesChange.toFixed(1)),
        revenueChange: parseFloat(revenueChange.toFixed(1)),
        ticketsChange: parseFloat(ticketsChange.toFixed(1)),
      },
      recentEvents: recentEvents.map((event) => ({
        ...event,
        ticketsSold: Number(event.ticketsSold),
        revenue: Number(event.revenue) / 100, // Convert from cents to dollars
      })),
      eventsByCategory,
      revenueByMonth: revenueByMonth.map((item) => ({
        month: item.month,
        revenue: Number(item.revenue) / 100, // Convert from cents to dollars
      })),
      ticketSalesByMonth: ticketSalesByMonth.map((item) => ({
        month: item.month,
        count: Number(item.count),
      })),
    };
  } catch (error) {
    logger.error(`Error fetching organization analytics: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch organization analytics');
  }
}
