import { eq, inArray, and, gte, lte, count, sql } from 'drizzle-orm';
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
type Event = typeof events.$inferSelect;
type Ticket = typeof tickets.$inferSelect;
type TicketType = typeof ticketTypes.$inferSelect;
type Order = typeof orders.$inferSelect;
type OrderItem = typeof orderItems.$inferSelect;
type PlatformConfiguration = typeof platformConfigurations.$inferSelect;

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

// Define a type for the ticket object when calculating sales
// Extend the inferred Ticket type
interface TicketWithOrderDate extends Ticket {
  orderCreatedAt?: Date | null;
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

// Function to get user statistics
export async function getUserStats(id: string): Promise<UserStats> {
  try {
    // Check if user exists
    await getUserById(id);

    // Query for tickets purchased by the user with event information
    const userTickets = await db
      .select({
        ticketId: tickets.id,
        price: tickets.price,
        status: tickets.status,
        eventId: tickets.eventId,
        startTimestamp: events.startTimestamp,
      })
      .from(tickets)
      .leftJoin(events, eq(tickets.eventId, events.id))
      .where(eq(tickets.userId, id));

    // Calculate total spent (converting cents to dollars)
    const totalSpent =
      userTickets
        .filter((ticket) => ticket.status === 'booked')
        .reduce((sum, ticket) => sum + (ticket.price || 0), 0) / 100; // Added null check for price

    // Get the current date
    const now = new Date();

    // Filter tickets for booked events that have already started
    const attendedTickets = userTickets.filter(
      (ticket) =>
        ticket.status === 'booked' &&
        ticket.startTimestamp &&
        new Date(ticket.startTimestamp) < now,
    );

    // Count unique attended events using a Set
    const attendedEventIds = new Set(
      attendedTickets.map((ticket) => ticket.eventId),
    );
    const eventsAttended = attendedEventIds.size;

    // Events are considered "upcoming" if they are booked and their start date is in the future
    const eventsUpcoming = userTickets.filter(
      (ticket) =>
        ticket.status === 'booked' &&
        ticket.startTimestamp &&
        new Date(ticket.startTimestamp) >= now,
    ).length;

    // Check if status includes any cancellation-related values
    const eventsCancelled = userTickets.filter(
      (ticket) =>
        typeof ticket.status === 'string' &&
        (ticket.status.includes('cancel') || ticket.status.includes('refund')),
    ).length;

    return {
      totalSpent,
      eventsAttended,
      eventsUpcoming,
      eventsCancelled,
    };
  } catch (error) {
    logger.error(`Error fetching stats for user ${id}: ${error}`);
    throw error;
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

// Get monthly user registration statistics for the past 6 months
export async function getMonthlyUserStats(): Promise<{
  data: MonthlyUserStat[];
}> {
  try {
    // Get all users with their creation dates
    const allUsers = await db.select().from(users);

    // Create a map to hold monthly counts
    const monthlyCounts = new Map<string, number>();

    // Get the current date
    const now = new Date();

    // Initialize the last 6 months with zero counts
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      monthlyCounts.set(monthKey, 0);
    }

    // Count users registered in each month
    for (const user of allUsers) {
      if (user.createdAt) {
        const createdAt = new Date(user.createdAt);
        // Check if the user was created in the last 6 months
        const monthDiff =
          (now.getFullYear() - createdAt.getFullYear()) * 12 +
          now.getMonth() -
          createdAt.getMonth();

        if (monthDiff >= 0 && monthDiff < 6) {
          const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
          const currentCount = monthlyCounts.get(monthKey) || 0;
          monthlyCounts.set(monthKey, currentCount + 1);
        }
      }
    }

    // Convert the map to an array of {month, total} objects
    // Format: month: "Jan", total: 123
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
    const result = Array.from(monthlyCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0])) // Sort by year-month
      .map(([key, count]) => {
        const [, month] = key.split('-').map(Number); // Year is unused, only need month index
        return {
          month: monthNames[month - 1],
          total: count,
        };
      });

    return { data: result };
  } catch (error) {
    logger.error(`Error fetching monthly user stats: ${error}`);
    throw error;
  }
}

// Update getDashboardStats to use real platform fee data and get revenue from completed orders
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

    // Get user statistics
    const allUsers = await db.select().from(users);
    const totalUsers = allUsers.length;

    // Get date ranges for current month and previous month
    const now = new Date();

    // Get the current calendar month (1st day of current month to today)
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1); // 1st day of current month

    // Get previous calendar month (1st day to last day of previous month)
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ); // 1st day of previous month
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month

    // Count users who registered in the last month
    const newUsers = allUsers.filter(
      (user) => user.createdAt && new Date(user.createdAt) > currentMonthStart,
    ).length;

    // Calculate growth rate (simplified)
    const growthRate = totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0;

    // First, get the platform fee to calculate revenue
    let platformFeePercentage = 2.5; // Default value
    let platformFeeLastChanged = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString(); // Default 30 days ago

    try {
      const configs = await db
        .select()
        .from(platformConfigurations)
        .where(eq(platformConfigurations.key, 'platform_fee'))
        .limit(1);

      if (configs.length > 0) {
        // Log the raw value from database for debugging
        logger.info(`Raw platform fee from database: "${configs[0].value}"`);

        // Value is stored as a string, parse to get the percentage
        platformFeePercentage = parseFloat(configs[0].value);
        logger.info(`Parsed platform fee: ${platformFeePercentage}`);

        // Handle the updatedAt timestamp - convert to ISO string if it exists
        if (configs[0].updatedAt) {
          // updatedAt is a Date object from the database timestamp field
          platformFeeLastChanged = configs[0].updatedAt.toISOString();
        }
      }
    } catch (feeError) {
      // Use the error variable
      logger.warn(`Using default platform fee due to error: ${feeError}`);
    }

    // Get all completed orders
    const completedOrders = await db
      .select({
        id: orders.id,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.status, 'completed'));

    // Log a summary of completed orders instead of individual details
    logger.info(`Found ${completedOrders.length} completed orders`);

    // Initialize revenue variables
    let totalSales = 0;
    let currentMonthSales = 0;
    let previousMonthSales = 0;

    // Use a Map to ensure we count each ticket only once
    const uniqueTickets = new Map<string, TicketWithOrderDate>();

    if (completedOrders.length > 0) {
      // Process order IDs in batches to avoid exceeding parameter limits
      const orderIds = completedOrders.map((order) => order.id);
      const BATCH_SIZE = 1000; // Process 1000 orders at a time

      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batchOrderIds = orderIds.slice(i, i + BATCH_SIZE);

        // Get order items with tickets for this batch of orders
        const orderItemsWithTickets = await db
          .select({
            orderItem: orderItems,
            ticket: tickets,
            order: orders,
          })
          .from(orderItems)
          .leftJoin(tickets, eq(orderItems.ticketId, tickets.id))
          .leftJoin(orders, eq(orderItems.orderId, orders.id))
          .where(inArray(orderItems.orderId, batchOrderIds));

        // Process each ticket in this batch
        orderItemsWithTickets.forEach((item) => {
          if (
            item.ticket &&
            item.ticket.id &&
            !uniqueTickets.has(item.ticket.id) &&
            item.order
          ) {
            // Store the order creation date with the ticket for time-based filtering
            uniqueTickets.set(item.ticket.id, {
              ...item.ticket,
              orderCreatedAt: item.order.createdAt,
            });
          }
        });
      }

      // Calculate total sales from all tickets
      totalSales = Array.from(uniqueTickets.values()).reduce(
        (sum: number, ticketWithDate: TicketWithOrderDate) => {
          // Access price directly from the extended Ticket type
          return sum + (ticketWithDate?.price || 0) / 100; // Convert from cents to dollars
        },
        0,
      );

      // Calculate sales for current month (last 30 days)
      currentMonthSales = Array.from(uniqueTickets.values()).reduce(
        (sum: number, ticketWithDate: TicketWithOrderDate) => {
          if (
            ticketWithDate &&
            ticketWithDate.orderCreatedAt &&
            new Date(ticketWithDate.orderCreatedAt) >= currentMonthStart &&
            new Date(ticketWithDate.orderCreatedAt) <= now
          ) {
            // Access price directly
            return sum + (ticketWithDate?.price || 0) / 100;
          }
          return sum;
        },
        0,
      );

      // Calculate sales for previous month (30-60 days ago)
      previousMonthSales = Array.from(uniqueTickets.values()).reduce(
        (sum: number, ticketWithDate: TicketWithOrderDate) => {
          if (
            ticketWithDate &&
            ticketWithDate.orderCreatedAt &&
            new Date(ticketWithDate.orderCreatedAt) >= previousMonthStart &&
            new Date(ticketWithDate.orderCreatedAt) <= previousMonthEnd
          ) {
            // Access price directly
            return sum + (ticketWithDate?.price || 0) / 100;
          }
          return sum;
        },
        0,
      );
    }

    // Calculate platform's revenue from sales
    const totalRevenue = (totalSales * platformFeePercentage) / 100;
    const currentMonthRevenue =
      (currentMonthSales * platformFeePercentage) / 100;
    const previousMonthRevenue =
      (previousMonthSales * platformFeePercentage) / 100;

    // Calculate the correct revenue growth rate comparing current month to previous month
    let revenueGrowthRate = 0;
    if (previousMonthRevenue > 0) {
      revenueGrowthRate =
        ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) *
        100;
    } else if (currentMonthRevenue > 0) {
      revenueGrowthRate = 100; // 100% growth if previous month was zero
    }

    // Log for debugging
    logger.info(`Total Platform Revenue: $${totalRevenue.toFixed(2)}`);
    logger.info(`Current Month Revenue: $${currentMonthRevenue.toFixed(2)}`);
    logger.info(`Previous Month Revenue: $${previousMonthRevenue.toFixed(2)}`);
    logger.info(`Revenue Growth Rate: ${revenueGrowthRate.toFixed(2)}%`);

    // Create the final response object
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
    throw error;
  }
}

/**
 * Get monthly revenue data for the past year
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
        .limit(1);

      if (configs.length > 0) {
        platformFeePercentage = parseFloat(configs[0].value);
      }
    } catch (feeError) {
      // Use the error variable
      logger.warn(`Using default platform fee due to error: ${feeError}`);
    }

    // Get all completed orders in the date range
    const completedOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.status, 'completed'));

    // Create month buckets for the last 12 months
    const monthlyRevenue: MonthlyRevenueData[] = new Array(12)
      .fill(0)
      .map((_, index) => {
        const date = new Date(startDate);
        date.setMonth(startDate.getMonth() + index);
        return {
          month: date.toLocaleString('default', { month: 'short' }),
          year: date.getFullYear(),
          revenue: 0,
          totalSales: 0,
          ticketsSold: 0,
        };
      });

    // Get order IDs for completed orders
    const orderIds = completedOrders.map((order) => order.id);

    if (orderIds.length > 0) {
      // Process order IDs in batches to avoid exceeding parameter limits
      const BATCH_SIZE = 1000; // Process 1000 orders at a time

      for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
        const batchOrderIds = orderIds.slice(i, i + BATCH_SIZE);

        // Get all order items and related tickets for this batch
        const orderItemsWithTickets = await db
          .select({
            orderItem: orderItems,
            ticket: tickets,
            order: orders,
          })
          .from(orderItems)
          .leftJoin(tickets, eq(orderItems.ticketId, tickets.id))
          .leftJoin(orders, eq(orderItems.orderId, orders.id))
          .where(inArray(orderItems.orderId, batchOrderIds));

        // Process each order item in this batch
        orderItemsWithTickets.forEach((item) => {
          if (item.order && item.order.createdAt && item.ticket) {
            const orderDate = new Date(item.order.createdAt);

            // Only include orders from the last 12 months
            if (orderDate >= startDate && orderDate <= currentDate) {
              // Calculate which month bucket this belongs to
              const monthDiff =
                (orderDate.getFullYear() - startDate.getFullYear()) * 12 +
                (orderDate.getMonth() - startDate.getMonth());

              if (monthDiff >= 0 && monthDiff < 12) {
                // Add ticket price to total sales for this month
                const ticketPrice = item.ticket.price || 0;
                monthlyRevenue[monthDiff].totalSales += ticketPrice / 100; // Convert cents to dollars
                monthlyRevenue[monthDiff].ticketsSold += 1;

                // Calculate platform revenue
                monthlyRevenue[monthDiff].revenue +=
                  (ticketPrice / 100) * (platformFeePercentage / 100);
              }
            }
          }
        });
      }
    }

    // Round values to 2 decimal places
    monthlyRevenue.forEach((month) => {
      month.revenue = parseFloat(month.revenue.toFixed(2));
      month.totalSales = parseFloat(month.totalSales.toFixed(2));
    });

    // Cache the data before returning
    await cacheMonthlyRevenueData(monthlyRevenue);

    return monthlyRevenue;
  } catch (error) {
    logger.error(`Error fetching monthly revenue data: ${error}`);
    throw error;
  }
}

/**
 * Get user growth data for the past year
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

    // Get the current date and create a date for 12 months ago
    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setMonth(startDate.getMonth() - 11);
    startDate.setDate(1); // Start from the 1st day of the month
    startDate.setHours(0, 0, 0, 0);

    // Get all users
    const allUsers = await db.select().from(users);

    // Create month buckets for the last 12 months
    const monthlyGrowth: UserGrowthData[] = new Array(12)
      .fill(0)
      .map((_, index) => {
        const date = new Date(startDate);
        date.setMonth(startDate.getMonth() + index);
        return {
          month: date.toLocaleString('default', { month: 'short' }),
          year: date.getFullYear(),
          newUsers: 0,
          totalUsers: 0,
        };
      });

    // Calculate cumulative user count for each month
    let cumulativeCount = 0;

    // First, count users who registered before the start date
    const usersBeforeStartDate = allUsers.filter(
      (user) => user.createdAt && new Date(user.createdAt) < startDate,
    ).length;

    cumulativeCount = usersBeforeStartDate;

    // Process each user
    allUsers.forEach((user) => {
      if (user.createdAt) {
        const registrationDate = new Date(user.createdAt);

        // Only include users from the last 12 months
        if (registrationDate >= startDate && registrationDate <= currentDate) {
          // Calculate which month bucket this belongs to
          const monthDiff =
            (registrationDate.getFullYear() - startDate.getFullYear()) * 12 +
            (registrationDate.getMonth() - startDate.getMonth());

          if (monthDiff >= 0 && monthDiff < 12) {
            // Increment new user count for this month
            monthlyGrowth[monthDiff].newUsers += 1;
          }
        }
      }
    });

    // Calculate cumulative totals
    for (let i = 0; i < monthlyGrowth.length; i++) {
      cumulativeCount += monthlyGrowth[i].newUsers;
      monthlyGrowth[i].totalUsers = cumulativeCount;
    }

    // Cache the data before returning
    await cacheUserGrowthData(monthlyGrowth);

    return monthlyGrowth;
  } catch (error) {
    logger.error(`Error fetching user growth data: ${error}`);
    throw error;
  }
}

// Define a temporary type for monthStat including totalCapacity
interface MonthlyStatWithCapacity extends EventStatistics {
  totalCapacity: number;
}

/**
 * Get event statistics for the past year
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

    // Get the current date and create a date for 12 months ago
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

    // Create month buckets for the last 12 months
    const monthlyStats: MonthlyStatWithCapacity[] = new Array(12)
      .fill(0)
      .map((_, index) => {
        const monthDate = new Date(startDate);
        monthDate.setMonth(startDate.getMonth() + index);
        return {
          month: monthNames[monthDate.getMonth()],
          year: monthDate.getFullYear(),
          newEvents: 0,
          ticketsSold: 0,
          averageTicketsPerEvent: 0,
          eventOccupancyRate: 0, // Initialize occupancy rate
          totalCapacity: 0, // Add total capacity for calculation
        };
      });

    // Fetch all relevant events within the 12-month range
    const relevantEvents = await db
      .select({
        id: events.id,
        startTimestamp: events.startTimestamp,
        capacity: events.capacity,
      })
      .from(events)
      .where(
        and(
          gte(events.startTimestamp, startDate),
          lte(events.startTimestamp, currentDate),
          eq(events.status, 'published'), // Consider only published events for stats
        ),
      );

    if (relevantEvents.length === 0) {
      logger.info('No relevant events found in the last 12 months.');
      // Remove totalCapacity before caching/returning - Corrected: removed unused destructuring
      const finalStats = monthlyStats.map(
        ({ totalCapacity: _unused, ...rest }) => rest,
      );
      await cacheEventStatistics(finalStats);
      return finalStats;
    }

    const eventIds = relevantEvents.map((e) => e.id);

    // Fetch tickets sold for these events
    const ticketsSoldData = await db
      .select({
        eventId: tickets.eventId,
        count: count(tickets.id),
        eventTimestamp: events.startTimestamp, // Include timestamp for grouping
      })
      .from(tickets)
      .leftJoin(events, eq(tickets.eventId, events.id)) // Join to get event timestamp
      .where(
        and(
          inArray(tickets.eventId, eventIds),
          eq(tickets.status, 'booked'), // Count only booked tickets
        ),
      )
      .groupBy(sql`${tickets.eventId}`, sql`${events.startTimestamp}`); // Use sql helper for groupBy

    // Map tickets sold to event IDs for easier lookup
    const ticketsSoldMap = new Map<string, number>();
    ticketsSoldData.forEach((item) => {
      if (item.eventId) {
        ticketsSoldMap.set(item.eventId, item.count);
      }
    });

    // Process events and aggregate stats by month
    relevantEvents.forEach((event) => {
      if (!event.startTimestamp) return; // Skip if no start timestamp
      const eventDate = new Date(event.startTimestamp);
      const monthIndex =
        (eventDate.getFullYear() - startDate.getFullYear()) * 12 +
        eventDate.getMonth() -
        startDate.getMonth();

      if (monthIndex >= 0 && monthIndex < 12) {
        const monthStat = monthlyStats[monthIndex];
        monthStat.newEvents += 1;
        const soldCount = ticketsSoldMap.get(event.id) || 0;
        monthStat.ticketsSold += soldCount;
        // Add event capacity to the month's total capacity
        monthStat.totalCapacity += event.capacity || 0; // Use 0 if capacity is null/undefined
      }
    });

    // Calculate average tickets and occupancy rate for each month
    monthlyStats.forEach((monthStat) => {
      if (monthStat.newEvents > 0) {
        monthStat.averageTicketsPerEvent = Math.round(
          monthStat.ticketsSold / monthStat.newEvents,
        );
      }
      if (monthStat.totalCapacity > 0) {
        monthStat.eventOccupancyRate = parseFloat(
          ((monthStat.ticketsSold / monthStat.totalCapacity) * 100).toFixed(2),
        );
      } else {
        // Handle case where total capacity is 0 (e.g., no events or events with 0 capacity)
        monthStat.eventOccupancyRate = 0;
      }
    });

    // Remove temporary totalCapacity field before returning/caching - Corrected: removed unused destructuring
    const finalStats: EventStatistics[] = monthlyStats.map(
      ({ totalCapacity: _unused, ...rest }) => rest,
    );

    // Cache the data before returning
    await cacheEventStatistics(finalStats);

    return finalStats;
  } catch (error) {
    logger.error(`Error fetching event statistics: ${error}`);
    throw error;
  }
}
