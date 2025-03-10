import { db } from '../../../db';
import { ticketTypes } from '../../../db/schema';
import { BaseSeeder } from '../utils/base-seeder';
import { SeedingConfig } from '../config';
import { TransactionContext } from '../utils/transaction-manager';
import { v4 as uuidv4 } from 'uuid';
import { InferInsertModel } from 'drizzle-orm';
import { addDays, subDays } from 'date-fns';

type TicketTypeInsert = InferInsertModel<typeof ticketTypes>;
type Event = {
  id: string;
  startTimestamp: Date;
  endTimestamp: Date;
  capacity: number;
};

export class TicketTypeSeeder extends BaseSeeder {
  private config: SeedingConfig;
  private events: Event[] = [];
  private ticketTypeIds: string[] = [];

  constructor(
    context: TransactionContext,
    config: SeedingConfig,
    events: Event[],
  ) {
    super(context);
    this.config = config;
    this.events = events;
  }

  async seed(): Promise<void> {
    if (this.events.length === 0) {
      throw new Error('No events available');
    }

    const ticketTypeRecords: TicketTypeInsert[] = [];

    // Generate ticket types for each event
    for (const event of this.events) {
      const ticketTypeCount = this.generateRandomNumber(
        this.config.volumes.ticketTypesPerEvent.min,
        this.config.volumes.ticketTypesPerEvent.max,
      );

      const ticketTypes = this.generateTicketTypesForEvent(
        event,
        ticketTypeCount,
      );
      ticketTypeRecords.push(...ticketTypes);
      this.ticketTypeIds.push(...ticketTypes.map((tt) => tt.id as string));
    }

    // Get the transaction from context
    const tx = this.context.transaction;
    if (!tx) {
      throw new Error('Transaction not available in context');
    }

    // Process ticket types in batches
    await this.processBatch(ticketTypeRecords, async (batch) => {
      await tx.insert(ticketTypes).values(batch);
    });

    // Track created ticket types
    this.context.trackEntities(
      'ticketTypes',
      ticketTypeRecords.map((tt) => tt.id as string),
    );
    this.context.updateStats('ticketTypes', ticketTypeRecords.length);
  }

  /**
   * Returns all created ticket type IDs
   */
  getTicketTypeIds(): string[] {
    return this.ticketTypeIds;
  }

  /**
   * Returns map of event ID to ticket types
   */
  getEventTicketTypes(): Map<string, TicketTypeInsert[]> {
    const map = new Map<string, TicketTypeInsert[]>();

    // TODO: Implement this if needed

    return map;
  }

  private generateTicketTypesForEvent(
    event: Event,
    count: number,
  ): TicketTypeInsert[] {
    const ticketTypeRecords: TicketTypeInsert[] = [];

    // Determine if there should be a free ticket type
    const hasFreeTicket = this.generateRandomPercentage() < 15; // 15% chance of having a free ticket

    // Determine total quantity distribution
    const totalCapacity = event.capacity;
    let remainingCapacity = totalCapacity;

    // Generate ticket types
    for (let i = 0; i < count; i++) {
      const isLast = i === count - 1;
      const isFree = hasFreeTicket && i === 0;

      // Calculate quantity for this ticket type
      let quantity: number;
      if (isLast) {
        quantity = remainingCapacity;
      } else {
        // Allocate between 10% and 50% of remaining capacity
        const percentage = this.generateRandomNumber(10, 50);
        quantity = Math.floor((percentage / 100) * remainingCapacity);
      }

      // Ensure minimum quantity
      quantity = Math.max(10, quantity);

      // Update remaining capacity
      remainingCapacity -= quantity;

      // Generate ticket type data
      const ticketType = this.generateTicketType(
        event,
        isFree,
        quantity,
        i,
        count,
      );
      ticketTypeRecords.push(ticketType);

      // Break if no more capacity left
      if (remainingCapacity <= 0) break;
    }

    return ticketTypeRecords;
  }

  private generateTicketType(
    event: Event,
    isFree: boolean,
    quantity: number,
    index: number,
    totalTypes: number,
  ): TicketTypeInsert {
    const id = uuidv4();
    const tiers = [
      'VIP',
      'Premium',
      'Standard',
      'Early Bird',
      'Regular',
      'Basic',
    ];

    // Select a tier based on index (higher index = lower tier)
    const tierIndex = Math.min(index, tiers.length - 1);
    const name = index === 0 && isFree ? 'Free' : tiers[tierIndex];

    const description = this.generateTicketDescription(name);

    // Price based on tier (higher tier = higher price)
    let price = 0;
    if (!isFree) {
      const basePrice = this.generateBasePrice(index, totalTypes);
      // Convert dollar price (like 29.99) to cents (2999)
      price = Math.round(basePrice * 100); // Store in cents, making sure we have integer values
    }

    // Sale period
    const eventStart = new Date(event.startTimestamp);
    const saleStart = subDays(eventStart, this.generateRandomNumber(30, 90)); // Start 1-3 months before
    const saleEnd = subDays(eventStart, 1); // End 1 day before

    // Limits per order
    const maxPerOrder = this.generateRandomNumber(5, 10);
    const minPerOrder = 1;

    return {
      id,
      name,
      description,
      price,
      quantity,
      type: isFree ? 'free' : 'paid',
      saleStart,
      saleEnd,
      maxPerOrder,
      minPerOrder,
      eventId: event.id,
      createdAt: saleStart,
      updatedAt: saleStart,
    };
  }

  private generateBasePrice(index: number, totalTypes: number): number {
    // Use common price points that are realistic
    // Each tier has a set of common price points to choose from

    // Price tiers based on position with common price points
    if (index === 0) {
      // VIP/Premium tier - higher prices
      const premiumPrices = [
        99.99,
        149.99,
        199.99,
        249.99,
        299.99,
        399.99,
        499.99, // .99 format
        100,
        150,
        200,
        250,
        300,
        350,
        400,
        450,
        500, // whole hundreds / fifties
        95,
        145,
        195,
        295,
        395,
        495, // whole numbers ending in 5
      ];
      const priceIndex = this.generateRandomNumber(0, premiumPrices.length - 1);
      return premiumPrices[priceIndex];
    }

    if (index === 1 && totalTypes > 2) {
      // Mid-tier prices
      const midTierPrices = [
        49.99,
        59.99,
        69.99,
        79.99,
        89.99, // .99 format
        50,
        60,
        70,
        80,
        90, // whole tens
        45,
        55,
        65,
        75,
        85,
        95, // whole numbers ending in 5
      ];
      const priceIndex = this.generateRandomNumber(0, midTierPrices.length - 1);
      return midTierPrices[priceIndex];
    }

    if (index === 2 && totalTypes > 3) {
      // Lower-mid tier
      const lowerMidPrices = [
        29.99,
        34.99,
        39.99,
        44.99, // .99 format
        30,
        35,
        40,
        45, // whole numbers ending in 0 or 5
        25,
        20, // more common price points
      ];
      const priceIndex = this.generateRandomNumber(
        0,
        lowerMidPrices.length - 1,
      );
      return lowerMidPrices[priceIndex];
    }

    // Basic tier
    const basicPrices = [
      9.99,
      14.99,
      19.99,
      24.99, // .99 format
      10,
      15,
      20,
      25, // whole numbers ending in 0 or 5
    ];
    const priceIndex = this.generateRandomNumber(0, basicPrices.length - 1);
    return basicPrices[priceIndex];
  }

  private generateTicketDescription(tierName: string): string {
    const descriptions = {
      VIP: 'Premium access with exclusive perks, priority seating, and special event access.',
      Premium:
        'Enhanced experience with better seating and additional benefits.',
      Standard: 'Standard admission with all basic amenities included.',
      'Early Bird': 'Limited-time discounted rate for early registrations.',
      Regular: 'Regular admission ticket with standard benefits.',
      Basic: 'Basic admission with essential access.',
      Free: 'Complimentary admission with limited access.',
    };

    return (
      descriptions[tierName as keyof typeof descriptions] ||
      'Admission ticket to the event.'
    );
  }
}
