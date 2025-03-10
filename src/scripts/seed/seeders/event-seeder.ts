import { db } from '../../../db';
import { events, categories } from '../../../db/schema';
import { BaseSeeder } from '../utils/base-seeder';
import { SeedingConfig } from '../config';
import { TransactionContext } from '../utils/transaction-manager';
import { v4 as uuidv4 } from 'uuid';
import { InferInsertModel } from 'drizzle-orm';
import { addDays, addHours, addMonths, subMonths } from 'date-fns';

type EventInsert = InferInsertModel<typeof events>;
type Category = { id: string; name: string };

export class EventSeeder extends BaseSeeder {
  private config: SeedingConfig;
  private organizationIds: string[] = [];
  private categories: Category[] = [];
  private eventIds: string[] = [];

  constructor(
    context: TransactionContext,
    config: SeedingConfig,
    organizationIds: string[],
  ) {
    super(context);
    this.config = config;
    this.organizationIds = organizationIds;
  }

  async seed(): Promise<void> {
    if (this.organizationIds.length === 0) {
      throw new Error('No organizations available');
    }

    const eventRecords: EventInsert[] = [];

    // Get the transaction from context
    const tx = this.context.transaction;
    if (!tx) {
      throw new Error('Transaction not available in context');
    }

    // Get categories if they exist, otherwise create them
    let categoryRecords = await tx.select().from(categories);
    if (categoryRecords.length === 0) {
      categoryRecords = await this.createCategories(tx);
    }
    this.categories = categoryRecords;

    // Generate events for each organization
    for (const orgId of this.organizationIds) {
      // Determine the number of events for this organization based on distribution
      const eventCount = this.generateRandomNumber(
        this.config.volumes.eventsDistribution.smallOrg.min,
        this.config.volumes.eventsDistribution.smallOrg.max,
      );

      for (let i = 0; i < eventCount; i++) {
        const event = this.generateEvent(orgId);
        eventRecords.push(event);
        this.eventIds.push(event.id as string);
      }
    }

    // Process events in batches
    await this.processBatch(eventRecords, async (batch) => {
      await tx.insert(events).values(batch);
    });

    // Track created events
    this.context.trackEntities(
      'events',
      eventRecords.map((e) => e.id as string),
    );
    this.context.updateStats('events', eventRecords.length);
  }

  /**
   * Returns all created event IDs
   */
  getEventIds(): string[] {
    return this.eventIds;
  }

  /**
   * Creates default categories
   */
  private async createCategories(tx: any): Promise<Category[]> {
    const defaultCategories = [
      { name: 'Music', slug: 'music' },
      { name: 'Business', slug: 'business' },
      { name: 'Food & Drink', slug: 'food-drink' },
      { name: 'Arts', slug: 'arts' },
      { name: 'Sports & Fitness', slug: 'sports-fitness' },
      { name: 'Health', slug: 'health' },
      { name: 'Community', slug: 'community' },
      { name: 'Other', slug: 'other' },
    ];

    const categoryRecords = defaultCategories.map((cat) => ({
      id: uuidv4(),
      name: cat.name,
      slug: cat.slug,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await tx.insert(categories).values(categoryRecords);

    return categoryRecords;
  }

  private generateEvent(organizationId: string): EventInsert {
    const id = uuidv4();
    const title = `${this.generateEventTitle()}`;
    const description = this.generateRandomDescription();

    // Get event timeframe (past, current, future)
    const eventTimeframe = this.determineEventTimeframe();
    const { startTimestamp, endTimestamp } =
      this.generateEventDates(eventTimeframe);

    // Select a random category
    const randomCategoryIndex = this.generateRandomNumber(
      0,
      this.categories.length - 1,
    );
    const category = this.categories[randomCategoryIndex];

    const isOnline = this.generateRandomBoolean();
    let venue = null;
    let address = null;

    if (!isOnline) {
      venue = `${this.generateRandomName()}'s Venue`;
      address = this.generateRandomAddress();
    }

    // Generate capacity based on distribution
    const capacity = this.generateRandomCapacity(
      this.config.volumes.eventCapacityDistribution,
    );

    // Generate cover image - use a placeholder service
    const coverImage = `https://picsum.photos/seed/${id}/800/600`;

    // Status based on date
    const status = this.determineEventStatus(startTimestamp, endTimestamp);

    const createdAt = new Date(startTimestamp);
    createdAt.setMonth(createdAt.getMonth() - 1); // Created 1 month before the event

    return {
      id,
      title,
      description,
      startTimestamp,
      endTimestamp,
      venue,
      address,
      categoryId: category.id,
      category: category.name,
      isOnline,
      capacity,
      coverImage,
      organizationId,
      status,
      createdAt,
      updatedAt: createdAt,
    };
  }

  private determineEventTimeframe(): 'past' | 'current' | 'future' {
    const rand = this.generateRandomPercentage();
    const { pastPercentage, currentPercentage } =
      this.config.distribution.events;

    if (rand < pastPercentage) {
      return 'past';
    } else if (rand < pastPercentage + currentPercentage) {
      return 'current';
    } else {
      return 'future';
    }
  }

  private generateEventDates(timeframe: 'past' | 'current' | 'future'): {
    startTimestamp: Date;
    endTimestamp: Date;
  } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (timeframe) {
      case 'past':
        // Event between 1-24 months ago
        startDate = this.generateRandomDate(
          subMonths(now, 24), // 24 months ago
          subMonths(now, 1), // 1 month ago
        );
        break;
      case 'current':
        // Event happening now
        startDate = this.generateRandomDate(
          subMonths(now, 1), // Started up to 1 month ago
          addDays(now, 2), // Or about to start in next 2 days
        );
        break;
      case 'future':
        // Future event in the next 1-12 months
        startDate = this.generateRandomDate(
          addDays(now, 2), // At least 2 days from now
          addMonths(now, 12), // Up to 12 months in the future
        );
        break;
    }

    // Event duration between 1 hour and 3 days
    const durationHours = this.generateRandomNumber(1, 72);
    endDate = addHours(startDate, durationHours);

    return { startTimestamp: startDate, endTimestamp: endDate };
  }

  private determineEventStatus(
    startTimestamp: Date,
    endTimestamp: Date,
  ): 'draft' | 'published' | 'cancelled' {
    const now = new Date();

    if (endTimestamp < now) {
      // Past event
      const isCancelled = this.generateRandomPercentage() < 5; // 5% chance of being cancelled
      return isCancelled ? 'cancelled' : 'published';
    } else if (startTimestamp > now) {
      // Future event
      const isDraft = this.generateRandomPercentage() < 10; // 10% chance of being draft
      const isCancelled = !isDraft && this.generateRandomPercentage() < 3; // 3% chance of being cancelled
      return isDraft ? 'draft' : isCancelled ? 'cancelled' : 'published';
    } else {
      // Current event
      const isCancelled = this.generateRandomPercentage() < 2; // 2% chance of being cancelled
      return isCancelled ? 'cancelled' : 'published';
    }
  }

  private generateEventTitle(): string {
    const prefixes = [
      'Annual',
      'Summer',
      'Winter',
      'Spring',
      'Fall',
      'International',
      'National',
      'Regional',
      'Local',
      'Global',
      'Virtual',
      'Premier',
      'Ultimate',
      'Exclusive',
      'VIP',
      'Elite',
      'Grand',
      'Classic',
    ];

    const eventTypes = [
      'Conference',
      'Workshop',
      'Masterclass',
      'Showcase',
      'Exhibition',
      'Festival',
      'Hackathon',
      'Summit',
      'Symposium',
      'Gala',
      'Awards',
      'Competition',
      'Show',
      'Fair',
      'Expo',
      'Concert',
      'Party',
      'Meetup',
      'Retreat',
      'Gathering',
      'Tournament',
    ];

    const topics = [
      'Tech',
      'Business',
      'Innovation',
      'Design',
      'Leadership',
      'Marketing',
      'Finance',
      'Health',
      'Fitness',
      'Art',
      'Music',
      'Food',
      'Wine',
      'Film',
      'Photography',
      'Writing',
      'Science',
      'Education',
      'Travel',
      'Fashion',
    ];

    const usePrefix = this.generateRandomPercentage() < 70; // 70% chance to use prefix
    const prefix = usePrefix
      ? `${prefixes[this.generateRandomNumber(0, prefixes.length - 1)]} `
      : '';
    const eventType =
      eventTypes[this.generateRandomNumber(0, eventTypes.length - 1)];
    const useTopic = this.generateRandomPercentage() < 80; // 80% chance to use topic
    const topic = useTopic
      ? ` of ${topics[this.generateRandomNumber(0, topics.length - 1)]}`
      : '';

    return `${prefix}${eventType}${topic} ${new Date().getFullYear()}`;
  }
}
