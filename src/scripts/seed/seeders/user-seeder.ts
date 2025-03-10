import { db } from '../../../db';
import { users } from '../../../db/schema';
import { BaseSeeder } from '../utils/base-seeder';
import { SeedingConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { TransactionContext } from '../utils/transaction-manager';
import { InferInsertModel } from 'drizzle-orm';

type UserInsert = InferInsertModel<typeof users>;

export class UserSeeder extends BaseSeeder {
  private config: SeedingConfig;
  private organizerUserIds: string[] = [];

  constructor(context: TransactionContext, config: SeedingConfig) {
    super(context);
    this.config = config;
  }

  async seed(): Promise<void> {
    const userCount = this.config.volumes.users;
    const userRecords: UserInsert[] = [];

    // Generate users
    for (let i = 0; i < userCount; i++) {
      // Generate a single full name and split it properly
      const fullName = this.generateRandomName();
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0];
      // Join remaining parts as last name or use a default if only one part
      const lastName =
        nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Smith'; // Default last name if the generated name has only one part

      // Ensure email uniqueness by adding a timestamp and random string
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 7);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}+${timestamp}${randomStr}@example.com`;

      const dateOfBirth = this.generateRandomDate(
        new Date('1970-01-01'),
        new Date('2000-12-31'),
      );
      const country = this.generateRandomCountry();
      const supabaseUserId = `sb_${uuidv4()}`;
      const role = this.generateUserRole();
      const status = 'active';
      const verified = this.generateRandomBoolean();
      const createdAt = this.generateRandomDate(
        this.config.startDate,
        this.config.endDate,
      );

      const id = uuidv4();

      // Keep track of organizer user IDs
      if (role === 'organizer') {
        this.organizerUserIds.push(id);
      }

      userRecords.push({
        id,
        email,
        firstName,
        lastName,
        dateOfBirth,
        country,
        supabaseUserId,
        role,
        status,
        verified,
        createdAt,
        updatedAt: createdAt,
      });
    }

    // Get the transaction from context
    const tx = this.context.transaction;
    if (!tx) {
      throw new Error('Transaction not available in context');
    }

    // Process users in batches
    await this.processBatch(userRecords, async (batch) => {
      try {
        await tx.insert(users).values(batch);
      } catch (error) {
        console.error(`Error inserting user batch: ${error.message}`);

        // If we have a duplicate key error, try inserting users one by one to skip duplicates
        if (error.code === '23505') {
          console.log(
            'Attempting to insert users one by one to skip duplicates...',
          );
          for (const user of batch) {
            try {
              await tx.insert(users).values(user);
            } catch (innerError) {
              console.error(
                `Skipping user with email ${user.email}: ${innerError.message}`,
              );
            }
          }
        } else {
          // For other errors, rethrow
          throw error;
        }
      }
    });

    // Track created users
    this.context.trackEntities(
      'users',
      userRecords.map((u) => u.id as string),
    );
    this.context.updateStats('users', userRecords.length);
  }

  /**
   * Returns all created organizer user IDs
   */
  getOrganizerUserIds(): string[] {
    return this.organizerUserIds;
  }

  private generateUserRole(): 'user' | 'organizer' | 'admin' {
    const rand = this.generateRandomPercentage();
    if (rand < 1) return 'admin'; // 1% admins
    if (rand < 11) return 'organizer'; // 10% organizers
    return 'user'; // 89% regular users
  }
}
