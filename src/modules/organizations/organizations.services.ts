import {
  eq,
  and,
  desc,
  gte,
  sql,
  count,
  // sum, <-- Removed unused import
  countDistinct,
} from 'drizzle-orm';
import { db } from '../../db';
import {
  organizations,
  events as eventsSchema,
  tickets as ticketsSchema,
  categories as categoriesSchema,
  platformConfigurations,
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

    // --- Fetch Platform Fee ---
    let platformFeePercentage = 2.5; // Default value
    try {
      const feeConfig = await db
        .select({ value: platformConfigurations.value })
        .from(platformConfigurations)
        .where(eq(platformConfigurations.key, 'platform_fee'))
        .orderBy(desc(platformConfigurations.updatedAt))
        .limit(1);

      if (feeConfig.length > 0) {
        platformFeePercentage = parseFloat(feeConfig[0].value);
      } else {
        logger.warn(
          'Platform fee configuration not found, using default of 2.5%',
        );
      }
    } catch (feeError) {
      logger.warn(
        `Error fetching platform fee, using default of 2.5%: ${feeError}`,
      );
    }
    const feeMultiplier = (100 - platformFeePercentage) / 100; // e.g., 0.975 for 2.5% fee

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
        // Fetch raw SUM in cents as number
        totalRevenueRaw: sql<number>`COALESCE(SUM(COALESCE(${tickets.price}, 0)), 0)`,
        // Period changes (Tickets/Revenue)
        currentPeriodTickets: count(
          sql`CASE WHEN ${tickets.bookedAt} >= ${currentPeriodStart} AND ${tickets.bookedAt} <= ${currentPeriodEnd} THEN 1 ELSE NULL END`,
        ).mapWith(Number),
        previousPeriodTickets: count(
          sql`CASE WHEN ${tickets.bookedAt} >= ${previousPeriodStart} AND ${tickets.bookedAt} <= ${previousPeriodEnd} THEN 1 ELSE NULL END`,
        ).mapWith(Number),
        // Fetch raw SUM in cents as number
        currentPeriodRevenueRaw: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.bookedAt} >= ${currentPeriodStart} AND ${tickets.bookedAt} <= ${currentPeriodEnd} THEN COALESCE(${tickets.price}, 0) ELSE 0 END), 0)`,
        // Fetch raw SUM in cents as number
        previousPeriodRevenueRaw: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.bookedAt} >= ${previousPeriodStart} AND ${tickets.bookedAt} <= ${previousPeriodEnd} THEN COALESCE(${tickets.price}, 0) ELSE 0 END), 0)`,
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

    const allTimeAttendeeCount = Number(ticketStats[0]?.totalAttendees) || 0;
    // Apply fee multiplier in TypeScript, ensuring raw value is number
    const allTimeRevenueRaw = Number(ticketStats[0]?.totalRevenueRaw) || 0;
    const allTimeRevenue = allTimeRevenueRaw * feeMultiplier;
    const currentTicketsSold =
      Number(ticketStats[0]?.currentPeriodTickets) || 0;
    const previousTicketsSold =
      Number(ticketStats[0]?.previousPeriodTickets) || 0;
    // Apply fee multiplier in TypeScript, ensuring raw value is number
    const currentRevenueRaw =
      Number(ticketStats[0]?.currentPeriodRevenueRaw) || 0;
    const currentRevenue = currentRevenueRaw * feeMultiplier;
    // Apply fee multiplier in TypeScript, ensuring raw value is number
    const previousRevenueRaw =
      Number(ticketStats[0]?.previousPeriodRevenueRaw) || 0;
    const previousRevenue = previousRevenueRaw * feeMultiplier;

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
      currentRevenue, // Use fee-adjusted revenue
      previousRevenue, // Use fee-adjusted revenue
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
        // Fetch raw SUM in cents as number
        revenueRaw: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.status} = 'booked' THEN ${tickets.price} END), 0)`,
      })
      .from(events)
      .leftJoin(tickets, eq(tickets.eventId, events.id))
      .where(eq(events.organizationId, organizationId))
      .groupBy(events.id)
      .orderBy(desc(events.createdAt))
      .limit(5);

    // Filter out events with null status and map, applying fee multiplier
    const recentEvents = recentEventsRaw
      .filter((event) => event.status !== null)
      .map((event) => {
        // Ensure raw value is number before applying multiplier
        const revenueRaw = Number(event.revenueRaw) || 0;
        const revenueWithFee = revenueRaw * feeMultiplier;
        return {
          id: event.id,
          title: event.title,
          startTimestamp: event.startTimestamp.toISOString(), // Convert Date to string
          status: event.status as 'draft' | 'published' | 'cancelled', // Assert type after filtering null
          ticketsSold: Number(event.ticketsSold),
          revenue: revenueWithFee / 100, // Convert fee-adjusted cents to dollars
        };
      });

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

    // --- Monthly Trends ---
    const revenueByMonthQuery = await db
      .select({
        month: sql<string>`TO_CHAR(${tickets.bookedAt}, 'YYYY-MM')`,
        // Fetch raw SUM in cents as number
        valueRaw: sql<number>`COALESCE(SUM(COALESCE(${tickets.price}, 0)), 0)`,
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

    // Apply fee multiplier to monthly revenue data before formatting
    // Explicitly cast valueRaw to number before applying multiplier
    const revenueByMonthWithFee = revenueByMonthQuery.map((item) => {
      const valueRaw = Number(item.valueRaw) || 0;
      return {
        month: item.month,
        value: valueRaw * feeMultiplier, // Apply fee here
      };
    });

    // Format monthly data using the helper
    const formattedRevenue = formatMonthlyData(
      revenueByMonthWithFee,
      100, // Divide by 100 for dollars (value is fee-adjusted cents)
    );
    // Pass the correct variable to formatMonthlyData
    const formattedTicketSales = formatMonthlyData(
      ticketSalesByMonthQuery.map((item) => ({
        ...item,
        value: Number(item.value),
      })),
    );

    // Format the final response
    const analytics: OrganizationAnalytics = {
      totalEvents: allTimeEventCount,
      totalAttendees: allTimeAttendeeCount,
      totalRevenue: allTimeRevenue / 100, // Convert fee-adjusted cents to dollars
      ticketsSold: allTimeAttendeeCount, // ticketsSold is same as totalAttendees
      periodChanges: {
        eventsChange: eventsChange,
        attendeesChange: attendeesChange,
        revenueChange: revenueChange, // Based on fee-adjusted cents
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
        revenue: item.value, // Value is already fee-adjusted dollars
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
