import { db } from '../../../db';
import { seedingAudit } from '../../../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { InferInsertModel } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import { inArray } from 'drizzle-orm';

export interface TransactionContext {
  batchId: string;
  startTime: Date;
  entityMaps: Map<string, string[]>;
  stats: Map<string, number>;
  transaction?: any; // Transaction object from Drizzle
  trackEntities(entityType: string, ids: string[]): void;
  updateStats(entityType: string, count: number): void;
}

type SeedingAuditInsert = InferInsertModel<typeof seedingAudit>;

export class TransactionManager {
  private context: TransactionContext;

  constructor() {
    this.context = {
      batchId: uuidv4(),
      startTime: new Date(),
      entityMaps: new Map(),
      stats: new Map(),
      trackEntities: (entityType: string, ids: string[]) => {
        const existing = this.context.entityMaps.get(entityType) || [];
        this.context.entityMaps.set(entityType, [...existing, ...ids]);
      },
      updateStats: (entityType: string, count: number) => {
        const existing = this.context.stats.get(entityType) || 0;
        this.context.stats.set(entityType, existing + count);
      },
    };
  }

  /**
   * Returns the current batch ID
   */
  getBatchId(): string {
    return this.context.batchId;
  }

  async executeWithTransaction<T>(
    operations: (ctx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    // Start transaction
    try {
      return await db.transaction(async (tx) => {
        try {
          // Set the transaction in the context
          this.context.transaction = tx;

          // Execute operations
          const operationResult = await operations(this.context);

          // Log successful operation
          const auditEntry: SeedingAuditInsert = {
            id: uuidv4(),
            batchId: this.context.batchId,
            operation: 'SEED',
            entityType: 'batch',
            entityIds: JSON.stringify(
              Array.from(this.context.entityMaps.entries()),
            ),
            metadata: JSON.stringify({
              stats: Array.from(this.context.stats.entries()),
              duration: Date.now() - this.context.startTime.getTime(),
            }),
            status: 'SUCCESS',
            createdBy: 'seed-script',
          };

          // Insert audit record
          await tx.insert(seedingAudit).values(auditEntry);

          return operationResult;
        } catch (error) {
          console.error('Transaction failed:', error);
          throw error;
        }
      });
    } catch (error) {
      console.error('Failed to execute transaction:', error);
      throw error;
    }
  }

  async rollback(batchId: string): Promise<void> {
    try {
      // Get all entities created in this batch
      const audit = await db
        .select()
        .from(seedingAudit)
        .where(eq(seedingAudit.batchId, batchId))
        .limit(1);
      const auditRecord = audit[0];

      if (!auditRecord) {
        throw new Error(`No seeding batch found with ID: ${batchId}`);
      }

      const entityMaps = JSON.parse(auditRecord.entityIds) as [
        string,
        string[],
      ][];

      // Execute rollback in transaction
      await db.transaction(async (tx) => {
        // Delete entities in reverse order to respect foreign keys
        for (const [entityType, ids] of entityMaps.reverse()) {
          await this.deleteEntities(entityType, ids, tx);
        }

        // Log rollback operation
        const auditEntry: SeedingAuditInsert = {
          id: uuidv4(),
          batchId,
          operation: 'ROLLBACK',
          entityType: 'batch',
          entityIds: auditRecord.entityIds,
          status: 'SUCCESS',
          metadata: JSON.stringify({
            rolledBackAt: new Date().toISOString(),
          }),
          createdBy: 'seed-script',
        };

        await tx.insert(seedingAudit).values(auditEntry);
      });
    } catch (error) {
      // Log rollback failure
      const auditEntry: SeedingAuditInsert = {
        id: uuidv4(),
        batchId,
        operation: 'ROLLBACK',
        entityType: 'batch',
        entityIds: '[]',
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        createdBy: 'seed-script',
      };

      await db.insert(seedingAudit).values(auditEntry);

      throw error;
    }
  }

  private async deleteEntities(
    entityType: string,
    ids: string[],
    tx?: any,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const tableMap: Record<string, string> = {
      users: 'users',
      organizations: 'organizations',
      events: 'events',
      ticketTypes: 'ticket_types',
      tickets: 'tickets',
      orders: 'orders',
      orderItems: 'order_items',
    };

    const tableName = tableMap[entityType];
    if (!tableName || !(tableName in schema)) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const table = schema[tableName as keyof typeof schema];
    if (!('id' in table)) {
      throw new Error(`Table ${tableName} does not have an id column`);
    }

    // Use provided transaction or db directly
    const dbConnection = tx || db;

    // Delete entities in batches
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      await dbConnection.delete(table).where(inArray(table.id, batch));
    }
  }
}
