import { InferInsertModel } from 'drizzle-orm';
import { db } from '../../db';
import { events } from '../../db/schema';

export async function createEvent(data: InferInsertModel<typeof events>) {
  const result = await db.insert(events).values(data).returning();
  return result[0];
}

export async function getevents() {
  const result = db
    .select({
      id: events.id,
      name: events.name,
      organization_id: events.organizationId,
      capacity: events.capacity,
    })
    .from(events);
  return result;
}
