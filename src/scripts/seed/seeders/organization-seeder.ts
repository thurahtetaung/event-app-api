import { db } from '../../../db';
import { organizations, organizationTypeEnum } from '../../../db/schema';
import { BaseSeeder } from '../utils/base-seeder';
import { SeedingConfig } from '../config';
import { TransactionContext } from '../utils/transaction-manager';
import { v4 as uuidv4 } from 'uuid';
import { InferInsertModel } from 'drizzle-orm';

type OrganizationInsert = InferInsertModel<typeof organizations>;

export class OrganizationSeeder extends BaseSeeder {
  private config: SeedingConfig;
  private organizerUserIds: string[] = [];

  constructor(
    context: TransactionContext,
    config: SeedingConfig,
    organizerUserIds: string[],
  ) {
    super(context);
    this.config = config;
    this.organizerUserIds = organizerUserIds;
  }

  async seed(): Promise<void> {
    const organizationCount = this.config.volumes.organizations;
    const orgRecords: OrganizationInsert[] = [];

    // Get available organizer users
    if (this.organizerUserIds.length === 0) {
      throw new Error('No organizer users available');
    }

    // Generate organizations
    for (let i = 0; i < organizationCount; i++) {
      // Determine organization size based on distribution
      const orgSize = this.determineOrgSize();

      // Get a random organizer user ID
      const ownerIndex = i % this.organizerUserIds.length;
      const ownerId = this.organizerUserIds[ownerIndex];

      // Generate organization data
      const orgType = this.generateOrgType();
      const name = `${this.generateRandomName()}'s ${
        orgType === 'individual' ? 'Events' : 'Organization'
      }`;
      const description = this.generateRandomDescription();
      const website = this.generateRandomBoolean()
        ? this.generateRandomWebsite()
        : null;
      const logoUrl = this.generateRandomBoolean()
        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(
            name,
          )}&background=random`
        : null;
      const socialLinks = this.generateRandomSocialLinks();
      const phoneNumber = this.generateRandomPhoneNumber();
      const eventTypes = this.generateRandomEventTypes();
      const address = this.generateRandomAddress();
      const country = this.generateRandomCountry();

      // Mock Stripe data
      const stripeAccountId = `acct_${this.generateRandomString(14)}`;
      const stripeAccountStatus = this.generateStripeAccountStatus();
      const createdAt = this.generateRandomDate(
        this.config.startDate,
        this.config.endDate,
      );

      orgRecords.push({
        id: uuidv4(),
        ownerId,
        name,
        organizationType: orgType,
        description,
        website,
        logoUrl,
        socialLinks,
        phoneNumber,
        eventTypes,
        address,
        country,
        stripeAccountId,
        stripeAccountStatus,
        stripeAccountCreatedAt: createdAt,
        stripeAccountUpdatedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
    }

    // Get the transaction from context
    const tx = this.context.transaction;
    if (!tx) {
      throw new Error('Transaction not available in context');
    }

    // Process organizations in batches
    await this.processBatch(orgRecords, async (batch) => {
      await tx.insert(organizations).values(batch);
    });

    // Track created organizations
    this.context.trackEntities(
      'organizations',
      orgRecords.map((o) => o.id as string),
    );
    this.context.updateStats('organizations', orgRecords.length);
  }

  /**
   * Returns all created organization IDs
   */
  getOrganizationIds(): string[] {
    return this.context.entityMaps.get('organizations') || [];
  }

  private determineOrgSize(): 'large' | 'medium' | 'small' {
    const rand = this.generateRandomPercentage();
    const { largePercentage, mediumPercentage } =
      this.config.distribution.organizations;

    if (rand < largePercentage) {
      return 'large';
    } else if (rand < largePercentage + mediumPercentage) {
      return 'medium';
    } else {
      return 'small';
    }
  }

  private generateOrgType(): 'company' | 'individual' | 'non_profit' {
    const rand = this.generateRandomPercentage();

    if (rand < 50) {
      return 'company';
    } else if (rand < 80) {
      return 'non_profit';
    } else {
      return 'individual';
    }
  }

  private generateStripeAccountStatus(): string {
    const rand = this.generateRandomPercentage();

    if (rand < 80) {
      return 'active';
    } else if (rand < 95) {
      return 'pending';
    } else {
      return 'inactive';
    }
  }
}
