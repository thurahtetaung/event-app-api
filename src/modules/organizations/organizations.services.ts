import { InferInsertModel } from 'drizzle-orm';
import { db } from '../../db';
import { organizations } from '../../db/schema';

export async function createOrganization(
  data: InferInsertModel<typeof organizations>,
) {
  const result = await db.insert(organizations).values(data).returning();
  return result[0];
}

export async function getorganizations() {
  const result = db
    .select({
      id: organizations.id,
      name: organizations.name,
    })
    .from(organizations);
  return result;
}
