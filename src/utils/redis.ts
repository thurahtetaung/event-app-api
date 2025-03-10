import { createClient } from 'redis';
import { env } from '../config/env';
import { logger } from './logger';
import { eq, and } from 'drizzle-orm';
import { tickets } from '../db/schema';
import { db } from '../db';

const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => {
  logger.error(`Redis Client Error: ${err}`);
  logger.error(`Redis URL: ${env.REDIS_URL}`);
});

redisClient.on('connect', () => {
  logger.info(`Redis Client Connected`);
  logger.info(`Redis URL: ${env.REDIS_URL}`);
});

redisClient.on('ready', () => {
  logger.info('Redis Client Ready');
});

// Connect to Redis when the module is imported
redisClient
  .connect()
  .then(async () => {
    logger.info('Redis connection established');
    // Test Redis connection by setting a test key
    try {
      await redisClient.set('test:connection', 'ok');
      const testResult = await redisClient.get('test:connection');
      logger.info(
        `Redis test key set and retrieved successfully: ${testResult}`,
      );
    } catch (error) {
      logger.error(`Failed to set/get test key in Redis: ${error}`);
    }
  })
  .catch((err) => {
    logger.error(`Failed to connect to Redis: ${err}`);
    logger.error(`Redis URL: ${env.REDIS_URL}`);
  });

const TICKET_PREFIX = 'ticket:';
const LOCK_DURATION = env.REDIS_TICKET_LOCK_DURATION;

// Cache prefixes and TTLs for admin statistics
const ADMIN_STATS_PREFIX = 'admin:stats:';
const ADMIN_REVENUE_PREFIX = 'admin:revenue:';
const ADMIN_USER_GROWTH_PREFIX = 'admin:user_growth:';
const ADMIN_EVENT_STATS_PREFIX = 'admin:event_stats:';

// TTL values (in seconds)
const DASHBOARD_STATS_TTL = 60 * 15; // 15 minutes
const REVENUE_DATA_TTL = 60 * 60; // 1 hour
const USER_GROWTH_TTL = 60 * 60; // 1 hour
const EVENT_STATS_TTL = 60 * 60; // 1 hour

// Organization analytics cache
const ORG_ANALYTICS_PREFIX = 'org:analytics:';
const ORG_ANALYTICS_TTL = 60 * 15; // 15 minutes

export async function reserveTicket(
  ticketId: string,
  userId: string,
): Promise<boolean> {
  try {
    const key = TICKET_PREFIX + ticketId;
    logger.debug(`Attempting to reserve ticket ${ticketId} for user ${userId}`);
    logger.debug(`Using Redis key: ${key}`);

    // First try a simple set to see if it works
    const result = await redisClient.set(key, userId);
    logger.debug(`Simple Redis set result: ${result}`);

    if (result === 'OK') {
      // If simple set works, then set expiration
      const expResult = await redisClient.expire(key, LOCK_DURATION);
      logger.debug(`Redis expire result: ${expResult}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error reserving ticket ${ticketId}: ${error}`);
    logger.error(
      `Redis error details: ${JSON.stringify({
        ticketId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })}`,
    );
    return false;
  }
}

export async function isTicketReserved(
  ticketId: string,
  userId?: string,
): Promise<boolean> {
  try {
    const key = TICKET_PREFIX + ticketId;
    const reservedBy = await redisClient.get(key);
    if (userId) {
      return reservedBy !== null && reservedBy !== userId;
    }
    return reservedBy !== null;
  } catch (error) {
    logger.error(`Error checking ticket reservation ${ticketId}:`, error);
    return false;
  }
}

export async function releaseTicket(ticketId: string): Promise<boolean> {
  try {
    const key = TICKET_PREFIX + ticketId;

    // Check if ticket is actually reserved before attempting to release
    const isReserved = await isTicketReserved(ticketId);
    if (!isReserved) {
      logger.info(`Ticket ${ticketId} is not currently reserved in Redis`);
      return true; // Nothing to release, so operation is successful
    }

    // Get the user ID who reserved it for logging
    const userId = await getTicketReservation(ticketId);
    logger.info(
      `Releasing ticket ${ticketId} from Redis (reserved by user: ${userId || 'unknown'})`,
    );

    const result = await redisClient.del(key);
    const success = result === 1;
    logger.info(
      `Ticket ${ticketId} release result: ${success ? 'success' : 'failed'}`,
    );
    return success;
  } catch (error) {
    logger.error(`Error releasing ticket ${ticketId}:`, error);
    return false;
  }
}

export async function getTicketReservation(
  ticketId: string,
): Promise<string | null> {
  try {
    const key = TICKET_PREFIX + ticketId;
    return await redisClient.get(key);
  } catch (error) {
    logger.error(`Error getting ticket reservation from Redis: ${error}`);
    return null;
  }
}

export async function getReservedTicketCount(
  ticketTypeId: string,
): Promise<number> {
  try {
    // Get all tickets of this type
    const ticketsList = await db
      .select({
        id: tickets.id,
        ticketTypeId: tickets.ticketTypeId,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.ticketTypeId, ticketTypeId),
          eq(tickets.status, 'available'),
        ),
      );

    // Check each ticket's reservation status in Redis
    const reservationChecks = await Promise.all(
      ticketsList.map(async (ticket) => {
        const key = TICKET_PREFIX + ticket.id;
        const reservedBy = await redisClient.get(key);
        return reservedBy !== null;
      }),
    );

    // Count how many are reserved
    return reservationChecks.filter(Boolean).length;
  } catch (error) {
    logger.error(
      `Error counting reserved tickets for type ${ticketTypeId}: ${error}`,
    );
    return 0;
  }
}

export async function releaseUserTickets(userId: string): Promise<void> {
  try {
    const keys = await redisClient.keys(TICKET_PREFIX + '*');
    await Promise.all(
      keys.map(async (key) => {
        const reservedBy = await redisClient.get(key);
        if (reservedBy === userId) {
          await redisClient.del(key);
        }
      }),
    );
  } catch (error) {
    logger.error(`Error releasing user tickets for ${userId}:`, error);
  }
}

/**
 * Cache dashboard statistics
 */
export async function cacheDashboardStats(data: any): Promise<void> {
  try {
    const key = ADMIN_STATS_PREFIX + 'dashboard';
    await redisClient.set(key, JSON.stringify(data));
    await redisClient.expire(key, DASHBOARD_STATS_TTL);
    logger.debug(`Cached dashboard stats with TTL ${DASHBOARD_STATS_TTL}s`);
  } catch (error) {
    logger.error(`Error caching dashboard stats: ${error}`);
  }
}

/**
 * Get cached dashboard statistics
 */
export async function getCachedDashboardStats(): Promise<any | null> {
  try {
    const key = ADMIN_STATS_PREFIX + 'dashboard';
    const data = await redisClient.get(key);
    if (data) {
      logger.debug('Retrieved dashboard stats from cache');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    logger.error(`Error retrieving cached dashboard stats: ${error}`);
    return null;
  }
}

/**
 * Cache monthly revenue data
 */
export async function cacheMonthlyRevenueData(data: any): Promise<void> {
  try {
    const key = ADMIN_REVENUE_PREFIX + 'monthly';
    await redisClient.set(key, JSON.stringify(data));
    await redisClient.expire(key, REVENUE_DATA_TTL);
    logger.debug(`Cached monthly revenue data with TTL ${REVENUE_DATA_TTL}s`);
  } catch (error) {
    logger.error(`Error caching monthly revenue data: ${error}`);
  }
}

/**
 * Get cached monthly revenue data
 */
export async function getCachedMonthlyRevenueData(): Promise<any | null> {
  try {
    const key = ADMIN_REVENUE_PREFIX + 'monthly';
    const data = await redisClient.get(key);
    if (data) {
      logger.debug('Retrieved monthly revenue data from cache');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    logger.error(`Error retrieving cached monthly revenue data: ${error}`);
    return null;
  }
}

/**
 * Cache user growth data
 */
export async function cacheUserGrowthData(data: any): Promise<void> {
  try {
    const key = ADMIN_USER_GROWTH_PREFIX + 'yearly';
    await redisClient.set(key, JSON.stringify(data));
    await redisClient.expire(key, USER_GROWTH_TTL);
    logger.debug(`Cached user growth data with TTL ${USER_GROWTH_TTL}s`);
  } catch (error) {
    logger.error(`Error caching user growth data: ${error}`);
  }
}

/**
 * Get cached user growth data
 */
export async function getCachedUserGrowthData(): Promise<any | null> {
  try {
    const key = ADMIN_USER_GROWTH_PREFIX + 'yearly';
    const data = await redisClient.get(key);
    if (data) {
      logger.debug('Retrieved user growth data from cache');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    logger.error(`Error retrieving cached user growth data: ${error}`);
    return null;
  }
}

/**
 * Cache event statistics
 */
export async function cacheEventStatistics(data: any): Promise<void> {
  try {
    const key = ADMIN_EVENT_STATS_PREFIX + 'yearly';
    await redisClient.set(key, JSON.stringify(data));
    await redisClient.expire(key, EVENT_STATS_TTL);
    logger.debug(`Cached event statistics with TTL ${EVENT_STATS_TTL}s`);
  } catch (error) {
    logger.error(`Error caching event statistics: ${error}`);
  }
}

/**
 * Get cached event statistics
 */
export async function getCachedEventStatistics(): Promise<any | null> {
  try {
    const key = ADMIN_EVENT_STATS_PREFIX + 'yearly';
    const data = await redisClient.get(key);
    if (data) {
      logger.debug('Retrieved event statistics from cache');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    logger.error(`Error retrieving cached event statistics: ${error}`);
    return null;
  }
}

/**
 * Cache organization analytics data
 * @param organizationId The organization ID
 * @param data The analytics data to cache
 */
export async function cacheOrganizationAnalytics(
  organizationId: string,
  data: any,
): Promise<void> {
  try {
    const key = `${ORG_ANALYTICS_PREFIX}${organizationId}`;
    await redisClient.set(key, JSON.stringify(data));
    await redisClient.expire(key, ORG_ANALYTICS_TTL);
    logger.debug(
      `Cached analytics for organization ${organizationId} with TTL ${ORG_ANALYTICS_TTL}s`,
    );
  } catch (error) {
    logger.error(
      `Error caching analytics for organization ${organizationId}: ${error}`,
    );
  }
}

/**
 * Get cached organization analytics data
 * @param organizationId The organization ID
 * @returns The cached analytics data or null if not found
 */
export async function getCachedOrganizationAnalytics(
  organizationId: string,
): Promise<any | null> {
  try {
    const key = `${ORG_ANALYTICS_PREFIX}${organizationId}`;
    const data = await redisClient.get(key);
    if (data) {
      logger.debug(
        `Retrieved cached analytics for organization ${organizationId}`,
      );
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    logger.error(
      `Error retrieving cached analytics for organization ${organizationId}: ${error}`,
    );
    return null;
  }
}

export default redisClient;
