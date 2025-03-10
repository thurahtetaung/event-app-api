import { FastifyReply, FastifyRequest } from 'fastify';
import { handleError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserStats,
  getUserEvents,
  getUserTransactions,
  getDashboardStats,
  getMonthlyUserStats,
  getMonthlyRevenueData,
  getUserGrowthData,
  getEventStatistics,
} from './admin.services';
import { UserIdParam, UpdateUserInput } from './admin.schema';

export async function getAllUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const users = await getAllUsers();
    return reply.code(200).send(users);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getUserByIdHandler(
  request: FastifyRequest<{
    Params: UserIdParam;
  }>,
  reply: FastifyReply,
) {
  try {
    const user = await getUserById(request.params.id);
    return reply.code(200).send(user);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updateUserHandler(
  request: FastifyRequest<{
    Params: UserIdParam;
    Body: UpdateUserInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const { id } = request.params;
    const { role, status } = request.body;

    logger.info(`Updating user ${id} with role: ${role}, status: ${status}`);

    const updatedUser = await updateUser(id, { role, status });
    return reply.code(200).send(updatedUser);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function deleteUserHandler(
  request: FastifyRequest<{
    Params: UserIdParam;
  }>,
  reply: FastifyReply,
) {
  try {
    const { id } = request.params;
    await deleteUser(id);
    return reply.code(204).send();
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getUserStatsHandler(
  request: FastifyRequest<{
    Params: UserIdParam;
  }>,
  reply: FastifyReply,
) {
  try {
    const stats = await getUserStats(request.params.id);
    return reply.code(200).send(stats);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getUserEventsHandler(
  request: FastifyRequest<{
    Params: UserIdParam;
  }>,
  reply: FastifyReply,
) {
  try {
    const events = await getUserEvents(request.params.id);
    return reply.code(200).send(events);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getUserTransactionsHandler(
  request: FastifyRequest<{
    Params: UserIdParam;
  }>,
  reply: FastifyReply,
) {
  try {
    const transactions = await getUserTransactions(request.params.id);
    return reply.code(200).send(transactions);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getDashboardStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const stats = await getDashboardStats();
    return reply.code(200).send(stats);
  } catch (error: any) {
    logger.error(`Error fetching dashboard stats: ${error}`);
    return handleError(error, request, reply);
  }
}

export async function getMonthlyUserStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const stats = await getMonthlyUserStats();
    return reply.code(200).send(stats);
  } catch (error: any) {
    logger.error(`Error fetching monthly user stats: ${error}`);
    return handleError(error, request, reply);
  }
}

export async function getMonthlyRevenueDataHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    logger.info('Fetching monthly revenue data for admin reports');
    const revenueData = await getMonthlyRevenueData();
    return reply.code(200).send(revenueData);
  } catch (error) {
    logger.error(`Error in getMonthlyRevenueDataHandler: ${error}`);
    return handleError(error, request, reply);
  }
}

export async function getUserGrowthDataHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    logger.info('Fetching user growth data for admin reports');
    const growthData = await getUserGrowthData();
    return reply.code(200).send(growthData);
  } catch (error) {
    logger.error(`Error in getUserGrowthDataHandler: ${error}`);
    return handleError(error, request, reply);
  }
}

export async function getEventStatisticsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    logger.info('Fetching event statistics for admin reports');
    const statistics = await getEventStatistics();
    return reply.code(200).send(statistics);
  } catch (error) {
    logger.error(`Error in getEventStatisticsHandler: ${error}`);
    return handleError(error, request, reply);
  }
}
