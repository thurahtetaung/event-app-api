import { createClient } from 'redis';
import { env } from '../config/env';
import { logger } from './logger';

const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => logger.error(`Redis Client Error: ${err}`));
redisClient.on('connect', () => logger.info('Redis Client Connected'));

// Connect to Redis when the module is imported
redisClient.connect().catch((err) => {
  logger.error(`Failed to connect to Redis: ${err}`);
});

const TICKET_PREFIX = 'ticket:';
const LOCK_DURATION = env.REDIS_TICKET_LOCK_DURATION;

export async function reserveTicket(
  ticketId: string,
  userId: string,
): Promise<boolean> {
  try {
    const key = TICKET_PREFIX + ticketId;
    // Try to set the key only if it doesn't exist (NX) with expiration (EX)
    const result = await redisClient.set(key, userId, {
      NX: true,
      EX: LOCK_DURATION,
    });
    return result === 'OK';
  } catch (error) {
    logger.error(`Error reserving ticket in Redis: ${error}`);
    return false;
  }
}

export async function isTicketReserved(ticketId: string): Promise<boolean> {
  try {
    const key = TICKET_PREFIX + ticketId;
    const result = await redisClient.get(key);
    return result !== null;
  } catch (error) {
    logger.error(`Error checking ticket reservation in Redis: ${error}`);
    return false;
  }
}

export async function releaseTicket(ticketId: string): Promise<void> {
  try {
    const key = TICKET_PREFIX + ticketId;
    await redisClient.del(key);
  } catch (error) {
    logger.error(`Error releasing ticket in Redis: ${error}`);
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

export async function releaseUserTickets(userId: string): Promise<void> {
  try {
    // Get all keys with ticket prefix
    const keys = await redisClient.keys(TICKET_PREFIX + '*');
    for (const key of keys) {
      const reservedUserId = await redisClient.get(key);
      if (reservedUserId === userId) {
        await redisClient.del(key);
      }
    }
  } catch (error) {
    logger.error(`Error releasing user tickets from Redis: ${error}`);
  }
}

export default redisClient;
