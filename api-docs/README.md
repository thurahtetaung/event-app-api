# Event App API Documentation

This directory contains the Postman collection for the Event App API. The collection includes all available endpoints with example requests and responses.

## Getting Started

1. Import the `event-app-api.postman_collection.json` file into Postman
2. Create an environment in Postman with the following variables:
   - `baseUrl`: Your API base URL (e.g., `http://localhost:3000`)
   - `accessToken`: Will be automatically populated after login

## Authentication

All endpoints except `/auth/register` and `/auth/login` require authentication. The authentication token should be included in the `Authorization` header as a Bearer token:

```
Authorization: Bearer <access_token>
```

## Available Endpoints

### Auth
- `POST /api/users/register` - Register a new user (email, username)
- `POST /api/users/verifyRegistration` - Verify registration OTP
- `POST /api/users/login` - Login with email (sends OTP)
- `POST /api/users/verifyLogin` - Verify login OTP

### Events
- `POST /api/events` - Create a new event (organizer only)
- `GET /api/events` - Get all events (public)
- `GET /api/events/:id` - Get event by ID (public)
- `PATCH /api/events/:id` - Update event (organizer only)
- `DELETE /api/events/:id` - Delete event (organizer only)
- `PATCH /api/events/:id/publish` - Update event publish status (organizer only)

### Organizations
- `GET /api/organizations` - Get all organizations
- `GET /api/organizations/:id` - Get organization by ID
Note: Organizations are created automatically when an organizer application is approved.

### Organizer Applications
- `POST /api/organizer-applications` - Create a new application (authenticated)
- `GET /api/organizer-applications` - Get all applications (admin only)
- `GET /api/organizer-applications/:id` - Get application by ID (admin only)
- `PATCH /api/organizer-applications/:id/status` - Update application status (admin only)

### Tickets
- `POST /api/tickets/generate` - Generate tickets for an event (organizer only)
- `POST /api/tickets/purchase` - Purchase tickets for an event (authenticated)

### Platform Configurations
- `POST /api/platform-configurations` - Create platform configuration (admin only)
- `GET /api/platform-configurations` - Get all platform configurations (authenticated)
- `GET /api/platform-configurations/:key` - Get platform configuration by key (authenticated)
- `PATCH /api/platform-configurations/:key` - Update platform configuration (admin only)
- `DELETE /api/platform-configurations/:key` - Delete platform configuration (admin only)

### Stripe Connect
- `POST /api/stripe/connect` - Create Stripe Connect account (organizer only)
- `GET /api/stripe/onboard/complete/:organizationId` - Complete Stripe onboarding (organizer only)
- `GET /api/stripe/onboard/refresh/:organizationId` - Refresh Stripe onboarding URL (organizer only)
- `PATCH /api/stripe/status` - Update Stripe account status (admin only)
- `POST /api/stripe/webhook` - Handle Stripe webhooks

### Admin
- `POST /api/admin/seed` - Seed the database with test data (admin only)
- `POST /api/admin/nuke` - Clear all data from the database (admin only)

### Categories
- `POST /api/categories` - Create a new category (admin only)
- `GET /api/categories` - Get all categories (public)
- `GET /api/categories/:id` - Get category by ID (public)
- `PUT /api/categories/:id` - Update category (admin only)
- `DELETE /api/categories/:id` - Delete category (admin only)

## Role-Based Access

The API implements role-based access control:
- Public routes: Register, Login, Get Categories, Get Events
- Protected routes: Require authentication (e.g., Purchase Tickets)
- Organizer routes: Require authentication and organizer role (e.g., Create Events)
- Admin routes: Require authentication and admin role (e.g., Platform Configurations)

Note: User roles can only be changed through admin-controlled processes (e.g., approving organizer applications).

## Schema Validation

All endpoints use Zod for request validation. The validation schemas are automatically converted to JSON Schema for Fastify validation.

### Event Schemas
```typescript
// Create Event
{
  name: string,
  organizationId: string (uuid),
  capacity: number,
  description?: string,
  categoryId?: string (uuid),
  isVirtual?: boolean,
  bannerUrl?: string,
  startTimestamp?: string (ISO date),
  endTimestamp?: string (ISO date)
}

// Update Event Publish Status
{
  isPublished: boolean
}
```

### Ticket Schemas
```typescript
// Generate Tickets
{
  eventId: string (uuid),
  sections: Array<{
    name: string,
    price: number,
    currency: string (default: 'usd'),
    numberOfSeats: number,
    seatNumbering: {
      type: 'numbered' | 'alphabet' | 'custom',
      startFrom?: number,  // For numbered type
      prefix?: string,     // For alphabet or custom type
      suffix?: string
    }
  }>
}

// Purchase Tickets
{
  eventId: string (uuid),
  tickets: Array<{
    ticketId: string (uuid),
    seatNumber: string
  }>
}
```

### Platform Configuration Schemas
```typescript
// Create Configuration
{
  key: 'platform_name' | 'platform_fee',
  value: string
}

// Update Configuration
{
  value: string
}
```

### Stripe Schemas
```typescript
// Create Stripe Account
{
  organizationId: string (uuid)
}

// Update Account Status
{
  organizationId: string (uuid),
  status: 'active' | 'inactive' | 'pending'
}
```

## Platform Configurations

The API supports the following platform configurations:
- `platform_name`: Name of the platform
- `platform_fee`: Platform fee percentage for ticket sales

## Payment Processing

The API uses Stripe Connect for payment processing:
- Organizations must connect their Stripe account to receive payments
- Platform fee is automatically deducted from each payment (configurable via platform configurations)
- Remaining amount is transferred to the organization's Stripe account
- Organizations must have an active Stripe account to sell tickets

### Ticket Purchase Flow
1. User selects tickets to purchase
2. API creates a payment intent and reserves the tickets
3. User completes payment using Stripe Elements on the frontend
4. On successful payment:
   - Order status is updated to 'completed'
   - Tickets are marked as 'booked'
   - Platform fee is deducted and remaining amount is transferred to organizer
5. On failed payment:
   - Order status is updated to 'failed'
   - Tickets are released back to 'available'

### Ticket Generation
Organizers can generate tickets with:
- Multiple sections with different prices
- Customizable seat numbering (numbered, alphabet, or custom)
- Section-specific pricing and currency

## Error Responses

All endpoints return appropriate HTTP status codes:
- `200` - Success (GET, PATCH, DELETE)
- `201` - Created (POST)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

Each error response includes:
```json
{
  "statusCode": number,
  "error": string,
  "message": string
}
```