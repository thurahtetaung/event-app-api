import { FastifyInstance } from 'fastify/fastify';
import {
  loginUserJSONSchema,
  registerUserJSONSchema,
  verifyRegistrationJSONSchema,
  verifyLoginJSONSchema,
  updateUserDetailsJSONSchema,
} from './users.schema';
import {
  loginUserHandler,
  registerUserHandler,
  updateUserDetailsHandler,
  verifyLoginHandler,
  verifyRegistrationHandler,
} from './users.controllers';

export async function userRouter(app: FastifyInstance) {
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

  app.post(
    '/updateProfile',
    {
      schema: updateUserDetailsJSONSchema,
    },
    updateUserDetailsHandler,
  );
}
