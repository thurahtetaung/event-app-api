import {
  eq,
  and,
  gte,
  lte,
  count,
  sql,
  sum,
  desc,
  countDistinct,
  lt,
} from 'drizzle-orm'; // Removed inArray, extract
import { db } from '../../db';
import {
  users,
  events,
  tickets,
  ticketTypes,
  platformConfigurations,
  orders,
  orderItems,
} from '../../db/schema';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  getCachedDashboardStats,
  cacheDashboardStats,
  getCachedMonthlyRevenueData,
  cacheMonthlyRevenueData,
  getCachedUserGrowthData,
  cacheUserGrowthData,
  getCachedEventStatistics,
  cacheEventStatistics,
} from '../../utils/redis';

// Use inferred types from schema
type User = typeof users.$inferSelect;

// Define interfaces for function return types
interface UserStats {
  totalSpent: number;
  eventsAttended: number;
  eventsUpcoming: number;
  eventsCancelled: number;
}

interface UserEventTicketTypeInfo {
  id: string;
  name: string;
  count: number;
  price: number;
}

interface UserEvent {
  id: string;
  title: string;
  startTimestamp: string;
  status: string;
  totalTickets: number;
  ticketTypes: UserEventTicketTypeInfo[];
}

interface UserTransaction {
  id: string;
  eventTitle: string;
  amount: number;
  createdAt: string;
  status: string;
}

interface MonthlyUserStat {
  month: string;
  total: number;
}

interface DashboardStats {
  users: {
    total: number;
    growthRate: number;
    newSinceLastMonth: number;
  };
  revenue: {
    total: number;
    growthRate: string; // Can be "+X.XX" or "-X.XX"
    newSinceLastMonth: number;
  };
  platformFee: {
    currentRate: number;
    lastChanged: string;
  };
}

interface MonthlyRevenueData {
  month: string;
  year: number;
  revenue: number;
  totalSales: number;
  ticketsSold: number;
}

interface UserGrowthData {
  month: string;
  year: number;
  newUsers: number;
  totalUsers: number;
}

interface EventStatistics {
  month: string;
  year: number;
  newEvents: number;
  ticketsSold: number;
  averageTicketsPerEvent: number;
  eventOccupancyRate: number;
}

// Admin user management functions
export async function getAllUsers(): Promise<User[]> {
  try {
    const allUsers = await db.select().from(users);
    return allUsers;
  } catch (error) {
    logger.error(`Error fetching all users: ${error}`);
    throw error;
  }
}

export async function getUserById(id: string): Promise<User> {
  try {
    const user = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (!user.length) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    return user[0];
  } catch (error) {
    logger.error(`Error fetching user by ID ${id}: ${error}`);
    throw error;
  }
}

export async function updateUser(
  id: string,
  data: {
    role?: 'user' | 'organizer' | 'admin';
    status?: 'active' | 'inactive' | 'banned';
  },
): Promise<User> {
  try {
    // Only update the fields that are provided
    const updateData: Partial<typeof users.$inferInsert> = {};

    if (data.role) {
      updateData.role = data.role;
    }

    if (data.status) {
      updateData.status = data.status;
    }

    const updatedUser = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser.length) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    return updatedUser[0];
  } catch (error) {
    logger.error(`Error updating user ${id}: ${error}`);
    throw error;
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    const deleted = await db.delete(users).where(eq(users.id, id)).returning();

    if (!deleted.length) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    return true;
  } catch (error) {
    logger.error(`Error deleting user ${id}: ${error}`);
    throw error;
  }
}

// Function to get user statistics (Optimized)
export async function getUserStats(id: string): Promise<UserStats> {
  try {
    // Check if user exists first to ensure ID is valid
    await getUserById(id);

    const now = new Date();

    // Use a single query with conditional aggregation
    const statsResult = await db
      .select({
        totalSpentCents: sum(
          sql<number>`CASE WHEN ${tickets.status} = 'booked' THEN COALESCE(${tickets.price}, 0) ELSE 0 END`,
        ).mapWith(Number),
        eventsAttended: countDistinct(
          sql`CASE WHEN ${tickets.status} = 'booked' AND ${events.startTimestamp} < ${now} THEN ${tickets.eventId} ELSE NULL END`,
        ),
        eventsUpcoming: count(
          sql`CASE WHEN ${tickets.status} = 'booked' AND ${events.startTimestamp} >= ${now} THEN 1 ELSE NULL END`,
        ),
        // Assuming 'cancelled' or 'refunded' are possible statuses
        eventsCancelled: count(
          sql`CASE WHEN ${tickets.status} LIKE '%cancel%' OR ${tickets.status} LIKE '%refund%' THEN 1 ELSE NULL END`,
        ),
      })
      .from(tickets)
      .leftJoin(events, eq(tickets.eventId, events.id))
      .where(eq(tickets.userId, id));

    const stats = statsResult[0] || {
      totalSpentCents: 0,
      eventsAttended: 0,
      eventsUpcoming: 0,
      eventsCancelled: 0,
    };

    return {
      totalSpent: (stats.totalSpentCents || 0) / 100, // Convert cents to dollars
      eventsAttended: stats.eventsAttended || 0,
      eventsUpcoming: stats.eventsUpcoming || 0,
      eventsCancelled: stats.eventsCancelled || 0,
    };
  } catch (error) {
    logger.error(`Error fetching stats for user ${id}: ${error}`);
    if (error instanceof NotFoundError) {
      throw error; // Rethrow NotFoundError specifically
    }
    // Throw a generic error for other issues
    throw new Error(`Failed to fetch user statistics for user ${id}`);
  }
}

// Function to get user events
export async function getUserEvents(id: string): Promise<UserEvent[]> {
  try {
    // Check if user exists
    await getUserById(id);

    // Get the current date
    const now = new Date();

    // Query for tickets the user has purchased, with event details and ticket type details
    const userTickets = await db
      .select({
        ticketId: tickets.id,
        eventId: events.id,
        title: events.title,
        startTimestamp: events.startTimestamp,
        status: tickets.status,
        price: tickets.price,
        ticketTypeId: ticketTypes.id,
        ticketTypeName: ticketTypes.name,
      })
      .from(tickets)
      .leftJoin(events, eq(tickets.eventId, events.id))
      .leftJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .where(eq(tickets.userId, id));

    // Define interface for ticket type info
    interface TicketTypeInfo {
      id: string;
      name: string;
      count: number;
      price: number;
    }

    // Define interface for event data with ticket types
    interface EventWithTickets {
      id: string;
      title: string;
      startTimestamp: Date | null;
      status: string;
      ticketTypes: Record<string, TicketTypeInfo>;
      totalTickets: number;
    }

    // Group tickets by eventId
    const eventMap = new Map<string, EventWithTickets>();

    userTickets.forEach((ticket) => {
      // Skip if required fields are missing
      if (!ticket.eventId || !ticket.ticketTypeId) return;

      if (!eventMap.has(ticket.eventId)) {
        // Initialize event with empty ticketTypes object
        eventMap.set(ticket.eventId, {
          id: ticket.eventId,
          title: ticket.title || '',
          startTimestamp: ticket.startTimestamp,
          status:
            ticket.startTimestamp && new Date(ticket.startTimestamp) < now
              ? 'attended'
              : 'upcoming',
          ticketTypes: {},
          totalTickets: 0,
        });
      }

      const event = eventMap.get(ticket.eventId);
      if (!event) return; // TypeScript guard

      // Group by ticket type within event
      if (!event.ticketTypes[ticket.ticketTypeId]) {
        event.ticketTypes[ticket.ticketTypeId] = {
          id: ticket.ticketTypeId,
          name: ticket.ticketTypeName || 'Unknown Ticket Type',
          count: 1,
          price: ticket.price || 0, // Added null check
        };
      } else {
        // Increment count for this ticket type
        event.ticketTypes[ticket.ticketTypeId].count += 1;
      }

      // Increment total tickets for this event
      event.totalTickets += 1;
    });

    // Convert to array and format
    const uniqueEvents = Array.from(eventMap.values());

    // Format the output
    return uniqueEvents.map((event) => {
      // Convert ticketTypes object to array
      const ticketTypesArray: TicketTypeInfo[] = Object.values(
        event.ticketTypes,
      );

      return {
        id: event.id,
        title: event.title,
        startTimestamp: event.startTimestamp
          ? event.startTimestamp.toISOString()
          : new Date().toISOString(),
        status: event.status,
        totalTickets: event.totalTickets,
        ticketTypes: ticketTypesArray.map((type) => ({
          id: type.id,
          name: type.name,
          count: type.count,
          price: type.price / 100, // Convert cents to dollars for display
        })),
      };
    });
  } catch (error) {
    logger.error(`Error fetching events for user ${id}: ${error}`);
    throw error;
  }
}

// Function to get user transactions
export async function getUserTransactions(
  id: string,
): Promise<UserTransaction[]> {
  try {
    // Check if user exists
    await getUserById(id);

    // Query for user transactions (using orders table if exists, otherwise use tickets)
    // Note: Depending on your schema, you might need to join with an orders table instead
    const userTransactions = await db
      .select({
        id: tickets.id,
        eventTitle: events.title,
        amount: tickets.price,
        createdAt: tickets.bookedAt,
        status: tickets.status,
      })
      .from(tickets)
      .leftJoin(events, eq(tickets.eventId, events.id))
      .where(eq(tickets.userId, id))
      .orderBy(tickets.bookedAt);

    // Format the data
    return userTransactions
      .filter((t) => t.createdAt !== null)
      .map((transaction) => ({
        id: transaction.id,
        eventTitle: transaction.eventTitle || 'Unknown Event',
        amount: (transaction.amount || 0) / 100, // Convert cents to dollars, added null check
        createdAt: transaction.createdAt
          ? transaction.createdAt.toISOString()
          : new Date().toISOString(),
        status:
          transaction.status === 'booked'
            ? 'completed'
            : transaction.status || 'unknown', // Added null check for status
      }));
  } catch (error) {
    logger.error(`Error fetching transactions for user ${id}: ${error}`);
    throw error;
  }
}

// Get monthly user registration statistics for the past 6 months (Optimized)
export async function getMonthlyUserStats(): Promise<{
  data: MonthlyUserStat[];
}> {
  try {
    logger.info('Fetching monthly user registration statistics');
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // Go back 5 months to include the current month
    sixMonthsAgo.setDate(1); // Start from the 1st day of that month
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // Use sql template literal for date extraction
    const yearCol = sql<number>`EXTRACT(YEAR FROM ${users.createdAt})`.as(
      'year',
    );
    const monthCol = sql<number>`EXTRACT(MONTH FROM ${users.createdAt})`.as(
      'month',
    );
    const userCountCol = count(users.id).mapWith(Number).as('count');

    const monthlyCounts = await db
      .select({
        year: yearCol,
        month: monthCol,
        count: userCountCol,
      })
      .from(users)
      .where(gte(users.createdAt, sixMonthsAgo)) // Filter users created in the last 6 months
      .groupBy(yearCol, monthCol)
      .orderBy(yearCol, monthCol);

    // Format the result
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    // Create a map for the last 6 months to ensure all months are present
    const resultDataMap = new Map<string, MonthlyUserStat>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const monthIndex = date.getMonth(); // 0-based
      const monthKey = `${year}-${monthIndex + 1}`;
      resultDataMap.set(monthKey, {
        month: monthNames[monthIndex],
        total: 0,
      });
    }

    // Populate the map with actual counts
    monthlyCounts.forEach((row) => {
      const monthKey = `${row.year}-${row.month}`;
      if (resultDataMap.has(monthKey)) {
        resultDataMap.get(monthKey)!.total = row.count;
      }
    });

    const result = Array.from(resultDataMap.values());

    logger.info(
      `Successfully fetched monthly user stats: ${result.length} months`,
    );
    return { data: result };
  } catch (error) {
    logger.error(`Error fetching monthly user stats: ${error}`);
    throw new Error('Failed to fetch monthly user statistics'); // Generic error
  }
}

// Optimized getDashboardStats using database aggregation
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // First, try to get from cache
    const cachedStats = await getCachedDashboardStats();
    if (cachedStats) {
      logger.info('Using cached dashboard statistics');
      return cachedStats;
    }

    logger.info(
      'Dashboard stats not found in cache, fetching from database...',
    );

    // --- User Statistics ---
    const userStats = await db
      .select({
        totalUsers: count(users.id),
        // Use SQL for date comparison for better performance
        newUsers: count(
          sql`CASE WHEN ${users.createdAt} > date_trunc('month', current_date) THEN 1 ELSE NULL END`,
        ),
      })
      .from(users);

    const totalUsers = userStats[0]?.totalUsers || 0;
    const newUsers = userStats[0]?.newUsers || 0;
    const growthRate = totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0;

    // --- Platform Fee ---
    let platformFeePercentage = 2.5; // Default value
    let platformFeeLastChanged = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString(); // Default 30 days ago

    try {
      const configs = await db
        .select()
        .from(platformConfigurations)
        .where(eq(platformConfigurations.key, 'platform_fee'))
        .orderBy(desc(platformConfigurations.updatedAt)) // Get the latest config
        .limit(1);

      if (configs.length > 0) {
        platformFeePercentage = parseFloat(configs[0].value);
        if (configs[0].updatedAt) {
          platformFeeLastChanged = configs[0].updatedAt.toISOString();
        }
        logger.info(
          `Using platform fee: ${platformFeePercentage}% (last changed: ${platformFeeLastChanged})`,
        );
      } else {
        logger.warn('Platform fee configuration not found, using default.');
      }
    } catch (feeError) {
      logger.warn(`Using default platform fee due to error: ${feeError}`);
    }

    // --- Revenue Statistics (Optimized using DB Aggregation) ---
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month

    // Aggregate sales directly in the database
    const salesAggregation = await db
      .select({
        // Sum prices (assuming they are in cents)
        totalSalesCents: sum(tickets.price).mapWith(Number),
        currentMonthSalesCents: sum(
          sql<number>`CASE WHEN ${orders.createdAt} >= ${currentMonthStart} AND ${orders.createdAt} <= ${now} THEN ${tickets.price} ELSE 0 END`,
        ).mapWith(Number),
        previousMonthSalesCents: sum(
          sql<number>`CASE WHEN ${orders.createdAt} >= ${previousMonthStart} AND ${orders.createdAt} <= ${previousMonthEnd} THEN ${tickets.price} ELSE 0 END`,
        ).mapWith(Number),
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId)) // Use innerJoin as we only care about orders with items
      .innerJoin(tickets, eq(orderItems.ticketId, tickets.id)) // Use innerJoin as we only care about items with tickets
      .where(eq(orders.status, 'completed')); // Filter for completed orders

    const aggregatedSales = salesAggregation[0] || {
      totalSalesCents: 0,
      currentMonthSalesCents: 0,
      previousMonthSalesCents: 0,
    };

    // Convert cents to dollars
    const totalSales = (aggregatedSales.totalSalesCents || 0) / 100;
    const currentMonthSales =
      (aggregatedSales.currentMonthSalesCents || 0) / 100;
    const previousMonthSales =
      (aggregatedSales.previousMonthSalesCents || 0) / 100;

    // Calculate platform's revenue from sales
    const totalRevenue = (totalSales * platformFeePercentage) / 100;
    const currentMonthRevenue =
      (currentMonthSales * platformFeePercentage) / 100;
    const previousMonthRevenue =
      (previousMonthSales * platformFeePercentage) / 100;

    // Calculate revenue growth rate
    let revenueGrowthRate = 0;
    if (previousMonthRevenue > 0) {
      revenueGrowthRate =
        ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) *
        100;
    } else if (currentMonthRevenue > 0) {
      revenueGrowthRate = 100; // Growth is 100% if previous was zero and current is positive
    }

    logger.info(`Total Platform Revenue: $${totalRevenue.toFixed(2)}`);
    logger.info(`Current Month Revenue: $${currentMonthRevenue.toFixed(2)}`);
    logger.info(`Previous Month Revenue: $${previousMonthRevenue.toFixed(2)}`);
    logger.info(`Revenue Growth Rate: ${revenueGrowthRate.toFixed(2)}%`);

    // --- Construct Response ---
    const response: DashboardStats = {
      users: {
        total: totalUsers,
        growthRate: parseFloat(growthRate.toFixed(2)),
        newSinceLastMonth: newUsers,
      },
      revenue: {
        total: parseFloat(totalRevenue.toFixed(2)),
        growthRate:
          revenueGrowthRate > 0
            ? `+${revenueGrowthRate.toFixed(2)}`
            : `${revenueGrowthRate.toFixed(2)}`,
        newSinceLastMonth: parseFloat(currentMonthRevenue.toFixed(2)),
      },
      platformFee: {
        currentRate: platformFeePercentage,
        lastChanged: platformFeeLastChanged,
      },
    };

    // Cache the response before returning
    await cacheDashboardStats(response);

    return response;
  } catch (error) {
    logger.error(`Error fetching dashboard stats: ${error}`);
    // Ensure a specific error type or rethrow
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    throw new Error(`Failed to fetch dashboard stats: ${error}`);
  }
}

/**
 * Get monthly revenue data for the past year (Optimized)
 */
export async function getMonthlyRevenueData(): Promise<MonthlyRevenueData[]> {
  try {
    // First, try to get from cache
    const cachedData = await getCachedMonthlyRevenueData();
    if (cachedData) {
      logger.info('Using cached monthly revenue data');
      return cachedData;
    }

    logger.info(
      'Monthly revenue data not found in cache, fetching from database...',
    );

    // Get the current date and create a date for 12 months ago
    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1); // Start from the 1st day of the month
    startDate.setHours(0, 0, 0, 0);

    // Get platform fee percentage
    let platformFeePercentage = 2.5; // Default value
    try {
      const configs = await db
        .select()
        .from(platformConfigurations)
        .where(eq(platformConfigurations.key, 'platform_fee'))
        .orderBy(desc(platformConfigurations.updatedAt))
        .limit(1);

      if (configs.length > 0) {
        platformFeePercentage = parseFloat(configs[0].value);
      }
    } catch (feeError) {
      logger.warn(`Using default platform fee due to error: ${feeError}`);
    }

    // Define columns for extraction and aggregation
    const yearCol = sql<number>`EXTRACT(YEAR FROM ${orders.createdAt})`.as(
      'year',
    );
    const monthCol = sql<number>`EXTRACT(MONTH FROM ${orders.createdAt})`.as(
      'month',
    );
    const totalSalesCol = sum(sql<number>`COALESCE(${tickets.price}, 0)`)
      .mapWith(Number)
      .as('total_sales_cents');
    const ticketsSoldCount = count(tickets.id)
      .mapWith(Number)
      .as('tickets_sold');

    // Aggregate monthly sales and ticket counts directly in the database
    const monthlyAggregations = await db
      .select({
        year: yearCol,
        month: monthCol,
        totalSalesCents: totalSalesCol,
        ticketsSold: ticketsSoldCount,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(tickets, eq(orderItems.ticketId, tickets.id))
      .where(
        and(
          eq(orders.status, 'completed'),
          gte(orders.createdAt, startDate), // Filter by date range
          lte(orders.createdAt, currentDate),
        ),
      )
      .groupBy(yearCol, monthCol) // Group by year and month
      .orderBy(yearCol, monthCol); // Order chronologically

    // Create month buckets for the last 12 months
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthlyRevenueMap = new Map<string, MonthlyRevenueData>();

    for (let i = 0; i < 12; i++) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + i);
      const year = date.getFullYear();
      const monthIndex = date.getMonth(); // 0-based index
      const monthKey = `${year}-${monthIndex + 1}`; // Key like "2024-5"

      monthlyRevenueMap.set(monthKey, {
        month: monthNames[monthIndex],
        year: year,
        revenue: 0,
        totalSales: 0,
        ticketsSold: 0,
      });
    }

    // Populate the map with aggregated data
    monthlyAggregations.forEach((agg) => {
      const monthKey = `${agg.year}-${agg.month}`;
      const monthData = monthlyRevenueMap.get(monthKey);

      if (monthData) {
        const totalSales = (agg.totalSalesCents || 0) / 100; // Convert cents to dollars
        monthData.totalSales = parseFloat(totalSales.toFixed(2));
        monthData.ticketsSold = agg.ticketsSold || 0;
        monthData.revenue = parseFloat(
          (totalSales * (platformFeePercentage / 100)).toFixed(2),
        );
      }
    });

    // Convert map values to array, ensuring chronological order
    const finalMonthlyRevenue = Array.from(monthlyRevenueMap.values());

    // Cache the data before returning
    await cacheMonthlyRevenueData(finalMonthlyRevenue);

    return finalMonthlyRevenue;
  } catch (error) {
    logger.error(`Error fetching monthly revenue data: ${error}`);
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    throw new Error(`Failed to fetch monthly revenue data: ${error}`);
  }
}

/**
 * Get user growth data for the past year (Optimized)
 */
export async function getUserGrowthData(): Promise<UserGrowthData[]> {
  try {
    // First, try to get from cache
    const cachedData = await getCachedUserGrowthData();
    if (cachedData) {
      logger.info('Using cached user growth data');
      return cachedData;
    }

    logger.info(
      'User growth data not found in cache, fetching from database...',
    );

    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    // Use sql template literal for date extraction
    const yearCol = sql<number>`EXTRACT(YEAR FROM ${users.createdAt})`.as(
      'year',
    );
    const monthCol = sql<number>`EXTRACT(MONTH FROM ${users.createdAt})`.as(
      'month',
    );
    const newUserCountCol = count(users.id).mapWith(Number).as('new_users');

    // Aggregate new users per month in the database
    const monthlyNewUsers = await db
      .select({
        year: yearCol,
        month: monthCol,
        newUsers: newUserCountCol,
      })
      .from(users)
      .where(gte(users.createdAt, startDate)) // Filter users created within the last 12 months
      .groupBy(yearCol, monthCol)
      .orderBy(yearCol, monthCol);

    // Count users created before the start date
    const usersBeforeStartDateCount = await db
      .select({ count: count(users.id) })
      .from(users)
      .where(lt(users.createdAt, startDate)) // Use lt for less than
      .then((result) => result[0]?.count || 0);

    // Create month buckets and calculate cumulative totals
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthlyGrowthMap = new Map<string, UserGrowthData>();
    let cumulativeCount = usersBeforeStartDateCount;

    for (let i = 0; i < 12; i++) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + i);
      const year = date.getFullYear();
      const monthIndex = date.getMonth(); // 0-based
      const monthKey = `${year}-${monthIndex + 1}`;

      monthlyGrowthMap.set(monthKey, {
        month: monthNames[monthIndex],
        year: year,
        newUsers: 0,
        totalUsers: 0, // Will be calculated later
      });
    }

    // Populate new users and calculate cumulative totals
    monthlyNewUsers.forEach((row) => {
      const monthKey = `${row.year}-${row.month}`;
      if (monthlyGrowthMap.has(monthKey)) {
        monthlyGrowthMap.get(monthKey)!.newUsers = row.newUsers;
      }
    });

    // Calculate cumulative totals chronologically
    const finalMonthlyGrowth: UserGrowthData[] = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + i);
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      const monthKey = `${year}-${monthIndex + 1}`;
      const monthData = monthlyGrowthMap.get(monthKey)!;

      cumulativeCount += monthData.newUsers;
      monthData.totalUsers = cumulativeCount;
      finalMonthlyGrowth.push(monthData);
    }

    // Cache the data before returning
    await cacheUserGrowthData(finalMonthlyGrowth);

    logger.info('Successfully fetched and calculated user growth data');
    return finalMonthlyGrowth;
  } catch (error) {
    logger.error(`Error fetching user growth data: ${error}`);
    // Throw a generic error
    throw new Error(`Failed to fetch user growth data: ${error}`);
  }
}

// Define a temporary type for monthStat including totalCapacity - REMOVED as it's no longer needed here

/**
 * Get event statistics for the past year (Optimized)
 */
export async function getEventStatistics(): Promise<EventStatistics[]> {
  try {
    // First, try to get from cache
    const cachedData = await getCachedEventStatistics();
    if (cachedData) {
      logger.info('Event statistics found in cache.');
      return cachedData;
    }

    logger.info(
      'Event statistics not found in cache, fetching from database...',
    );

    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    // Use sql template literal for date extraction
    const eventYearCol =
      sql<number>`EXTRACT(YEAR FROM ${events.startTimestamp})`.as('event_year');
    const eventMonthCol =
      sql<number>`EXTRACT(MONTH FROM ${events.startTimestamp})`.as(
        'event_month',
      );

    // Aggregate event counts and total capacity per month
    const monthlyEventStats = await db
      .select({
        year: eventYearCol,
        month: eventMonthCol,
        newEvents: count(events.id).mapWith(Number),
        totalCapacity: sum(
          sql<number>`COALESCE(${events.capacity}, 0)`,
        ).mapWith(Number),
      })
      .from(events)
      .where(
        and(
          gte(events.startTimestamp, startDate),
          lte(events.startTimestamp, currentDate),
          eq(events.status, 'published'), // Consider only published events
        ),
      )
      .groupBy(eventYearCol, eventMonthCol)
      .orderBy(eventYearCol, eventMonthCol);

    // Aggregate tickets sold per month based on event start date range
    const monthlyTicketStats = await db
      .select({
        year: eventYearCol, // Group by event's month/year
        month: eventMonthCol,
        ticketsSold: count(tickets.id).mapWith(Number),
      })
      .from(tickets)
      .innerJoin(events, eq(tickets.eventId, events.id)) // Join to filter by event date range and status
      .where(
        and(
          eq(tickets.status, 'booked'),
          gte(events.startTimestamp, startDate), // Ensure event is within the range
          lte(events.startTimestamp, currentDate),
          eq(events.status, 'published'), // Ensure event is published
          // Optional: Filter tickets by bookedAt as well if needed
          // gte(tickets.bookedAt, startDate),
          // lte(tickets.bookedAt, currentDate),
        ),
      )
      .groupBy(eventYearCol, eventMonthCol) // Group by event's month/year
      .orderBy(eventYearCol, eventMonthCol);

    // Create month buckets and combine results
    const finalStatsMap = new Map<
      string,
      EventStatistics & { totalCapacity: number }
    >();

    for (let i = 0; i < 12; i++) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + i);
      const year = date.getFullYear();
      const monthIndex = date.getMonth(); // 0-based
      const monthKey = `${year}-${monthIndex + 1}`;

      finalStatsMap.set(monthKey, {
        month: monthNames[monthIndex],
        year: year,
        newEvents: 0,
        ticketsSold: 0,
        averageTicketsPerEvent: 0,
        eventOccupancyRate: 0,
        totalCapacity: 0, // Temporary field
      });
    }

    // Populate event stats
    monthlyEventStats.forEach((row) => {
      const monthKey = `${row.year}-${row.month}`;
      if (finalStatsMap.has(monthKey)) {
        const monthData = finalStatsMap.get(monthKey)!;
        monthData.newEvents = row.newEvents;
        monthData.totalCapacity = row.totalCapacity || 0; // Ensure capacity is a number
      }
    });

    // Populate ticket stats
    monthlyTicketStats.forEach((row) => {
      const monthKey = `${row.year}-${row.month}`;
      if (finalStatsMap.has(monthKey)) {
        finalStatsMap.get(monthKey)!.ticketsSold = row.ticketsSold;
      }
    });

    // Calculate derived metrics
    finalStatsMap.forEach((monthStat) => {
      if (monthStat.newEvents > 0) {
        monthStat.averageTicketsPerEvent = parseFloat(
          (monthStat.ticketsSold / monthStat.newEvents).toFixed(2),
        );
      }
      if (monthStat.totalCapacity > 0) {
        monthStat.eventOccupancyRate = parseFloat(
          ((monthStat.ticketsSold / monthStat.totalCapacity) * 100).toFixed(2),
        );
      }
    });

    // Convert map to array and remove temporary field
    const finalStats: EventStatistics[] = Array.from(
      finalStatsMap.values(),
    ).map(({ totalCapacity: _unusedCapacity, ...rest }) => rest);

    // Cache the data before returning
    await cacheEventStatistics(finalStats);
    logger.info('Successfully fetched and calculated event statistics');
    return finalStats;
  } catch (error) {
    logger.error(`Error fetching event statistics: ${error}`);
    if (error instanceof Error) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    throw new Error(`Failed to fetch event statistics: ${error}`);
  }
}
