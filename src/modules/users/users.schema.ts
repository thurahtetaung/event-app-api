import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const registerUserBodySchema = z.object({
  email: z.string({
    required_error: 'Email is required',
  }),
  firstName: z.string({
    required_error: 'First name is required',
  }),
  lastName: z.string({
    required_error: 'Last name is required',
  }),
  dateOfBirth: z.string({
    required_error: 'Date of birth is required',
  }),
  country: z.string({
    required_error: 'Country is required',
  }),
  role: z.enum(['user', 'organizer', 'admin']).default('user'),
});

export type registerUserBodySchema = {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
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

export const resendOTPBodySchema = z.object({
  email: z.string({
    required_error: 'Email is required',
  }),
});

export type resendOTPBodySchema = {
  email: string;
};

export const resendOTPJSONSchema = {
  body: zodToJsonSchema(resendOTPBodySchema, 'resendOTPBodySchema'),
};
