import { FastifyInstance } from 'fastify';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import {
  getAllUsersHandler,
  getUserByIdHandler,
  updateUserHandler,
  deleteUserHandler,
  getUserStatsHandler,
  getUserEventsHandler,
  getUserTransactionsHandler,
  getDashboardStatsHandler,
  getMonthlyUserStatsHandler,
  getMonthlyRevenueDataHandler,
  getUserGrowthDataHandler,
  getEventStatisticsHandler,
} from './admin.controllers';
import {
  userIdParamJSONSchema,
  updateUserJSONSchema,
  UserIdParam,
  UpdateUserInput,
  adminDashboardStatsJSONSchema,
  monthlyUserStatsJSONSchema,
  monthlyRevenueDataJSONSchema,
  userGrowthDataJSONSchema,
  eventStatisticsJSONSchema,
} from './admin.schema';

export async function adminRoutes(app: FastifyInstance) {
  // Add dashboard stats route
  app.get(
    '/dashboard/stats',
    {
      schema: adminDashboardStatsJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getDashboardStatsHandler,
  );

  // Add monthly user stats route
  app.get(
    '/dashboard/users/monthly',
    {
      schema: monthlyUserStatsJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getMonthlyUserStatsHandler,
  );

  // Add user management routes
  app.get(
    '/users',
    {
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getAllUsersHandler,
  );

  app.get<{ Params: UserIdParam }>(
    '/users/:id',
    {
      schema: userIdParamJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getUserByIdHandler,
  );

  app.put<{ Params: UserIdParam; Body: UpdateUserInput }>(
    '/users/:id',
    {
      schema: updateUserJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    updateUserHandler,
  );

  app.delete<{ Params: UserIdParam }>(
    '/users/:id',
    {
      schema: userIdParamJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    deleteUserHandler,
  );

  // Add new routes for user stats, events, and transactions
  app.get<{ Params: UserIdParam }>(
    '/users/:id/stats',
    {
      schema: userIdParamJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getUserStatsHandler,
  );

  app.get<{ Params: UserIdParam }>(
    '/users/:id/events',
    {
      schema: userIdParamJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getUserEventsHandler,
  );

  app.get<{ Params: UserIdParam }>(
    '/users/:id/transactions',
    {
      schema: userIdParamJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getUserTransactionsHandler,
  );

  // Add analytics reports routes
  app.get(
    '/reports/revenue',
    {
      schema: monthlyRevenueDataJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getMonthlyRevenueDataHandler,
  );

  app.get(
    '/reports/users/growth',
    {
      schema: userGrowthDataJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getUserGrowthDataHandler,
  );

  app.get(
    '/reports/events/statistics',
    {
      schema: eventStatisticsJSONSchema,
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    getEventStatisticsHandler,
  );
}
