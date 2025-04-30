import { db } from '../../../db';
import { orders, orderItems, tickets } from '../../../db/schema';
import { BaseSeeder } from '../utils/base-seeder';
import { SeedingConfig } from '../config';
import { TransactionContext } from '../utils/transaction-manager';
import { v4 as uuidv4 } from 'uuid';
import { InferInsertModel } from 'drizzle-orm';
import { addMinutes } from 'date-fns';
import { eq } from 'drizzle-orm';

type OrderInsert = InferInsertModel<typeof orders>;
type OrderItemInsert = InferInsertModel<typeof orderItems>;
type User = { id: string };
type Event = { id: string; startTimestamp: Date };
type Ticket = { id: string; eventId: string; price: number };

export class OrderSeeder extends BaseSeeder {
  private config: SeedingConfig;
  private users: User[] = [];
  private events: Map<string, Event> = new Map();
  private availableTickets: Map<string, Ticket[]> = new Map(); // eventId -> tickets
  private orderIds: string[] = [];

  constructor(
    context: TransactionContext,
    config: SeedingConfig,
    users: User[],
    events: Event[],
    availableTickets: Map<string, Ticket[]>,
  ) {
    super(context);
    this.config = config;
    this.users = users;

    // Set up event map for easier access
    events.forEach((event) => {
      this.events.set(event.id, event);
    });

    this.availableTickets = availableTickets;
  }

  async seed(): Promise<void> {
    if (this.users.length === 0) {
      throw new Error('No users available');
    }

    if (this.events.size === 0) {
      throw new Error('No events available');
    }

    if (this.availableTickets.size === 0) {
      throw new Error('No tickets available');
    }

    console.log(
      `Starting order seed with ${this.users.length} users, ${this.events.size} events, and ${this.countAvailableTickets()} tickets`,
    );

    const orderRecords: OrderInsert[] = [];
    const orderItemRecords: OrderItemInsert[] = [];
    const ticketsToUpdate: {
      id: string;
      status: 'booked' | 'available';
      bookedAt: Date | null;
      userId: string | null;
    }[] = [];

    // Set a target number of orders to generate
    const targetOrderCount = 100000; // Target 100,000 orders

    console.log(
      `Targeting a total of ${targetOrderCount} orders across all users`,
    );

    // Pre-calculate parameters for order distribution with a safety factor to ensure we hit target
    const safetyFactor = 1.5; // Add 50% more capacity to account for skipped events/tickets
    const adjustedTargetCount = Math.ceil(targetOrderCount * safetyFactor);

    // Each user gets a minimum number of orders plus a random bonus
    const usersWithMaxOrders = Math.floor(this.users.length * 0.1); // 10% of users get max orders
    const usersWithMediumOrders = Math.floor(this.users.length * 0.3); // 30% get medium orders
    const remainingUsers =
      this.users.length - usersWithMaxOrders - usersWithMediumOrders;

    // Sort users into different tiers
    const shuffledUsers = [...this.users].sort(() => Math.random() - 0.5);
    const powerUsers = shuffledUsers.slice(0, usersWithMaxOrders);
    const regularUsers = shuffledUsers.slice(
      usersWithMaxOrders,
      usersWithMaxOrders + usersWithMediumOrders,
    );
    const occasionalUsers = shuffledUsers.slice(
      usersWithMaxOrders + usersWithMediumOrders,
    );

    // Calculate orders for each tier to reach target
    // Power users (10%): 40% of orders, regular users (30%): 40% of orders, occasional users (60%): 20% of orders
    // Shifting more orders to power users to increase chances of hitting target
    const powerUserOrders = Math.floor(adjustedTargetCount * 0.4);
    const regularUserOrders = Math.floor(adjustedTargetCount * 0.4);
    const occasionalUserOrders =
      adjustedTargetCount - powerUserOrders - regularUserOrders;

    // Set order counts per user group - making sure averages are higher
    const avgPowerUserOrders = Math.max(
      5,
      Math.ceil(powerUserOrders / Math.max(1, powerUsers.length)),
    );
    const avgRegularUserOrders = Math.max(
      3,
      Math.ceil(regularUserOrders / Math.max(1, regularUsers.length)),
    );
    const avgOccasionalUserOrders = Math.max(
      1,
      Math.ceil(occasionalUserOrders / Math.max(1, occasionalUsers.length)),
    );

    console.log(
      `Order distribution: Power users: ~${avgPowerUserOrders}/user, Regular users: ~${avgRegularUserOrders}/user, Occasional users: ~${avgOccasionalUserOrders}/user`,
    );

    try {
      // Process each user group to generate orders
      console.log(`Processing ${powerUsers.length} power users`);
      await this.generateOrdersForUserGroup(
        powerUsers,
        avgPowerUserOrders,
        'Power',
        orderRecords,
        orderItemRecords,
        ticketsToUpdate,
      );

      console.log(
        `After power users: ${orderRecords.length} orders, ${orderItemRecords.length} order items, ${ticketsToUpdate.length} tickets to update`,
      );

      // Check if we've reached the target count
      if (orderRecords.length < targetOrderCount) {
        console.log(`Processing ${regularUsers.length} regular users`);
        await this.generateOrdersForUserGroup(
          regularUsers,
          avgRegularUserOrders,
          'Regular',
          orderRecords,
          orderItemRecords,
          ticketsToUpdate,
        );

        console.log(
          `After regular users: ${orderRecords.length} orders, ${orderItemRecords.length} order items, ${ticketsToUpdate.length} tickets to update`,
        );
      }

      // Only process occasional users if we haven't reached the target
      if (orderRecords.length < targetOrderCount) {
        console.log(`Processing ${occasionalUsers.length} occasional users`);
        await this.generateOrdersForUserGroup(
          occasionalUsers,
          avgOccasionalUserOrders,
          'Occasional',
          orderRecords,
          orderItemRecords,
          ticketsToUpdate,
        );

        console.log(
          `After all users: ${orderRecords.length} orders, ${orderItemRecords.length} order items, ${ticketsToUpdate.length} tickets to update`,
        );
      }

      // Enforce target count limit if we exceeded it
      if (orderRecords.length > targetOrderCount) {
        console.log(
          `Generated ${orderRecords.length} orders, trimming to target of ${targetOrderCount}`,
        );

        // Trim excess orders - keep only the first targetOrderCount items
        const excessOrders = orderRecords.length - targetOrderCount;
        const ordersToRemove = orderRecords.splice(
          targetOrderCount,
          excessOrders,
        );

        // Create set of IDs to remove
        const orderIdsToRemove = new Set();
        for (const order of ordersToRemove) {
          if (order.id) {
            orderIdsToRemove.add(order.id);
          }
        }

        // Remove associated order items using a manual loop instead of filter
        // to avoid stack overflow with large arrays
        const newOrderItems: OrderItemInsert[] = [];
        for (const item of orderItemRecords) {
          if (!orderIdsToRemove.has(item.orderId)) {
            newOrderItems.push(item);
          }
        }

        const removedItemCount = orderItemRecords.length - newOrderItems.length;
        orderItemRecords.length = 0; // Clear the array

        // Push items in smaller batches to avoid stack issues
        const batchSize = 10000;
        for (let i = 0; i < newOrderItems.length; i += batchSize) {
          const batch = newOrderItems.slice(
            i,
            Math.min(i + batchSize, newOrderItems.length),
          );
          orderItemRecords.push(...batch);
        }

        // Update the orderIds array with a loop approach
        const newOrderIds: string[] = [];
        for (const id of this.orderIds) {
          if (!orderIdsToRemove.has(id)) {
            newOrderIds.push(id);
          }
        }
        this.orderIds = newOrderIds;

        console.log(
          `Removed ${excessOrders} excess orders and ${removedItemCount} order items`,
        );
      }

      console.log(
        `Generated ${orderRecords.length} orders with ${orderItemRecords.length} items`,
      );

      // Get the transaction from context
      const tx = this.context.transaction;
      if (!tx) {
        throw new Error('Transaction not available in context');
      }

      // Process orders and order items in batches
      console.log(`Processing ${orderRecords.length} orders in batches...`);
      try {
        await this.processBatch(orderRecords, async (batch) => {
          console.log(`Inserting batch of ${batch.length} orders...`);
          await tx.insert(orders).values(batch);
          console.log(`Successfully inserted ${batch.length} orders`);
        });
      } catch (error) {
        console.error('Error in order batch processing:', error);
        throw error;
      }

      console.log(
        `Processing ${orderItemRecords.length} order items in batches...`,
      );
      try {
        await this.processBatch(orderItemRecords, async (batch) => {
          console.log(`Inserting batch of ${batch.length} order items...`);
          // Log a sample of what we're trying to insert for debugging
          if (batch.length > 0) {
            console.log(`Sample order item:`, JSON.stringify(batch[0]));
          }
          await tx.insert(orderItems).values(batch);
          console.log(`Successfully inserted ${batch.length} order items`);
        });
      } catch (error) {
        console.error('Error in order item batch processing:', error);
        // Log more details about the error
        console.error('Error details:', error.message);
        if (error.detail) console.error('Error detail:', error.detail);
        if (error.code) console.error('Error code:', error.code);
        if (error.constraint)
          console.error('Error constraint:', error.constraint);
        throw error;
      }

      // Track created entities
      console.log('Tracking created entities...');
      this.context.trackEntities(
        'orders',
        orderRecords.map((o) => o.id as string),
      );
      this.context.updateStats('orders', orderRecords.length);

      this.context.trackEntities(
        'orderItems',
        orderItemRecords.map((i) => i.id as string),
      );
      this.context.updateStats('orderItems', orderItemRecords.length);

      // Update ticket status for completed orders
      if (ticketsToUpdate.length > 0) {
        console.log(`Updating ${ticketsToUpdate.length} ticket statuses...`);
        try {
          let updatedCount = 0;
          for (const ticket of ticketsToUpdate) {
            try {
              await tx
                .update(tickets)
                .set({
                  status: ticket.status,
                  bookedAt: ticket.bookedAt,
                  userId: ticket.userId,
                  updatedAt: new Date(),
                })
                .where(eq(tickets.id, ticket.id));
              updatedCount++;

              // Log progress every 1000 tickets
              if (updatedCount % 1000 === 0) {
                console.log(
                  `Updated ${updatedCount}/${ticketsToUpdate.length} tickets`,
                );
              }
            } catch (ticketError) {
              console.error(`Error updating ticket ${ticket.id}:`, ticketError);
              throw ticketError;
            }
          }
          console.log(`Successfully updated all ${updatedCount} tickets`);
          this.context.updateStats('ticketsUpdated', ticketsToUpdate.length);
        } catch (error) {
          console.error('Error updating ticket statuses:', error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Error in order seeding:', error);
      throw error;
    }
  }

  private countAvailableTickets(): number {
    let count = 0;
    for (const tickets of this.availableTickets.values()) {
      count += tickets.length;
    }
    return count;
  }

  private async generateOrdersForUserGroup(
    users: User[],
    avgOrdersPerUser: number,
    groupType: string,
    orderRecords: OrderInsert[],
    orderItemRecords: OrderItemInsert[],
    ticketsToUpdate: {
      id: string;
      status: 'booked' | 'available';
      bookedAt: Date | null;
      userId: string | null;
    }[],
  ) {
    console.log(`Generating orders for ${users.length} ${groupType} users`);

    let totalItemsCreated = 0;

    try {
      for (const user of users) {
        // Determine how many orders this user will create
        const orderCount = this.generateOrderCountForUser(avgOrdersPerUser);

        let userOrdersCreated = 0;
        for (let i = 0; i < orderCount; i++) {
          try {
            const event = this.selectEventWithTickets();
            if (!event) {
              console.log('No event with tickets available, skipping...');
              continue; // Skip if no event with tickets is available
            }

            const availableTickets = this.availableTickets.get(event.id) || [];
            if (availableTickets.length === 0) {
              console.log(
                `No tickets available for event ${event.id}, skipping...`,
              );
              continue; // Skip if no tickets available
            }

            // Generate order and items
            const result = this.generateOrder(user, event, availableTickets);
            if (!result) {
              console.log('Failed to generate order, skipping...');
              continue; // Skip if generation failed
            }

            const {
              order,
              items,
              ticketsToUpdate: newTicketsToUpdate,
            } = result;

            // Add to records
            orderRecords.push(order);
            orderItemRecords.push(...items);
            ticketsToUpdate.push(...newTicketsToUpdate);

            // Track total items for stats
            totalItemsCreated += items.length;
            userOrdersCreated++;

            // Store created order ID
            this.orderIds.push(order.id as string);

            // Remove used tickets from available tickets
            const ticketIds = items
              .map((item) => item.ticketId)
              .filter(Boolean) as string[];
            this.removeUsedTickets(event.id, ticketIds);
          } catch (orderError) {
            console.error(
              `Error generating order for user ${user.id}:`,
              orderError,
            );
          }
        }

        // Log progress every 100 users
        if (users.indexOf(user) % 100 === 0) {
          console.log(
            `Processed ${users.indexOf(user)} ${groupType} users, created ${orderRecords.length} orders so far`,
          );
        }
      }
    } catch (error) {
      console.error(
        `Error in generateOrdersForUserGroup (${groupType}):`,
        error,
      );
      throw error;
    }

    console.log(
      `Created ${totalItemsCreated} order items for ${groupType} users`,
    );
  }

  /**
   * Select an event that has available tickets
   */
  private selectEventWithTickets(): Event | undefined {
    // Get events with available tickets
    const eventsWithTickets = Array.from(this.availableTickets.entries())
      .filter(([_, tickets]) => tickets.length > 0)
      .map(([eventId]) => eventId);

    if (eventsWithTickets.length === 0) return undefined;

    // Select a random event that has tickets
    const randomIndex = this.generateRandomNumber(
      0,
      eventsWithTickets.length - 1,
    );
    const eventId = eventsWithTickets[randomIndex];

    return this.events.get(eventId);
  }

  /**
   * Returns all created order IDs
   */
  getOrderIds(): string[] {
    return this.orderIds;
  }

  private generateOrderCountForUser(avgOrdersPerUser: number): number {
    // 10% power users with many orders - generate a lot of orders
    if (this.generateRandomPercentage() < 10) {
      return this.generateRandomNumber(
        Math.min(avgOrdersPerUser, avgOrdersPerUser * 3), // Ensure min < max
        Math.max(avgOrdersPerUser * 3, avgOrdersPerUser * 10), // Ensure max > min
      );
    }

    // 30% regular users - generate a moderate number of orders
    if (this.generateRandomPercentage() < 30) {
      return this.generateRandomNumber(
        Math.min(1, avgOrdersPerUser), // Ensure at least 1, but not more than avg
        Math.max(avgOrdersPerUser + 1, avgOrdersPerUser * 3), // Ensure max > min
      );
    }

    // 60% occasional users - generate at least one order
    return this.generateRandomNumber(
      1, // Minimum 1 order
      Math.max(2, avgOrdersPerUser), // Ensure max > min and at least 2
    );
  }

  private selectRandomEvent(): Event | undefined {
    const eventIds = Array.from(this.events.keys());
    if (eventIds.length === 0) return undefined;

    const randomIndex = this.generateRandomNumber(0, eventIds.length - 1);
    const eventId = eventIds[randomIndex];

    return this.events.get(eventId);
  }

  private generateOrder(
    user: User,
    event: Event,
    availableTickets: Ticket[],
  ):
    | {
        order: OrderInsert;
        items: OrderItemInsert[];
        ticketsToUpdate: {
          id: string;
          status: 'booked' | 'available';
          bookedAt: Date | null;
          userId: string | null;
        }[];
      }
    | undefined {
    if (availableTickets.length === 0) return undefined;

    // Create a copy of the available tickets to avoid modifying the original array
    const ticketsCopy = [...availableTickets];

    // Determine how many tickets to buy (1-3)
    const ticketCount = Math.min(
      this.generateRandomNumber(1, 3),
      ticketsCopy.length,
    );

    // Select random tickets - simplify to make sure we always get tickets
    const selectedTickets: Ticket[] = [];
    const ticketsToUpdate: {
      id: string;
      status: 'booked' | 'available';
      bookedAt: Date | null;
      userId: string | null;
    }[] = [];
    const ticketsToSelect = Math.min(ticketCount, ticketsCopy.length);

    for (let i = 0; i < ticketsToSelect; i++) {
      if (ticketsCopy.length === 0) break;

      const randomIndex = this.generateRandomNumber(0, ticketsCopy.length - 1);
      selectedTickets.push(ticketsCopy[randomIndex]);
      ticketsCopy.splice(randomIndex, 1);
    }

    // If we couldn't select any tickets, return undefined
    if (selectedTickets.length === 0) return undefined;

    // Generate order timestamp (between registration and event date)
    const orderTimestamp = this.generateOrderTimestamp(event);

    // Determine order status
    const status = this.generateOrderStatus();

    // Generate Stripe IDs
    const stripeCheckoutSessionId = `cs_test_${this.generateRandomString(24)}`;
    const stripePaymentIntentId =
      status === 'completed' ? `pi_${this.generateRandomString(24)}` : null;

    // Create order
    const orderId = uuidv4();
    const order: OrderInsert = {
      id: orderId,
      userId: user.id,
      stripeCheckoutSessionId,
      stripePaymentIntentId,
      eventId: event.id,
      status,
      createdAt: orderTimestamp,
      updatedAt:
        status === 'completed' ? addMinutes(orderTimestamp, 5) : orderTimestamp,
    };

    // Create order items
    const items: OrderItemInsert[] = selectedTickets.map((ticket) => ({
      id: uuidv4(),
      orderId,
      ticketId: ticket.id,
      createdAt: orderTimestamp,
      updatedAt: orderTimestamp,
    }));

    // Mark tickets as booked if order is completed
    if (status === 'completed') {
      selectedTickets.forEach((ticket) => {
        ticketsToUpdate.push({
          id: ticket.id,
          status: 'booked',
          bookedAt: orderTimestamp,
          userId: user.id,
        });
      });
    }

    return { order, items, ticketsToUpdate };
  }

  private generateOrderTimestamp(event: Event): Date {
    // Orders should be created before the event
    const eventDate = new Date(event.startTimestamp);
    const today = new Date();

    // Most orders are created in the month before the event
    const earliestDate = new Date(eventDate);
    earliestDate.setMonth(earliestDate.getMonth() - 3); // Up to 3 months before

    // But some last-minute orders happen close to the event
    let latestDate = new Date(eventDate);
    latestDate.setDate(latestDate.getDate() - 1); // Up to 1 day before

    // Ensure order date is not in the future (maximum is today)
    if (latestDate > today) {
      latestDate = today;
    }

    // If the earliest date is also in the future, use today's date minus a random number of days
    if (earliestDate > today) {
      // Use a date between 1-30 days ago
      const randomDays = this.generateRandomNumber(1, 30);
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - randomDays);
      return pastDate;
    }

    return this.generateRandomDate(earliestDate, latestDate);
  }

  private generateOrderStatus():
    | 'pending'
    | 'completed'
    | 'failed'
    | 'cancelled' {
    const rand = this.generateRandomPercentage();

    if (rand < 85) {
      return 'completed'; // 85% successful
    } else if (rand < 95) {
      return 'failed'; // 10% failed
    } else if (rand < 98) {
      return 'cancelled'; // 3% cancelled
    } else {
      return 'pending'; // 2% pending
    }
  }

  private removeUsedTickets(eventId: string, usedTicketIds: string[]) {
    const eventTickets = this.availableTickets.get(eventId);
    if (!eventTickets) return;

    const remainingTickets = eventTickets.filter(
      (ticket) => ticket.id && !usedTicketIds.includes(ticket.id),
    );

    if (remainingTickets.length > 0) {
      this.availableTickets.set(eventId, remainingTickets);
    } else {
      this.availableTickets.delete(eventId);
    }
  }
}
