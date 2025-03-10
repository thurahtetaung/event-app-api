import { db } from '../../../db';
import { tickets } from '../../../db/schema';
import { BaseSeeder } from '../utils/base-seeder';
import { SeedingConfig } from '../config';
import { TransactionContext } from '../utils/transaction-manager';
import { v4 as uuidv4 } from 'uuid';
import { InferInsertModel } from 'drizzle-orm';

type TicketInsert = InferInsertModel<typeof tickets>;
type TicketType = {
  id: string;
  name: string;
  price: number;
  eventId: string;
  currency?: string;
  quantity: number;
};

type Event = {
  id: string;
  capacity: number;
};

export class TicketSeeder extends BaseSeeder {
  private config: SeedingConfig;
  private ticketTypes: TicketType[] = [];
  private ticketIds: string[] = [];
  private eventTickets: Map<string, TicketInsert[]> = new Map();
  private events: Map<string, Event> = new Map(); // Store events by ID

  constructor(
    context: TransactionContext,
    config: SeedingConfig,
    ticketTypes: TicketType[],
    events?: Event[],
  ) {
    super(context);
    this.config = config;
    this.ticketTypes = ticketTypes;

    // If events are provided, store them in a map for easy lookup
    if (events) {
      events.forEach((event) => {
        this.events.set(event.id, event);
      });
    }
  }

  async seed(): Promise<void> {
    if (this.ticketTypes.length === 0) {
      throw new Error('No ticket types available');
    }

    const ticketRecords: TicketInsert[] = [];

    // Generate tickets for each ticket type
    for (const ticketType of this.ticketTypes) {
      // Get or generate quantity based on fill rate
      const quantity = this.generateTicketQuantity(ticketType);

      const tickets = this.generateTicketsForType(ticketType, quantity);
      ticketRecords.push(...tickets);

      // Track tickets by event
      const eventTickets = this.eventTickets.get(ticketType.eventId) || [];
      this.eventTickets.set(ticketType.eventId, [...eventTickets, ...tickets]);

      // Track ticket IDs
      this.ticketIds.push(...tickets.map((t) => t.id as string));
    }

    console.log(
      `Processing ${ticketRecords.length} tickets in batches of ${this.batchSize}...`,
    );

    try {
      // Get the transaction from context
      const tx = this.context.transaction;
      if (!tx) {
        throw new Error('Transaction not available in context');
      }

      // Process tickets in smaller batches to avoid parameter limit
      await this.processBatch(ticketRecords, async (batch) => {
        try {
          // Use the transaction instead of the global db
          await tx.insert(tickets).values(batch);
        } catch (error) {
          console.error(
            `Error inserting ticket batch of size ${batch.length}:`,
            error.message,
          );

          // If batch is still too large, split and try again
          if (batch.length > 10 && error.message?.includes('parameter')) {
            console.log(`Trying with smaller sub-batches...`);
            const halfSize = Math.ceil(batch.length / 2);

            // Process first half
            await this.processBatch(
              batch.slice(0, halfSize),
              async (subBatch) => {
                await tx.insert(tickets).values(subBatch);
              },
            );

            // Process second half
            await this.processBatch(batch.slice(halfSize), async (subBatch) => {
              await tx.insert(tickets).values(subBatch);
            });
          } else {
            // Rethrow other errors
            throw error;
          }
        }
      });

      // Track created tickets
      this.context.trackEntities(
        'tickets',
        ticketRecords.map((t) => t.id as string),
      );
      this.context.updateStats('tickets', ticketRecords.length);
    } catch (error) {
      console.error(`Failed to seed tickets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Returns all created ticket IDs
   */
  getTicketIds(): string[] {
    return this.ticketIds;
  }

  /**
   * Returns map of event ID to tickets
   */
  getEventTickets(): Map<string, TicketInsert[]> {
    return this.eventTickets;
  }

  private generateTicketQuantity(ticketType: TicketType): number {
    // Look up events by their ID to get capacity
    const eventId = ticketType.eventId;

    // Get all ticket types for this event to calculate distribution
    const ticketTypesForEvent = this.ticketTypes.filter(
      (tt) => tt.eventId === eventId,
    );

    // Find out how many different ticket types there are for this event
    const ticketTypeCount = ticketTypesForEvent.length;

    if (ticketTypeCount === 0) {
      return 50; // Fallback if something went wrong
    }

    // Use the event capacity to determine how many tickets to create
    const event = this.events.get(eventId);
    if (!event || !event.capacity) {
      return 50; // Fallback if event not found or capacity not set
    }

    // Generate a fill rate based on the configuration
    const fillRatePercentage = this.generateRandomFillRate(
      this.config.distribution.eventFillRate,
    );

    // Calculate total tickets based on capacity and fill rate
    const totalTickets = Math.floor(
      event.capacity * (fillRatePercentage / 100),
    );

    // Now distribute these tickets among the different ticket types
    // This ticket type's share of the total
    const ticketShare = 1 / ticketTypeCount;

    // Add some variation (±20%) to make it more realistic
    const variation = 0.2;
    const variationFactor = 1 + (Math.random() * variation * 2 - variation);

    // Calculate tickets for this type, ensuring at least 1
    const calculatedQuantity = Math.max(
      1,
      Math.round(totalTickets * ticketShare * variationFactor),
    );

    // CRITICAL FIX: Never create more tickets than the ticket type's quantity
    // This ensures consistency between ticket type quantity and available tickets
    return Math.min(calculatedQuantity, ticketType.quantity);
  }

  private generateTicketsForType(
    ticketType: TicketType,
    quantity: number,
  ): TicketInsert[] {
    const tickets: TicketInsert[] = [];

    for (let i = 0; i < quantity; i++) {
      const ticket = this.generateTicket(ticketType);
      tickets.push(ticket);
    }

    return tickets;
  }

  private generateTicket(ticketType: TicketType): TicketInsert {
    const id = uuidv4();

    // Default all tickets to available initially
    const status = 'available';

    return {
      id,
      eventId: ticketType.eventId,
      ticketTypeId: ticketType.id,
      name: ticketType.name,
      price: ticketType.price,
      currency: ticketType.currency || 'usd',
      status,
      userId: null,
      accessToken: null,
      isValidated: false,
      reservedAt: null,
      bookedAt: null,
      validatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
