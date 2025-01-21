import { FastifyInstance } from 'fastify';
import {
  loginUserJSONSchema,
  registerUserJSONSchema,
  verifyRegistrationJSONSchema,
  verifyLoginJSONSchema,
} from './users.schema';
import {
  loginUserHandler,
  registerUserHandler,
  verifyLoginHandler,
  verifyRegistrationHandler,
} from './users.controllers';

export async function userRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {});

  app.post(
    '/register',
    {
      schema: registerUserJSONSchema,
    },
    registerUserHandler,
  );

  app.post(
    '/verifyRegistration',
    {
      schema: verifyRegistrationJSONSchema,
    },
    verifyRegistrationHandler,
  );

  app.post(
    '/login',
    {
      schema: loginUserJSONSchema,
    },
    loginUserHandler,
  );

  app.post(
    '/verifyLogin',
    {
      schema: verifyLoginJSONSchema,
    },
    verifyLoginHandler,
  );
}
