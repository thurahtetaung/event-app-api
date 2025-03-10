import { TransactionContext } from './transaction-manager';
import { faker } from '@faker-js/faker';

export abstract class BaseSeeder {
  protected context: TransactionContext;
  protected readonly batchSize: number = 50;

  constructor(context: TransactionContext) {
    this.context = context;
  }

  abstract seed(): Promise<void>;

  protected async processBatch<T>(
    items: T[],
    processor: (batch: T[]) => Promise<void>,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      await processor(batch);
    }
  }

  protected generateRandomDate(start: Date, end: Date): Date {
    const randomDate = faker.date.between({ from: start, to: end });
    // Normalize minutes to quarter hours (00, 15, 30, 45)
    return this.normalizeToQuarterHour(randomDate);
  }

  /**
   * Normalizes a date to the nearest quarter hour (00, 15, 30, 45)
   */
  protected normalizeToQuarterHour(date: Date): Date {
    const normalized = new Date(date);
    const minutes = date.getMinutes();
    let normalizedMinutes: number;

    // Round to nearest quarter hour
    if (minutes < 7) {
      normalizedMinutes = 0;
    } else if (minutes < 22) {
      normalizedMinutes = 15;
    } else if (minutes < 37) {
      normalizedMinutes = 30;
    } else if (minutes < 52) {
      normalizedMinutes = 45;
    } else {
      normalizedMinutes = 0;
      // If rounding up to next hour
      normalized.setHours(date.getHours() + 1);
    }

    normalized.setMinutes(normalizedMinutes);
    normalized.setSeconds(0);
    normalized.setMilliseconds(0);

    return normalized;
  }

  protected generateRandomNumber(min: number, max: number): number {
    return faker.number.int({ min, max });
  }

  protected generateRandomPercentage(): number {
    return faker.number.int({ min: 0, max: 100 });
  }

  protected generateRandomBoolean(): boolean {
    return faker.datatype.boolean();
  }

  protected generateRandomString(length: number = 10): string {
    return faker.string.alphanumeric(length);
  }

  protected generateRandomEmail(): string {
    return faker.internet.email();
  }

  protected generateRandomName(): string {
    return faker.person.fullName();
  }

  protected generateRandomPhoneNumber(): string {
    return faker.phone.number();
  }

  protected generateRandomAddress(): string {
    return faker.location.streetAddress();
  }

  protected generateRandomCountry(): string {
    return faker.location.country();
  }

  protected generateRandomWebsite(): string {
    return faker.internet.url();
  }

  protected generateRandomDescription(): string {
    return faker.lorem.paragraph();
  }

  protected generateRandomPrice(min: number = 0, max: number = 1000): number {
    return faker.number.int({ min, max });
  }

  protected generateRandomSocialLinks(): string {
    return JSON.stringify({
      facebook: faker.internet.url(),
      twitter: faker.internet.url(),
      instagram: faker.internet.url(),
      linkedin: faker.internet.url(),
    });
  }

  protected generateRandomEventTypes(): string {
    const types = [
      'conference',
      'workshop',
      'concert',
      'exhibition',
      'sports',
      'networking',
      'festival',
      'corporate',
    ];
    const count = faker.number.int({ min: 1, max: types.length });
    return JSON.stringify(faker.helpers.arrayElements(types, count));
  }

  protected generateRandomCapacity(distribution: {
    extraLarge: { min: number; max: number; percentage: number };
    large: { min: number; max: number; percentage: number };
    medium: { min: number; max: number; percentage: number };
    small: { min: number; max: number; percentage: number };
  }): number {
    const rand = this.generateRandomPercentage();
    let cumulative = 0;
    let capacity = 0;

    if (rand < (cumulative += distribution.extraLarge.percentage)) {
      capacity = this.generateRandomNumber(
        distribution.extraLarge.min,
        distribution.extraLarge.max,
      );
    } else if (rand < (cumulative += distribution.large.percentage)) {
      capacity = this.generateRandomNumber(
        distribution.large.min,
        distribution.large.max,
      );
    } else if (rand < (cumulative += distribution.medium.percentage)) {
      capacity = this.generateRandomNumber(
        distribution.medium.min,
        distribution.medium.max,
      );
    } else {
      capacity = this.generateRandomNumber(
        distribution.small.min,
        distribution.small.max,
      );
    }

    // Round to nearest hundred for smaller capacities (< 1000)
    if (capacity < 1000) {
      return Math.max(100, Math.round(capacity / 100) * 100);
    }
    // Round to nearest thousand for larger capacities
    else {
      return Math.round(capacity / 1000) * 1000;
    }
  }

  protected generateRandomFillRate(distribution: {
    high: { min: number; max: number; percentage: number };
    medium: { min: number; max: number; percentage: number };
    moderate: { min: number; max: number; percentage: number };
    low: { min: number; max: number; percentage: number };
  }): number {
    const rand = this.generateRandomPercentage();
    let cumulative = 0;

    if (rand < (cumulative += distribution.high.percentage)) {
      return this.generateRandomNumber(
        distribution.high.min,
        distribution.high.max,
      );
    }
    if (rand < (cumulative += distribution.medium.percentage)) {
      return this.generateRandomNumber(
        distribution.medium.min,
        distribution.medium.max,
      );
    }
    if (rand < (cumulative += distribution.moderate.percentage)) {
      return this.generateRandomNumber(
        distribution.moderate.min,
        distribution.moderate.max,
      );
    }
    return this.generateRandomNumber(
      distribution.low.min,
      distribution.low.max,
    );
  }
}
