import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Schema for user ID parameter
export const userIdParamSchema = z.object({
  id: z.string({
    required_error: 'User ID is required',
  }),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

// Schema for updating user properties
export const updateUserSchema = z.object({
  role: z.enum(['user', 'organizer', 'admin']).optional(),
  status: z.enum(['active', 'inactive', 'banned']).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// JSON schemas for Fastify validation
export const userIdParamJSONSchema = {
  params: zodToJsonSchema(userIdParamSchema, 'userIdParamSchema'),
};

export const updateUserJSONSchema = {
  params: zodToJsonSchema(userIdParamSchema, 'userIdParamSchema'),
  body: zodToJsonSchema(updateUserSchema, 'updateUserSchema'),
};

// Dashboard statistics schemas
export const adminDashboardStatsSchema = z.object({
  users: z.object({
    total: z.number(),
    growthRate: z.number(),
    newSinceLastMonth: z.number(),
  }),
  revenue: z.object({
    total: z.number(),
    growthRate: z.number(),
    newSinceLastMonth: z.number(),
  }),
  platformFee: z.object({
    currentRate: z.number(),
    lastChanged: z.string(),
  }),
});

export type AdminDashboardStats = z.infer<typeof adminDashboardStatsSchema>;

export const adminDashboardStatsJSONSchema = {
  response: {
    200: zodToJsonSchema(
      adminDashboardStatsSchema,
      'adminDashboardStatsSchema',
    ),
  },
};

// Monthly user statistics schema
export const monthlyUserStatsSchema = z.object({
  data: z.array(
    z.object({
      month: z.string(),
      total: z.number(),
    }),
  ),
});

export type MonthlyUserStats = z.infer<typeof monthlyUserStatsSchema>;

export const monthlyUserStatsJSONSchema = {
  response: {
    200: zodToJsonSchema(monthlyUserStatsSchema, 'monthlyUserStatsSchema'),
  },
};

// Monthly revenue data schema
export const monthlyRevenueDataSchema = z.array(
  z.object({
    month: z.string(),
    year: z.number(),
    revenue: z.number(),
    totalSales: z.number(),
    ticketsSold: z.number(),
  }),
);

export type MonthlyRevenueData = z.infer<typeof monthlyRevenueDataSchema>;

export const monthlyRevenueDataJSONSchema = {
  response: {
    200: zodToJsonSchema(monthlyRevenueDataSchema, 'monthlyRevenueDataSchema'),
  },
};

// User growth data schema
export const userGrowthDataSchema = z.array(
  z.object({
    month: z.string(),
    year: z.number(),
    newUsers: z.number(),
    totalUsers: z.number(),
  }),
);

export type UserGrowthData = z.infer<typeof userGrowthDataSchema>;

export const userGrowthDataJSONSchema = {
  response: {
    200: zodToJsonSchema(userGrowthDataSchema, 'userGrowthDataSchema'),
  },
};

// Event statistics schema
export const eventStatisticsSchema = z.array(
  z.object({
    month: z.string(),
    year: z.number(),
    newEvents: z.number(),
    ticketsSold: z.number(),
    averageTicketsPerEvent: z.number(), // Added
    eventOccupancyRate: z.number(), // Added
  }),
);

export type EventStatistics = z.infer<typeof eventStatisticsSchema>;

export const eventStatisticsJSONSchema = {
  response: {
    200: zodToJsonSchema(eventStatisticsSchema, 'eventStatisticsSchema'),
  },
};
