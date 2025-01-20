import {
  integer,
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  unique,
} from 'drizzle-orm/pg-core';

export const userRolesEnum = pgEnum('user_roles', [
  'user',
  'admin',
  'organizer',
]);

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    username: text().notNull().unique(),
    supabaseUserId: text().unique(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    role: userRolesEnum().default('user').notNull(),
    verified: boolean().default(false).notNull(),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow(),
  },
  (users) => [
    // Add index for email, username
    index().on(users.email),
    index().on(users.username),
  ],
);

export const categories = pgTable('categories', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const venues = pgTable('venues', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  address: text().notNull(),
  capacity: integer().notNull(),
  isActive: boolean().default(true),
  bannerUrl: text().default(null),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text().default(null),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    capacity: integer().notNull(),
    categoryId: uuid()
      .references(() => categories.id)
      .default(null),
    venueId: uuid()
      .references(() => venues.id)
      .default(null),
    isVirtual: boolean().default(true),
    bannerUrl: text().default(null),
    createdAt: timestamp().defaultNow(),
    startTimestamp: timestamp(),
    endTimestamp: timestamp(),
    updatedAt: timestamp().defaultNow(),
  },
  (events) => [
    // Add index for organizationId, categoryId, venueId
    index().on(events.organizationId),
    index().on(events.categoryId),
    index().on(events.venueId),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid().references(() => users.id),
    name: text().notNull(),
    description: text().default(null),
    logoUrl: text().default(null),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow(),
  },
  (organizations) => [
    // Add index for ownerId
    index().on(organizations.ownerId),
  ],
);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'available',
  'booked',
]);

export const tickets = pgTable(
  'tickets',
  {
    name: text().notNull(),
    seatNumber: text().notNull(),
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id),
    price: integer().notNull(),
    status: ticketStatusEnum().default('available'),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow(),
  },
  (tickets) => [
    // Add index for eventId, userId
    index().on(tickets.eventId),
    index().on(tickets.userId),
    // composite unique constraint for eventId, seatNumber
    unique().on(tickets.eventId, tickets.seatNumber),
  ],
);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'completed',
  'failed',
  'cancelled',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    stripePaymentId: text().notNull(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    status: orderStatusEnum().default('pending'),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow(),
  },
  (orders) => [
    // Add index for userId, eventId
    index().on(orders.userId),
    index().on(orders.eventId),
  ],
);

export const orderItems = pgTable('order_items', {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  ticketId: uuid()
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const platformConfigurationsEnum = pgEnum(
  'platform_configurations_keys',
  [
    'platform_name', // Name of the platform
    'platform_fee', // Fee charged by the platform in percentage
    'platform_currency', // Currency of the platform
  ],
);

export const platformConfigurations = pgTable('platform_configurations', {
  id: uuid().primaryKey().defaultRandom(),
  key: platformConfigurationsEnum().notNull(),
  value: text().notNull(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});
