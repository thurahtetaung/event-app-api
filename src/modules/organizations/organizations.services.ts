import {
  eq,
  and,
  desc,
  gte,
  sql,
  count,
  sum,
  countDistinct,
} from 'drizzle-orm';
import { db } from '../../db';
import {
  organizations,
  events as eventsSchema,
  tickets as ticketsSchema,
  categories as categoriesSchema,
} from '../../db/schema';
import { logger } from '../../utils/logger';
import { AppError, NotFoundError, ForbiddenError } from '../../utils/errors';
import {
  UpdateOrganizationInput,
  OrganizationAnalytics,
} from './organizations.schema';
import {
  getCachedOrganizationAnalytics,
  cacheOrganizationAnalytics,
} from '../../utils/redis';

// Infer Organization type from schema
type Organization = typeof organizations.$inferSelect;

// Define a type for the formatted monthly data helper
type FormattedMonthlyData = { month: string; value: number };

// Added return type: Promise<Organization[]>
export async function getOrganizations(): Promise<Organization[]> {
  try {
    logger.info('Fetching all organizations...');
    const result = await db.select().from(organizations);

    logger.debug(`Successfully fetched ${result.length} organizations`);
    return result;
  } catch (error: unknown) {
    // Added type
    logger.error(`Error fetching organizations: ${error}`);
    throw new AppError(500, 'Failed to fetch organizations');
  }
}

// Added return type: Promise<Organization>
export async function getOrganizationById(id: string): Promise<Organization> {
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
  } catch (error: unknown) {
    // Added type
    logger.error(`Error fetching organization: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch organization');
  }
}

// Added return type: Promise<Organization>
export async function checkOrganizationAccess(
  userId: string,
  organizationId: string,
  userRole?: string,
): Promise<Organization> {
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

// Added return type: Promise<Organization>
export async function updateOrganization(
  userId: string,
  organizationId: string,
  data: UpdateOrganizationInput,
  userRole?: string,
): Promise<Organization> {
  try {
    logger.info(`Updating organization ${organizationId} by user ${userId}`);
    await checkOrganizationAccess(userId, organizationId, userRole);

    const { eventTypes, socialLinks, ...restData } = data;
    const updateData = {
      ...restData,
      updatedAt: new Date(),
      // Ensure JSON stringification happens correctly
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
  } catch (error: unknown) {
    // Added type
    logger.error(`Error updating organization: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update organization');
  }
}

// Added return type: Promise<Organization | undefined>
export async function getCurrentOrganization(
  userId: string,
): Promise<Organization | undefined> {
  try {
    logger.info(`Fetching organization for owner ${userId}`);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, userId))
      .limit(1);

    logger.debug(`Successfully fetched organization for owner ${userId}`);
    return organization; // Can be undefined if not found
  } catch (error: unknown) {
    // Added type
    logger.error(`Error fetching organization by owner: ${error}`);
    throw new AppError(500, 'Failed to fetch organization');
  }
}

export async function getOrganizationAnalytics(
  organizationId: string,
): Promise<OrganizationAnalytics> {
  try {
    logger.info(`Fetching analytics for organization ${organizationId}`);

    // First, try to get from cache
    const cachedData = await getCachedOrganizationAnalytics(organizationId);
    if (cachedData) {
      logger.info(`Using cached analytics for organization ${organizationId}`);
      return cachedData;
    }

    logger.info(
      `Analytics for organization ${organizationId} not found in cache, fetching from database...`,
    );

    // Ensure the organization exists (using the existing function)
    await getOrganizationById(organizationId);

    // Use aliased schemas
    const events = eventsSchema;
    const tickets = ticketsSchema;
    const categories = categoriesSchema;

    // Define date ranges
    const now = new Date();
    const currentPeriodEnd = new Date(now);
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(now.getDate() - 30);

    const previousPeriodEnd = new Date(currentPeriodStart);
    previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
    const previousPeriodStart = new Date(previousPeriodEnd);
    previousPeriodStart.setDate(previousPeriodEnd.getDate() - 30);

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    // --- Combined Period Change & All-Time Stats Query ---
    const combinedStats = await db
      .select({
        // All-time
        totalEvents: countDistinct(events.id).mapWith(Number),
        // Period changes (Events)
        currentPeriodEvents: count(
          sql`CASE WHEN ${events.createdAt} >= ${currentPeriodStart} AND ${events.createdAt} <= ${currentPeriodEnd} THEN ${events.id} ELSE NULL END`,
        ).mapWith(Number),
        previousPeriodEvents: count(
          sql`CASE WHEN ${events.createdAt} >= ${previousPeriodStart} AND ${events.createdAt} <= ${previousPeriodEnd} THEN ${events.id} ELSE NULL END`,
        ).mapWith(Number),
      })
      .from(events)
      .where(eq(events.organizationId, organizationId));

    const ticketStats = await db
      .select({
        // All-time
        totalAttendees: count(tickets.id).mapWith(Number), // Count booked tickets
        totalRevenue: sum(sql<number>`COALESCE(${tickets.price}, 0)`).mapWith(
          Number,
        ), // Sum price of booked tickets
        // Period changes (Tickets/Revenue)
        currentPeriodTickets: count(
          sql`CASE WHEN ${tickets.bookedAt} >= ${currentPeriodStart} AND ${tickets.bookedAt} <= ${currentPeriodEnd} THEN 1 ELSE NULL END`,
        ).mapWith(Number),
        previousPeriodTickets: count(
          sql`CASE WHEN ${tickets.bookedAt} >= ${previousPeriodStart} AND ${tickets.bookedAt} <= ${previousPeriodEnd} THEN 1 ELSE NULL END`,
        ).mapWith(Number),
        currentPeriodRevenue: sum(
          sql<number>`CASE WHEN ${tickets.bookedAt} >= ${currentPeriodStart} AND ${tickets.bookedAt} <= ${currentPeriodEnd} THEN COALESCE(${tickets.price}, 0) ELSE 0 END`,
        ).mapWith(Number),
        previousPeriodRevenue: sum(
          sql<number>`CASE WHEN ${tickets.bookedAt} >= ${previousPeriodStart} AND ${tickets.bookedAt} <= ${previousPeriodEnd} THEN COALESCE(${tickets.price}, 0) ELSE 0 END`,
        ).mapWith(Number),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          // Ensure we only consider tickets booked within the relevant time frame for period changes
          gte(tickets.bookedAt, previousPeriodStart),
        ),
      );

    // Extract results
    const allTimeEventCount = combinedStats[0]?.totalEvents || 0;
    const currentEventCount = combinedStats[0]?.currentPeriodEvents || 0;
    const previousEventCount = combinedStats[0]?.previousPeriodEvents || 0;

    const allTimeAttendeeCount = ticketStats[0]?.totalAttendees || 0;
    const allTimeRevenue = ticketStats[0]?.totalRevenue || 0;
    const currentTicketsSold = ticketStats[0]?.currentPeriodTickets || 0;
    const previousTicketsSold = ticketStats[0]?.previousPeriodTickets || 0;
    const currentRevenue = ticketStats[0]?.currentPeriodRevenue || 0;
    const previousRevenue = ticketStats[0]?.previousPeriodRevenue || 0;

    // Calculate percentage changes
    const calculatePercentageChange = (
      current: number,
      previous: number,
    ): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      if (previous === 0 && current === 0) return 0;
      return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    };

    const eventsChange = calculatePercentageChange(
      currentEventCount,
      previousEventCount,
    );
    const attendeesChange = calculatePercentageChange(
      currentTicketsSold,
      previousTicketsSold,
    );
    const revenueChange = calculatePercentageChange(
      currentRevenue,
      previousRevenue,
    );
    const ticketsChange = attendeesChange; // Tickets sold change is same as attendees change

    // --- Recent Events ---
    const recentEventsRaw = await db
      .select({
        id: events.id,
        title: events.title,
        startTimestamp: events.startTimestamp,
        status: events.status, // Keep status as is from DB
        ticketsSold: sql<number>`CAST(COUNT(CASE WHEN ${tickets.status} = 'booked' THEN 1 END) AS integer)`,
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.status} = 'booked' THEN ${tickets.price} END), 0)`,
      })
      .from(events)
      .leftJoin(tickets, eq(tickets.eventId, events.id))
      .where(eq(events.organizationId, organizationId))
      .groupBy(events.id)
      .orderBy(desc(events.createdAt))
      .limit(5);

    // Filter out events with null status and map
    const recentEvents = recentEventsRaw
      .filter((event) => event.status !== null)
      .map((event) => ({
        id: event.id,
        title: event.title,
        startTimestamp: event.startTimestamp.toISOString(), // Convert Date to string
        status: event.status as 'draft' | 'published' | 'cancelled', // Assert type after filtering null
        ticketsSold: Number(event.ticketsSold),
        revenue: Number(event.revenue) / 100,
      }));

    // --- Events By Category (Keep as is) ---
    const eventsByCategory = await db
      .select({
        category: categories.name,
        count: count(events.id).mapWith(Number),
      })
      .from(events)
      .leftJoin(categories, eq(events.categoryId, categories.id))
      .where(eq(events.organizationId, organizationId))
      .groupBy(categories.name)
      .orderBy(desc(count(events.id)));

    // --- Monthly Trends (queries remain the same) ---
    const revenueByMonthQuery = await db
      .select({
        month: sql<string>`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`,
        value: sum(sql<number>`COALESCE(${tickets.price}, 0)`).mapWith(Number), // Use 'value' alias
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          gte(tickets.bookedAt, twelveMonthsAgo),
        ),
      )
      .groupBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`);

    const ticketSalesByMonthQuery = await db
      .select({
        month: sql<string>`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`,
        value: count(tickets.id).mapWith(Number), // Use 'value' alias
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id))
      .where(
        and(
          eq(events.organizationId, organizationId),
          eq(tickets.status, 'booked'),
          gte(tickets.bookedAt, twelveMonthsAgo),
        ),
      )
      .groupBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`);

    // Format monthly data using the helper
    const formattedRevenue = formatMonthlyData(revenueByMonthQuery, 100); // Divide by 100 for dollars
    const formattedTicketSales = formatMonthlyData(ticketSalesByMonthQuery);

    // Format the final response
    const analytics: OrganizationAnalytics = {
      totalEvents: allTimeEventCount,
      totalAttendees: allTimeAttendeeCount,
      totalRevenue: allTimeRevenue / 100, // Convert cents to dollars
      ticketsSold: allTimeAttendeeCount, // ticketsSold is same as totalAttendees
      periodChanges: {
        eventsChange: eventsChange,
        attendeesChange: attendeesChange,
        revenueChange: revenueChange, // Based on cents, conversion happens at final display if needed
        ticketsChange: ticketsChange,
      },
      recentEvents: recentEvents, // Use the filtered and mapped array
      eventsByCategory: eventsByCategory.map((item) => ({
        category: item.category || 'Uncategorized',
        count: item.count,
      })),
      // Map the helper function result to the expected schema structure
      revenueByMonth: formattedRevenue.map((item) => ({
        month: item.month,
        revenue: item.value,
      })),
      ticketSalesByMonth: formattedTicketSales.map((item) => ({
        month: item.month,
        count: item.value,
      })),
    };

    // Cache the analytics before returning
    await cacheOrganizationAnalytics(organizationId, analytics);
    logger.info(
      `Successfully fetched analytics for organization ${organizationId}`,
    );
    return analytics;
  } catch (error: unknown) {
    // Added type
    logger.error(
      `Error fetching analytics for organization ${organizationId}: ${error}`,
    );
    if (error instanceof NotFoundError) {
      throw error;
    }
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    // Use generic AppError for other errors
    throw new AppError(
      500,
      `Failed to fetch organization analytics: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Helper function to format monthly data, ensuring all 12 months are present
// Corrected return type and implementation
function formatMonthlyData(
  data: Array<{ month: string; value: number | string | null }>, // Input from DB query (value can be string/null initially)
  divisor: number = 1,
): FormattedMonthlyData[] {
  // Return the defined type
  const resultMap = new Map<string, number>();
  const now = new Date();

  // Initialize map with the last 12 months (using YYYY-MM format)
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    resultMap.set(monthKey, 0);
  }

  // Populate map with actual data
  data.forEach((item) => {
    const monthKey = item.month;
    if (resultMap.has(monthKey)) {
      // Ensure value is treated as number before division, default to 0 if null/undefined/NaN
      const numericValue = Number(item.value) || 0;
      const value = numericValue / divisor;
      resultMap.set(monthKey, value);
    }
  });

  // Convert map back to sorted array matching FormattedMonthlyData structure
  const result: FormattedMonthlyData[] = Array.from(resultMap.entries()).map(
    ([month, value]) => ({
      month,
      value,
    }),
  );

  return result; // Ensure return statement is present and correct
}
