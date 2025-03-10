import { FastifyReply, FastifyRequest } from 'fastify';
import {
  createPlatformConfig,
  updatePlatformConfig,
  getPlatformConfigs,
  getPlatformConfigByKey,
  deletePlatformConfig,
  checkPlatformConfigExists,
} from './platform-configurations.services';
import {
  CreatePlatformConfigInput,
  UpdatePlatformConfigInput,
} from './platform-configurations.schema';
import { platformConfigurationsEnum } from '../../db/schema';
import { handleError } from '../../utils/errors';

export async function createPlatformConfigHandler(
  request: FastifyRequest<{
    Body: CreatePlatformConfigInput;
  }>,
  reply: FastifyReply,
) {
  try {
    const config = await createPlatformConfig(request.body);
    return reply.code(201).send(config);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function updatePlatformConfigHandler(
  request: FastifyRequest<{
    Params: { key: (typeof platformConfigurationsEnum.enumValues)[number] };
    Body: UpdatePlatformConfigInput;
  }>,
  reply: FastifyReply,
) {
  try {
    await checkPlatformConfigExists(request.params.key);

    const config = await updatePlatformConfig(request.params.key, request.body);
    return reply.code(200).send(config);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getPlatformConfigsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const configs = await getPlatformConfigs();
    return reply.code(200).send(configs);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function getPlatformConfigByKeyHandler(
  request: FastifyRequest<{
    Params: { key: (typeof platformConfigurationsEnum.enumValues)[number] };
  }>,
  reply: FastifyReply,
) {
  try {
    const config = await getPlatformConfigByKey(request.params.key);
    if (!config) {
      return reply.code(404).send({ message: 'Configuration not found' });
    }
    return reply.code(200).send(config);
  } catch (error) {
    return handleError(error, request, reply);
  }
}

export async function deletePlatformConfigHandler(
  request: FastifyRequest<{
    Params: { key: (typeof platformConfigurationsEnum.enumValues)[number] };
  }>,
  reply: FastifyReply,
) {
  try {
    await checkPlatformConfigExists(request.params.key);

    const config = await deletePlatformConfig(request.params.key);
    return reply.code(200).send(config);
  } catch (error) {
    return handleError(error, request, reply);
  }
}
