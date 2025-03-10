import { TransactionContext } from '../utils/transaction-manager';
import { db } from '../../../db';
import { SeedingConfig } from '../config';

export abstract class BaseSeeder {
  protected ctx: TransactionContext;
  protected config: SeedingConfig;

  constructor(ctx: TransactionContext, config: SeedingConfig) {
    this.ctx = ctx;
    this.config = config;
  }

  abstract seed(): Promise<void>;

  protected async processBatch<T>(
    items: T[],
    processor: (batch: T[]) => Promise<void>,
  ): Promise<void> {
    const batchSize = this.config.batchSize;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await processor(batch);
    }
  }

  protected trackEntities(entityType: string, ids: string[]): void {
    const existing = this.ctx.entityMaps.get(entityType) || [];
    this.ctx.entityMaps.set(entityType, [...existing, ...ids]);
  }

  protected updateStats(entityType: string, count: number): void {
    const existing = this.ctx.stats.get(entityType) || 0;
    this.ctx.stats.set(entityType, existing + count);
  }

  protected getRandomDateInRange(start: Date, end: Date): Date {
    const startTime = start.getTime();
    const endTime = end.getTime();
    const randomTime = startTime + Math.random() * (endTime - startTime);
    return new Date(randomTime);
  }

  protected getWeightedRandomDate(
    start: Date,
    end: Date,
    peakDates: Date[],
    peakWeight = 0.7,
  ): Date {
    // 70% chance to be near peak dates, 30% chance to be random
    if (Math.random() < peakWeight) {
      // Pick a random peak date
      const peakDate = peakDates[Math.floor(Math.random() * peakDates.length)];
      // Generate a date within 3 days before or after the peak
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      const minTime = Math.max(start.getTime(), peakDate.getTime() - threeDays);
      const maxTime = Math.min(end.getTime(), peakDate.getTime() + threeDays);
      return new Date(minTime + Math.random() * (maxTime - minTime));
    }

    return this.getRandomDateInRange(start, end);
  }

  protected async executeInTransaction<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      return await operation();
    });
  }
}
