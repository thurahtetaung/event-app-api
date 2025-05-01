import { FastifyInstance } from 'fastify';
import { getCountriesHandler } from './utils.controllers';

export async function utilityRoutes(app: FastifyInstance) {
  app.get(
    '/countries',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              countries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    name: { type: 'string' },
                  },
                  required: ['code', 'name'],
                },
              },
              defaultCountry: { type: 'string' },
            },
            required: ['countries', 'defaultCountry'],
          },
        },
      },
    },
    getCountriesHandler,
  );
}
