import { db } from '../db';
import { events, categories } from '../db/schema';
import { eq, isNull } from 'drizzle-orm';
import { logger } from '../utils/logger';

// Mapping of common categories to their default icons
const CATEGORY_ICON_MAPPING: Record<string, string> = {
  Conference: 'Video',
  Workshop: 'Presentation',
  Concert: 'Music2',
  Exhibition: 'Palette',
  Sports: 'Trophy',
  Networking: 'Users',
  Festival: 'PartyPopper',
  Other: 'Globe',
};

async function migrateEventsCategories() {
  try {
    logger.info('Starting events category migration');

    // First, ensure all categories exist
    const existingCategories = await db.select().from(categories);
    const existingCategoryNames = existingCategories.map((c) => c.name);

    // Create a map of category names to their IDs
    const categoryMap = new Map(existingCategories.map((c) => [c.name, c.id]));

    // Check which standard categories need to be created
    const categoriesToCreate = Object.keys(CATEGORY_ICON_MAPPING)
      .filter((name) => !existingCategoryNames.includes(name))
      .map((name) => ({
        name,
        icon: CATEGORY_ICON_MAPPING[name],
      }));

    // Create missing categories
    if (categoriesToCreate.length > 0) {
      logger.info(`Creating ${categoriesToCreate.length} missing categories`);
      const newCategories = await db
        .insert(categories)
        .values(categoriesToCreate)
        .returning();

      // Add new categories to the map
      for (const cat of newCategories) {
        categoryMap.set(cat.name, cat.id);
      }
    }

    // Get all events that don't have a categoryId but have a category name
    const eventsToUpdate = await db
      .select()
      .from(events)
      .where(isNull(events.categoryId));

    logger.info(
      `Found ${eventsToUpdate.length} events to update with categoryId`,
    );

    // Update each event with the appropriate categoryId
    let updatedCount = 0;
    let skippedCount = 0;

    for (const event of eventsToUpdate) {
      if (!event.category) {
        logger.warn(`Event ${event.id} has no category name, skipping`);
        skippedCount++;
        continue;
      }

      const categoryId = categoryMap.get(event.category);
      if (!categoryId) {
        // If the category doesn't exist, create it with a default icon
        logger.info(
          `Creating new category "${event.category}" for event ${event.id}`,
        );
        const [newCategory] = await db
          .insert(categories)
          .values({
            name: event.category,
            icon: CATEGORY_ICON_MAPPING['Other'] || 'Globe',
          })
          .returning();

        // Update the event with the new categoryId
        await db
          .update(events)
          .set({ categoryId: newCategory.id })
          .where(eq(events.id, event.id));

        updatedCount++;
      } else {
        // Update the event with the existing categoryId
        await db
          .update(events)
          .set({ categoryId: categoryId })
          .where(eq(events.id, event.id));

        updatedCount++;
      }
    }

    logger.info(
      `Migration completed: ${updatedCount} events updated, ${skippedCount} events skipped`,
    );
  } catch (error) {
    logger.error('Error during events category migration:', error);
    throw error;
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateEventsCategories()
    .then(() => {
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateEventsCategories };
