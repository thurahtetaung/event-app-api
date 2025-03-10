import { TransactionManager } from './utils/transaction-manager';
import { UserSeeder } from './seeders/user-seeder';
import { OrganizationSeeder } from './seeders/organization-seeder';
import { EventSeeder } from './seeders/event-seeder';
import { TicketTypeSeeder } from './seeders/ticket-type-seeder';
import { TicketSeeder } from './seeders/ticket-seeder';
import { OrderSeeder } from './seeders/order-seeder';
import { defaultConfig } from './config';
import { db } from '../../db';
import {
  events,
  orders,
  orderItems,
  tickets,
  ticketTypes,
  organizations,
  users,
} from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

// Function to clear existing data
async function clearExistingData() {
  console.log('Clearing existing data...');

  try {
    // Delete all data in a transaction to ensure consistency
    await db.transaction(async (tx) => {
      // Delete in reverse order of dependencies
      console.log('Deleting order items...');
      await tx.delete(orderItems);

      console.log('Deleting orders...');
      await tx.delete(orders);

      console.log('Deleting tickets...');
      await tx.delete(tickets);

      console.log('Deleting ticket types...');
      await tx.delete(ticketTypes);

      console.log('Deleting events...');
      await tx.delete(events);

      console.log('Deleting organizations...');
      await tx.delete(organizations);

      console.log('Deleting users...');
      await tx.delete(users);
    });

    console.log('Data cleared successfully!');
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

async function main() {
  console.log('Starting seeding process...');

  // Check if we should clear existing data
  const shouldClear = process.argv.includes('--clear');
  if (shouldClear) {
    await clearExistingData();
  }

  const txManager = new TransactionManager();
  let currentBatchId = null;

  try {
    // Create a batch ID that will be used for tracking and potential rollback
    currentBatchId = txManager.getBatchId();
    console.log(`Starting seeding with batch ID: ${currentBatchId}`);

    // Execute all operations inside the transaction for atomic success/failure
    await txManager.executeWithTransaction(async (context) => {
      // Phase 1: Users
      console.log('Seeding users...');
      const userSeeder = new UserSeeder(context, defaultConfig);
      await userSeeder.seed();
      const organizerUserIds = userSeeder.getOrganizerUserIds();
      console.log(`Created ${organizerUserIds.length} organizer users`);

      // Phase 2: Organizations
      console.log('Seeding organizations...');
      const organizationSeeder = new OrganizationSeeder(
        context,
        defaultConfig,
        organizerUserIds,
      );
      await organizationSeeder.seed();
      const organizationIds = organizationSeeder.getOrganizationIds();
      console.log(`Created ${organizationIds.length} organizations`);

      // Phase 3: Events
      console.log('Seeding events...');
      const eventSeeder = new EventSeeder(
        context,
        defaultConfig,
        organizationIds,
      );
      await eventSeeder.seed();
      const eventIds = eventSeeder.getEventIds();
      console.log(`Created ${eventIds.length} events`);

      // Get full event details for ticket and order generation
      const eventDetails = await context.transaction
        .select({
          id: events.id,
          startTimestamp: events.startTimestamp,
          endTimestamp: events.endTimestamp,
          capacity: events.capacity,
        })
        .from(events)
        .where(inArray(events.id, eventIds));

      // Phase 4: Ticket Types
      console.log('Seeding ticket types...');
      const ticketTypeSeeder = new TicketTypeSeeder(
        context,
        defaultConfig,
        eventDetails,
      );
      await ticketTypeSeeder.seed();
      const ticketTypeIds = ticketTypeSeeder.getTicketTypeIds();
      console.log(`Created ${ticketTypeIds.length} ticket types`);

      // Get ticket type details for ticket generation
      const ticketTypeDetails = await context.transaction
        .select({
          id: ticketTypes.id,
          name: ticketTypes.name,
          price: ticketTypes.price,
          eventId: ticketTypes.eventId,
          quantity: ticketTypes.quantity,
        })
        .from(ticketTypes)
        .where(inArray(ticketTypes.id, ticketTypeIds));

      // Phase 5: Tickets
      console.log('Seeding tickets...');
      const ticketSeeder = new TicketSeeder(
        context,
        defaultConfig,
        ticketTypeDetails,
        eventDetails,
      );
      await ticketSeeder.seed();
      const ticketIds = ticketSeeder.getTicketIds();
      console.log(`Created ${ticketIds.length} tickets`);

      // Get event tickets map for order generation
      const ticketsMap = ticketSeeder.getEventTickets();

      // Convert to a format suitable for OrderSeeder
      const availableTicketsMap = new Map<
        string,
        Array<{ id: string; eventId: string; price: number }>
      >();
      for (const [eventId, tickets] of ticketsMap.entries()) {
        availableTicketsMap.set(
          eventId,
          tickets.map((ticket) => ({
            id: ticket.id as string,
            eventId: ticket.eventId as string,
            price: ticket.price,
          })),
        );
      }

      // Phase 6: Orders
      console.log('Seeding orders...');
      // Get user IDs from context
      const userIds = context.entityMaps.get('users') || [];
      const users = userIds.map((id) => ({ id }));
      console.log(`Using all ${users.length} users for order generation`);

      const orderSeeder = new OrderSeeder(
        context,
        defaultConfig,
        users,
        eventDetails,
        availableTicketsMap,
      );
      await orderSeeder.seed();
      const orderIds = orderSeeder.getOrderIds();
      console.log(`Created ${orderIds.length} orders`);

      console.log('Seeding completed successfully!');

      // Print statistics
      const stats = Array.from(context.stats.entries()).map(
        ([key, value]) => `${key}: ${value}`,
      );
      console.log('Statistics:');
      console.log(stats.join('\n'));
    });

    console.log('All done!');
  } catch (error) {
    console.error('Seeding failed:', error);

    // If we have a batch ID and seeding has started, try to roll back
    if (currentBatchId) {
      console.log(`Attempting to roll back batch: ${currentBatchId}`);
      try {
        await txManager.rollback(currentBatchId);
        console.log('Rollback completed successfully');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
