import { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../utils/logger';
// Using a simple hardcoded list for now. Consider a library like 'country-list' for a more comprehensive list.
import { countries } from './countries-list';

export async function getCountriesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    // Determine a default country (e.g., 'SG' for Singapore)
    const defaultCountry = 'SG';

    // Ensure the default country exists in the list
    const defaultExists = countries.some((c) => c.code === defaultCountry);
    const finalDefault = defaultExists
      ? defaultCountry
      : countries.length > 0
        ? countries[0].code
        : '';

    return reply.code(200).send({ countries, defaultCountry: finalDefault });
  } catch (error) {
    logger.error(`Error in getCountriesHandler: ${error}`);
    return reply
      .code(500)
      .send({ message: 'Internal Server Error fetching countries' });
  }
}
