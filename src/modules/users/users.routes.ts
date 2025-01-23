import { FastifyInstance } from 'fastify';
import {
  loginUserJSONSchema,
  registerUserJSONSchema,
  verifyRegistrationJSONSchema,
  verifyLoginJSONSchema,
  resendOTPJSONSchema,
} from './users.schema';
import {
  loginUserHandler,
  registerUserHandler,
  verifyLoginHandler,
  verifyRegistrationHandler,
  resendRegistrationOTPHandler,
  resendLoginOTPHandler,
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
    '/resendRegistrationOTP',
    {
      schema: resendOTPJSONSchema,
    },
    resendRegistrationOTPHandler,
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
    '/resendLoginOTP',
    {
      schema: resendOTPJSONSchema,
    },
    resendLoginOTPHandler,
  );
}
