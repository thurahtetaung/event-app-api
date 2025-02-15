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
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRolesEnum = pgEnum('user_roles', [
  'user',
  'organizer',
  'admin',
]);

export const organizationTypeEnum = pgEnum('organization_type', [
  'company',
  'individual',
  'non_profit',
]);

export const eventTypesEnum = pgEnum('event_types', [
  'conference',
  'workshop',
  'concert',
  'exhibition',
  'sports',
  'networking',
  'festival',
  'corporate',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: timestamp('date_of_birth').notNull(),
    country: text('country').notNull(),
    supabaseUserId: text('supabase_user_id').unique(),
    role: userRolesEnum('role').notNull().default('user'),
    verified: boolean('verified').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (users) => [
    // Add index for email
    index().on(users.email),
  ],
);

export const categories = pgTable('categories', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    capacity: integer().notNull(),
    categoryId: uuid().references(() => categories.id),
    isVirtual: boolean().default(true),
    bannerUrl: text(),
    isPublished: boolean().default(false),
    createdAt: timestamp().defaultNow(),
    startTimestamp: timestamp(),
    endTimestamp: timestamp(),
    updatedAt: timestamp().defaultNow(),
  },
  (events) => [
    // Add index for organizationId, categoryId
    index().on(events.organizationId),
    index().on(events.categoryId),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    organizationType: organizationTypeEnum('organization_type').notNull(),
    description: text('description').notNull(),
    website: text('website'),
    logoUrl: text('logo_url'),
    socialLinks: text('social_links'), // JSON string of social media links
    phoneNumber: text('phone_number'),
    eventTypes: text('event_types').notNull(), // JSON array of event types
    address: text('address').notNull(),
    country: text('country').notNull(),
    stripeAccountId: text('stripe_account_id').unique(),
    stripeAccountStatus: text('stripe_account_status').default('pending'), // pending, active, inactive
    stripeAccountCreatedAt: timestamp('stripe_account_created_at'),
    stripeAccountUpdatedAt: timestamp('stripe_account_updated_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
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
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    seatNumber: text('seat_number').notNull(),
    price: integer('price').notNull(),
    currency: text('currency').notNull().default('usd'),
    status: text('status')
      .notNull()
      .default('available')
      .$type<'available' | 'reserved' | 'booked'>(),
    userId: uuid('user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (tickets) => [
    // Add index for eventId and status
    index().on(tickets.eventId),
    index().on(tickets.status),
    // Add unique constraint for event_id + seat_number combination
    uniqueIndex('tickets_event_seat_unique').on(
      tickets.eventId,
      tickets.seatNumber,
    ),
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
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
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
  ['platform_name', 'platform_fee'],
);

export const platformConfigurations = pgTable(
  'platform_configurations',
  {
    id: uuid().primaryKey().defaultRandom(),
    key: platformConfigurationsEnum().notNull(),
    value: text().notNull(),
    createdAt: timestamp().defaultNow(),
    updatedAt: timestamp().defaultNow(),
  },
  // unique constraint for key
  (platformConfigurations) => [
    uniqueIndex('platform_configurations_key_unique').on(
      platformConfigurations.key,
    ),
  ],
);

export const organizerApplications = pgTable('organizer_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  organizationName: text('organization_name').notNull(),
  organizationType: organizationTypeEnum('organization_type').notNull(),
  description: text('description').notNull(),
  experience: text('experience').notNull(),
  website: text('website'),
  logoUrl: text('logo_url'),
  socialLinks: text('social_links'), // JSON string of social media links
  phoneNumber: text('phone_number'),
  eventTypes: text('event_types').notNull(), // JSON array of event types
  address: text('address').notNull(),
  country: text('country').notNull(),
  status: text('status').notNull().default('pending'), // pending, approved, rejected
  rejectionReason: text('rejection_reason'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
