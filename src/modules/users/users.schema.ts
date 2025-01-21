import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const registerUserBodySchema = z.object({
  email: z.string({
    required_error: 'Email is required',
  }),
  username: z.string({
    required_error: 'Username is required',
  }),
  role: z.enum(['user', 'organizer', 'admin']).default('user'),
});

export type registerUserBodySchema = {
  email: string;
  username: string;
  role: 'user' | 'organizer' | 'admin';
};

export const registerUserJSONSchema = {
  body: zodToJsonSchema(registerUserBodySchema, 'createUserBodySchema'),
};

export const verifyRegistrationBodySchema = z.object({
  email: z.string({
    required_error: 'Email is required',
  }),
  otp: z.string({
    required_error: 'OTP is required',
  }),
});

export type verifyRegistrationBodySchema = {
  email: string;
  otp: string;
};

export const verifyRegistrationJSONSchema = {
  body: zodToJsonSchema(
    verifyRegistrationBodySchema,
    'verifyRegistrationBodySchema',
  ),
};

export const loginUserBodySchema = z.object({
  email: z.string({
    required_error: 'Email is required',
  }),
});

export type loginUserBodySchema = {
  email: string;
};

export const loginUserJSONSchema = {
  body: zodToJsonSchema(loginUserBodySchema, 'loginUserBodySchema'),
};

export const verifyLoginBodySchema = z.object({
  email: z.string({
    required_error: 'Email is required',
  }),
  otp: z.string({
    required_error: 'OTP is required',
  }),
});

export type verifyLoginBodySchema = {
  email: string;
  otp: string;
};

export const verifyLoginJSONSchema = {
  body: zodToJsonSchema(verifyLoginBodySchema, 'verifyLoginBodySchema'),
};
