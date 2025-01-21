import { db } from '../../db';
import { logger } from '../../utils/logger';
import {
  users,
  organizations,
  events,
  tickets,
  categories,
} from '../../db/schema';
import { AppError } from '../../utils/errors';

async function hasData(table: any) {
  try {
    const result = await db.select().from(table);
    return result.length > 0;
  } catch (error) {
    logger.error(`Error checking table data: ${error}`);
    throw new AppError(500, `Failed to check table data: ${error.message}`);
  }
}

export async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');

    // Check and seed users
    if (await hasData(users)) {
      logger.info('Users table already has data, skipping user seeding');
    } else {
      logger.info('Seeding users table...');
      try {
        await db.insert(users).values({
          email: 'admin@example.com',
          username: 'admin',
          role: 'admin',
          verified: true,
        });
        logger.info('Successfully seeded users table');
      } catch (error) {
        logger.error(`Error seeding users table: ${error}`);
        throw new AppError(500, `Failed to seed users table: ${error.message}`);
      }
    }

    // Check and seed categories
    if (await hasData(categories)) {
      logger.info(
        'Categories table already has data, skipping category seeding',
      );
    } else {
      logger.info('Seeding categories table...');
      try {
        await db
          .insert(categories)
          .values([
            { name: 'Music' },
            { name: 'Sports' },
            { name: 'Arts & Theatre' },
            { name: 'Family' },
            { name: 'Comedy' },
            { name: 'Business' },
          ]);
        logger.info('Successfully seeded categories table');
      } catch (error) {
        logger.error(`Error seeding categories table: ${error}`);
        throw new AppError(
          500,
          `Failed to seed categories table: ${error.message}`,
        );
      }
    }

    // Check and seed organizations
    if (await hasData(organizations)) {
      logger.info(
        'Organizations table already has data, skipping organization seeding',
      );
    } else {
      const adminUser = (await db.select().from(users).limit(1))[0];
      if (!adminUser) {
        logger.warn('Skipping organization seeding due to missing user data');
        throw new AppError(
          500,
          'Failed to seed organizations: Admin user not found',
        );
      }

      logger.info('Seeding organizations table...');
      try {
        await db.insert(organizations).values([
          {
            name: 'Test Organization 1',
            description: 'A test organization',
            website: 'https://example.com',
            ownerId: adminUser.id,
            country: 'TH',
          },
          {
            name: 'Test Organization 2',
            description: 'Another test organization',
            website: 'https://example2.com',
            ownerId: adminUser.id,
            country: 'TH',
          },
        ]);
        logger.info('Successfully seeded organizations table');
      } catch (error) {
        logger.error(`Error seeding organizations table: ${error}`);
        throw new AppError(
          500,
          `Failed to seed organizations table: ${error.message}`,
        );
      }
    }

    // Check and seed events
    if (await hasData(events)) {
      logger.info('Events table already has data, skipping event seeding');
    } else {
      const orgs = await db.select().from(organizations);
      const cats = await db.select().from(categories);

      if (orgs.length === 0 || cats.length === 0) {
        logger.warn('Skipping event seeding due to missing related data');
        throw new AppError(
          500,
          'Failed to seed events: Missing required related data',
        );
      }

      logger.info('Seeding events table...');
      try {
        await db.insert(events).values([
          {
            name: 'Test Event 1',
            description: 'A test event',
            startTimestamp: new Date('2024-12-01'),
            endTimestamp: new Date('2024-12-02'),
            organizationId: orgs[0].id,
            categoryId: cats[0].id,
            capacity: 1000,
            isPublished: true,
          },
          {
            name: 'Test Event 2',
            description: 'Another test event',
            startTimestamp: new Date('2024-12-03'),
            endTimestamp: new Date('2024-12-04'),
            organizationId: orgs[1].id,
            categoryId: cats[1].id,
            capacity: 500,
            isPublished: true,
          },
        ]);
        logger.info('Successfully seeded events table');
      } catch (error) {
        logger.error(`Error seeding events table: ${error}`);
        throw new AppError(
          500,
          `Failed to seed events table: ${error.message}`,
        );
      }
    }

    // Check and seed tickets
    if (await hasData(tickets)) {
      logger.info('Tickets table already has data, skipping ticket seeding');
    } else {
      const evts = await db.select().from(events);

      if (evts.length === 0) {
        logger.warn('Skipping ticket seeding due to missing event data');
        throw new AppError(500, 'Failed to seed tickets: No events found');
      }

      logger.info('Seeding tickets table...');
      try {
        await db.insert(tickets).values([
          {
            name: 'VIP',
            seatNumber: 'A1',
            eventId: evts[0].id,
            price: 100,
            status: 'available',
          },
          {
            name: 'Regular',
            seatNumber: 'B1',
            eventId: evts[0].id,
            price: 50,
            status: 'available',
          },
        ]);
        logger.info('Successfully seeded tickets table');
      } catch (error) {
        logger.error(`Error seeding tickets table: ${error}`);
        throw new AppError(
          500,
          `Failed to seed tickets table: ${error.message}`,
        );
      }
    }

    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error(`Error seeding database: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, `Database seeding failed: ${error.message}`);
  }
}

export async function nukeDatabase() {
  try {
    logger.info('Starting database cleanup...');
    return await db.transaction(async (tx) => {
      try {
        logger.info('Deleting tickets...');
        await tx.delete(tickets);
        logger.info('Deleting events...');
        await tx.delete(events);
        logger.info('Deleting organizations...');
        await tx.delete(organizations);
        logger.info('Deleting categories...');
        await tx.delete(categories);
        logger.info('Database cleanup completed successfully');
      } catch (error) {
        logger.error(`Error during database cleanup transaction: ${error}`);
        throw new AppError(500, `Failed to clean database: ${error.message}`);
      }
    });
  } catch (error) {
    logger.error(`Error cleaning database: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, `Database cleanup failed: ${error.message}`);
  }
}
