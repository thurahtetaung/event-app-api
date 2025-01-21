import { FastifyInstance } from 'fastify';
import { authenticateRequest, checkRole } from '../../middleware/auth';
import { seedDatabase, nukeDatabase } from './admin.services';

export async function adminRoutes(app: FastifyInstance) {
  app.post(
    '/seed',
    {
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    async (request, reply) => {
      try {
        await seedDatabase();
        return reply
          .code(200)
          .send({ message: 'Database seeded successfully' });
      } catch (error) {
        return reply.code(500).send({ message: 'Error seeding database' });
      }
    },
  );

  app.post(
    '/nuke',
    {
      preHandler: [authenticateRequest, checkRole(['admin'])],
    },
    async (request, reply) => {
      try {
        await nukeDatabase();
        return reply.code(200).send({ message: 'Database nuked successfully' });
      } catch (error) {
        return reply.code(500).send({ message: 'Error nuking database' });
      }
    },
  );
}
