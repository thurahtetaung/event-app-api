# Event App API - README.md

## Table of Contents

1.  [Introduction](#introduction)
2.  [Technology Stack](#technology-stack)
3.  [Environment Configuration](#environment-configuration)
4.  [Project Structure](#project-structure)
5.  [System Architecture](#system-architecture)
    * [Architectural Patterns](#architectural-patterns)
    * [API Request Lifecycle](#api-request-lifecycle)
6.  [Database Design](#database-design)
    * [Schema Migrations](#schema-migrations)
    * [Database Schema Details](#database-schema-details)
7.  [Core Functionality and Workflows](#core-functionality-and-workflows)
    * [User Authentication Workflow](#user-authentication-workflow)
    * [Organizer Application & Onboarding Workflow](#organizer-application--onboarding-workflow)
    * [Event & Ticket Type Creation Workflow](#event--ticket-type-creation-workflow)
    * [Ticket Reservation & Purchase Workflow](#ticket-reservation--purchase-workflow)
    * [Stripe Integration Mechanics](#stripe-integration-mechanics)
    * [Ticket Validation Workflow](#ticket-validation-workflow)
    * [Administrative Functions](#administrative-functions)
    * [Business Rules & Validation Logic](#business-rules--validation-logic)
8.  [API Endpoint Reference](#api-endpoint-reference)
9.  [Implementation Details](#implementation-details)
    * [Authentication & Authorization Middleware Implementation](#authentication--authorization-middleware-implementation)
    * [Error Handling Implementation](#error-handling-implementation)
    * [Configuration Management Implementation](#configuration-management-implementation)
    * [Database Interaction Implementation (Drizzle ORM)](#database-interaction-implementation-drizzle-orm)
    * [Caching & Locking Implementation (Redis)](#caching--locking-implementation-redis)
    * [External Service Integration Implementation](#external-service-integration-implementation)
    * [Utility Functions](#utility-functions)
    * [Supporting Scripts](#supporting-scripts)
10. [Overall Commentary](#overall-commentary)
11. [Getting Started](#getting-started)

---

## 1. Introduction

This document provides definitive documentation for the Event App API, the backend service component of the Event App platform. It presents a factual account of the API's architecture, the selected technologies, the database schema, core business logic, system workflows, configuration requirements, and endpoint specifications, derived solely from the codebase. Context from interactions with the corresponding client application is incorporated where verifiable to illustrate API usage. This API serves as the central nervous system for the platform, managing user authentication, organization data, event and ticket creation, Stripe-based ticket purchasing, ticket validation processes, and administrative operations. It is intended as the ultimate source of truth for understanding the backend system.

---

## 2. Technology Stack

The construction of this API leverages a curated set of technologies, chosen deliberately to balance performance requirements, developer experience, type safety, and integration capabilities. The foundation rests on **Node.js**, utilizing its efficient non-blocking I/O model, which is well-suited for building responsive and scalable network applications like this API.

Layered on top of Node.js is **Fastify**, selected as the web framework primarily for its renowned focus on high performance and minimal overhead. In an environment where API responsiveness directly impacts user experience, Fastify's speed provides a distinct advantage over some alternative Node.js frameworks. Furthermore, its plugin-based architecture naturally lends itself to organizing the codebase into logical modules, contributing to maintainability and aligning well with the project's overall structure. Integration with standard web requirements like CORS is handled via Fastify plugins.

**TypeScript** is employed throughout the entire codebase, a decision driven by the significant benefits it offers in terms of code quality and long-term maintainability. By introducing static typing, TypeScript enables the detection of many common errors during development (compile-time) rather than at runtime, leading to more robust software. This strict typing extends to database interactions through the chosen ORM, providing end-to-end type safety.

For data persistence, **PostgreSQL** serves as the relational database management system. Its reputation for reliability, data integrity (ACID compliance), and a rich feature set makes it a solid choice for storing the application's core data, including user profiles, events, organizations, and tickets. The standard `pg` Node.js driver facilitates the connection between the application and the database instance.

Interaction with PostgreSQL is managed via **Drizzle ORM**. The choice of Drizzle is strongly linked to its TypeScript-first philosophy, ensuring seamless integration with the project's primary language. This provides compile-time checks for database queries and result handling, significantly reducing the likelihood of type-related database errors. Drizzle's query builder syntax remains close to SQL while offering the benefits of TypeScript integration. Schema management and evolution are handled systematically using the companion `drizzle-kit` tool, which generates and manages SQL migration files, ensuring consistent schema deployment across environments.

Authentication workflows involve **Supabase Auth**, but its role is strategically limited. Supabase is primarily utilized for its convenient and secure email-based OTP sending and verification capabilities during the initial user login or registration phase. Once Supabase successfully verifies an OTP, it issues a standard JWT. A key architectural decision is that the API then verifies these JWTs *locally* in subsequent requests using the standard `jsonwebtoken` library and a shared secret. This local verification approach significantly enhances the performance and resilience of authenticated endpoints by minimizing external dependencies after the initial sign-in.

Payment processing and organizer financial onboarding are delegated entirely to **Stripe**. This leverages Stripe's robust infrastructure for handling sensitive payment data, ensuring PCI compliance, and managing complex flows like Stripe Connect (for onboarding organizers to receive payouts) and Stripe Checkout (for secure customer payments). The integration uses the Stripe Node.js SDK. Asynchronous events, such as payment completion or changes in an organizer's connected account status, are communicated back to the API via Stripe Webhooks, ensuring the application state remains synchronized with payment and account realities.

**Redis** is employed as an in-memory data store, fulfilling two key roles based on the code. Its primary and most critical function is providing a mechanism for distributed locking during the ticket reservation process. To address the challenge of preventing race conditions during concurrent ticket reservation attempts, Redis's atomic `SET` command with conditional (`NX`) and expiration (`PX`) options provides an efficient and reliable mechanism, ensuring inventory accuracy during these high-contention operations. The configured lock duration adds fault tolerance by preventing locks from being held indefinitely if a process fails. Secondly, Redis is used as a cache for certain frequently accessed but less frequently changing data, specifically administrative dashboard statistics and organization analytics, reducing database load for these specific queries.

Data validation throughout the API, from incoming request bodies and parameters to environment variables, is handled by **Zod**. This TypeScript-first schema declaration library allows for declarative definition of complex data structures and validation rules concisely. Its integration directly into the Fastify routing layer ensures data integrity at the API boundaries, catching invalid data early in the request lifecycle.

For sending transactional emails, such as confirmation messages for organizer approvals or ticket purchases, **Resend** is utilized via its official SDK, abstracted through a simple utility function. **pino** provides efficient, structured logging capabilities, crucial for monitoring and debugging, with `pino-pretty` available to enhance readability during development. Environment variable management is streamlined by **zennv**, which uses Zod schemas to load, parse, and validate required configuration at startup.

---

## 3. Environment Configuration

The API's operational parameters and connectivity settings are defined exclusively through environment variables. The `zennv` library and a Zod schema in `src/config/env.ts` load, validate, and type these variables at application startup. Missing or invalid required configuration prevents the application from starting.

The essential environment variables defined in the schema (`src/config/env.ts`) are:

* `PORT`: TCP port for the API server (defaults to 3000).
* `HOST`: Network host the API server binds to (defaults to 'localhost').
* `LOG_LEVEL`: Logging verbosity (defaults to 'info').
* `DB_URL`: **Required.** The connection string for the PostgreSQL database.
* `FRONTEND_URL`: Base URL of the client application (defaults to 'http://localhost:3000').
* `SUPABASE_URL`: **Required.** The URL of the associated Supabase project.
* `SUPABASE_ANON_KEY`: Public anonymous key for the Supabase project (defaults to '', requires value).
* `SUPERADMIN_EMAIL`: Optional email for initializing the first admin user.
* `STRIPE_SECRET_KEY`: **Required.** The Stripe API secret key.
* `STRIPE_PUBLISHABLE_KEY`: **Required.** The Stripe publishable API key.
* `STRIPE_WEBHOOK_SECRET`: **Required.** Secret for verifying Stripe webhooks.
* `JWT_SECRET`: **Required.** Critical secret key for local JWT verification (must match Supabase).
* `REDIS_URL`: Connection string for Redis (defaults to 'redis://localhost:6379').
* `REDIS_TICKET_LOCK_DURATION`: TTL in seconds for Redis ticket locks (defaults to 600).
* `API_URL`: **Required.** Public base URL of this API service.
* `RESEND_API_KEY`: **Required.** API key for Resend.
* `EMAIL_FROM`: Sender email address for Resend (defaults to 'notifications@eventapp.io').

The `docker-compose.yml` file facilitates local development by defining containerized PostgreSQL and Redis services. `drizzle.config.ts` configures the Drizzle Kit migration tool. `tsconfig.json` dictates TypeScript compiler settings.

---

## 4. Project Structure

The API codebase employs a modular structure within the `src` directory.

* `src/`: Root source code directory.
    * `config/`: Environment variable logic (`env.ts`).
    * `db/`: Database files (`schema.ts`, `index.ts`, `postgres/` initialization scripts).
    * `middleware/`: Custom middleware, including `auth.ts`.
    * `modules/`: Core feature modules (e.g., `users`, `events`, `tickets`, `stripe`), each typically containing `*.routes.ts`, `*.controllers.ts`, `*.services.ts`, `*.schema.ts` files.
    * `scripts/`: Standalone scripts (e.g., `seed/`, `migrate-events-categories.ts`).
    * `services/`: Clients for external services (e.g., `supabase/`).
    * `types/`: Shared TypeScript definitions (`fastify.d.ts`).
    * `utils/`: Common utilities (`email.ts`, `errors.ts`, `logger.ts`, `redis.ts`, `server.ts`).
    * `main.ts`: Application entry point: initializes Fastify, registers plugins/middleware, mounts routes, runs migrations, starts server.
* `drizzle/`: Stores SQL migration files generated by `drizzle-kit`.
* `docker-compose.yml`: Docker configuration for local development environment.
* `drizzle.config.ts`: Configuration for `drizzle-kit`.
* `package.json`: Project manifest (dependencies, scripts).
* `tsconfig.json`: TypeScript compiler configuration.

---

## 5. System Architecture

### Architectural Patterns

The API is architected as a **Modular Monolith**. This choice provides the operational simplicity of a single deployment unit while enforcing internal boundaries and separation of concerns through distinct feature modules located under `src/modules`. This modularity enhances maintainability and developer understanding compared to a traditional, undifferentiated monolith, without introducing the complexities of a microservices setup.

Within these modules, a **Controller-Service** layered pattern is consistently applied. This pattern promotes a clear separation of responsibilities. The **Route** definitions handle HTTP protocol specifics, request/response mapping, and input validation schema definition. **Controllers** act as orchestrators, receiving validated input, invoking appropriate business logic within services, and preparing the final HTTP response. The **Service** layer encapsulates the core domain logic, data manipulation rules, database interactions, and communication with external systems, remaining independent of the HTTP transport layer. This structure enhances testability and allows business logic to evolve independently of the API's public interface.

### API Request Lifecycle

The journey of an authenticated API request through the system follows a well-defined sequence of steps, ensuring validation, authorization, and proper execution. When a request hits a protected endpoint:

1.  **Reception & Core Middleware:** The Fastify server accepts the incoming request. Essential middleware, such as CORS handling, processes the request first.
2.  **Route Resolution:** Fastify's efficient router matches the request's method and URL path against the defined routes within the various modules to identify the specific handler configuration.
3.  **Input Validation:** Before executing any application logic, the Zod schema defined for the matched route is automatically applied to validate the request's parameters, query string, and body. If the input data does not conform to the schema, a validation error is triggered, and the centralized error handler immediately sends a 400 Bad Request response.
4.  **Authentication:** The primary authentication middleware executes. It extracts the JWT from the `Authorization` header and performs local signature verification using the `jsonwebtoken` library against the shared `JWT_SECRET`. Upon successful verification, it decodes the token and fetches the corresponding user record from the database based on the email claim within the token. This complete user object is then attached to the request context (`request.user`). Failure at any stage (missing token, invalid signature, user not found) results in a 401 Unauthorized response.
5.  **Authorization:** Following successful authentication, if the route requires specific permissions, a dedicated role-checking middleware executes. This middleware examines the `role` attribute attached to the request context (`request.user.role`). It implements logic granting access if the user is an administrator or if their role matches one of the roles explicitly permitted for that endpoint. Insufficient permissions result in a 403 Forbidden response.
6.  **Controller Logic:** Control passes to the designated controller function associated with the route. The controller receives the validated request data and the authenticated user context.
7.  **Service Execution:** The controller delegates the primary task to the appropriate method within the service layer. This service method encapsulates the core business logic. It performs necessary checks, interacts with the PostgreSQL database using the Drizzle ORM client (potentially initiating transactions for atomicity), communicates with Redis for tasks like acquiring or releasing locks, or makes calls to external APIs like Stripe or Resend.
8.  **Result Return:** Upon successful completion, the service method returns its results back to the controller.
9.  **Response Formulation:** The controller takes the service result, formats it into the final JSON payload according to the API contract, and instructs Fastify to send the HTTP response back to the originating client with an appropriate success status code.
10. **Global Error Handling:** If an error occurs at any stage after the initial schema validation, the global error handling function intercepts it. It performs logging for diagnostic purposes and then constructs a standardized JSON error response, using the appropriate status code and message based on the error type, ensuring consistent error reporting across the API.

---

## 6. Database Design

### Schema Migrations

Database schema changes are managed by Drizzle ORM and `drizzle-kit`. Migration SQL files reside in `drizzle/migrations/`. Key schema evolutions include initial setup (`0000_tired_alice.sql`), adding ticket validation fields (`0001_jittery_shadowcat.sql`), adding category icons (`0002_remarkable_zaran.sql`), adding `categoryId` foreign key to events (`0003_shiny_spitfire.sql`), adding user status (`0004_high_roughhouse.sql`), adding seeding audit table (`0005_large_ravenous.sql`), adding indexes (`0006_flashy_angel.sql`), and removing a unique constraint (`0007_nosy_mad_thinker.sql`). Migrations are applied automatically on application startup by code within `src/main.ts` using Drizzle's built-in migrator functionality. New migrations are generated during development using the `npm run migration:generate` script.

### Database Schema Details

The canonical definition of the PostgreSQL schema resides in `src/db/schema.ts`, expressed using Drizzle ORM's TypeScript syntax. The `uuid-ossp` extension is enabled via `extension.sql` for `defaultRandom()` UUID generation.

**Design Conventions:**

* **Primary Keys:** All tables use UUIDs (`uuid`) as primary keys, generated by `gen_random_uuid()`.
* **Timestamps:** Standardized on `timestamp with time zone` (`timestamp` type in Drizzle schema).
* **Monetary Values:** Prices are stored as integers representing cents (e.g., `tickets.price`).

**Table Definitions (from `src/db/schema.ts`):**

#### `users`
Stores registered user profiles.
* `id`: `uuid` (PK, defaultRandom)
* `email`: `text` (unique, not null) - Indexed.
* `firstName`: `text` (not null)
* `lastName`: `text` (not null)
* `dateOfBirth`: `timestamp` (not null)
* `country`: `text` (not null)
* `supabaseUserId`: `text` (unique) - Identifier from Supabase Auth.
* `role`: `userRolesEnum` ('user', 'organizer', 'admin') (not null, default 'user').
* `status`: `userStatusEnum` ('active', 'inactive', 'banned') (not null, default 'active').
* `verified`: `boolean` (not null, default false).
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `categories`
Defines event categories.
* `id`: `uuid` (PK, defaultRandom)
* `name`: `text` (not null)
* `icon`: `text` (default 'Globe') - Maps to `VALID_ICONS` list.
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `events`
Stores details for individual events.
* `id`: `uuid` (PK, defaultRandom)
* `title`: `text` (not null)
* `description`: `text` (nullable)
* `startTimestamp`: `timestamp` (not null)
* `endTimestamp`: `timestamp` (not null)
* `venue`: `text` (nullable)
* `address`: `text` (nullable)
* `categoryId`: `uuid` (not null, FK references `categories.id`) - Indexed.
* `category`: `text` (nullable) - **Legacy Field:** Superseded by `categoryId`.
* `isOnline`: `boolean` (default false)
* `capacity`: `integer` (not null)
* `coverImage`: `text` (nullable)
* `organizationId`: `uuid` (not null, FK references `organizations.id`, cascade delete) - Indexed.
* `status`: `eventStatusEnum` ('draft', 'published', 'cancelled') (default 'draft') - Indexed.
* `createdAt`: `timestamp` (default now) - Indexed.
* `updatedAt`: `timestamp` (default now)

#### `organizations`
Represents entities approved to host events.
* `id`: `uuid` (PK, defaultRandom)
* `ownerId`: `uuid` (not null, FK references `users.id`) - Indexed.
* `name`: `text` (not null)
* `organizationType`: `organizationTypeEnum` ('company', 'individual', 'non_profit') (not null)
* `description`: `text` (not null)
* `website`: `text` (nullable)
* `logoUrl`: `text` (nullable)
* `socialLinks`: `text` (nullable) - Stores JSON string.
* `phoneNumber`: `text` (nullable)
* `eventTypes`: `text` (not null) - Stores JSON array.
* `address`: `text` (not null)
* `country`: `text` (not null)
* `stripeAccountId`: `text` (unique) - Stripe Connect account ID.
* `stripeAccountStatus`: `text` (default 'pending') - ('pending', 'active', 'inactive').
* `stripeAccountCreatedAt`: `timestamp` (nullable)
* `stripeAccountUpdatedAt`: `timestamp` (nullable)
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `ticketTypes`
Defines templates for tickets associated with an event.
* `id`: `uuid` (PK, defaultRandom)
* `name`: `text` (not null)
* `description`: `text` (nullable)
* `price`: `integer` (not null) - Price in cents.
* `quantity`: `integer` (not null)
* `type`: `ticketTypeEnum` ('paid', 'free') (not null)
* `saleStart`: `timestamp` (not null)
* `saleEnd`: `timestamp` (not null)
* `maxPerOrder`: `integer` (nullable)
* `minPerOrder`: `integer` (nullable)
* `eventId`: `uuid` (not null, FK references `events.id`, cascade delete) - Indexed.
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `tickets`
Represents individual admission tickets.
* `id`: `uuid` (PK, defaultRandom) - Used for validation/check-in.
* `eventId`: `uuid` (not null, FK references `events.id`, cascade delete) - Indexed.
* `ticketTypeId`: `uuid` (not null, FK references `ticketTypes.id`, cascade delete) - Indexed.
* `name`: `text` (not null)
* `price`: `integer` (not null) - Price in cents.
* `currency`: `text` (not null, default 'usd')
* `status`: `text` (not null, default 'available') - Lifecycle state ('available', 'reserved', 'booked'). Indexed.
* `userId`: `uuid` (nullable, FK references `users.id`) - Ticket owner.
* `accessToken`: `uuid` (nullable) - Token for validation access.
* `isValidated`: `boolean` (not null, default false) - Check-in status.
* `reservedAt`: `timestamp` (nullable) - **Legacy Field:** Superseded by Redis locking.
* `bookedAt`: `timestamp` (nullable) - Purchase timestamp.
* `validatedAt`: `timestamp` (nullable) - Check-in timestamp.
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `orders`
Represents a single purchase transaction.
* `id`: `uuid` (PK, defaultRandom)
* `userId`: `uuid` (not null, FK references `users.id`) - Indexed.
* `stripeCheckoutSessionId`: `text` (nullable)
* `stripePaymentIntentId`: `text` (nullable)
* `eventId`: `uuid` (not null, FK references `events.id`) - Indexed.
* `status`: `orderStatusEnum` ('pending', 'completed', 'failed', 'cancelled') (default 'pending') - Indexed.
* `createdAt`: `timestamp` (default now) - Indexed.
* `updatedAt`: `timestamp` (default now)

#### `orderItems`
Links tickets to orders.
* `id`: `uuid` (PK, defaultRandom)
* `orderId`: `uuid` (not null, FK references `orders.id`, cascade delete)
* `ticketId`: `uuid` (not null, FK references `tickets.id`, cascade delete)
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `platformConfigurations`
Singleton table for global settings.
* `id`: `uuid` (PK, defaultRandom)
* `key`: `platformConfigurationsEnum` ('platform_name', 'platform_fee') (not null) - Unique index.
* `value`: `text` (not null)
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `organizerApplications`
Tracks user requests to become organizers.
* `id`: `uuid` (PK, defaultRandom)
* `userId`: `uuid` (not null, FK references `users.id`)
* `organizationName`: `text` (not null)
* `organizationType`: `organizationTypeEnum` (not null)
* `description`: `text` (not null)
* `experience`: `text` (not null)
* `website`: `text` (nullable)
* `logoUrl`: `text` (nullable)
* `socialLinks`: `text` (nullable) - Stores JSON string.
* `phoneNumber`: `text` (nullable)
* `eventTypes`: `text` (not null) - Stores JSON array.
* `address`: `text` (not null)
* `country`: `text` (not null)
* `status`: `text` (not null, default 'pending') - ('pending', 'approved', 'rejected').
* `rejectionReason`: `text` (nullable)
* `approvedBy`: `uuid` (nullable, FK references `users.id`).
* `approvedAt`: `timestamp` (nullable)
* `createdAt`: `timestamp` (default now)
* `updatedAt`: `timestamp` (default now)

#### `seedingAudit`
Tracks database seeding operations.
* `id`: `uuid` (PK, defaultRandom)
* `batchId`: `uuid` (not null)
* `operation`: `text` (not null)
* `entityType`: `text` (not null)
* `entityIds`: `text` (not null) - Stores JSON array of created IDs.
* `metadata`: `text` (nullable)
* `status`: `text` (not null)
* `errorMessage`: `text` (nullable)
* `createdAt`: `timestamp` (default now)
* `createdBy`: `text` (nullable)

---

## 7. Core Functionality and Workflows

The API implements essential workflows involving database operations, business logic, and external services. The core implementation logic resides within the service layer files within each module.

### User Authentication Workflow

The authentication process is designed around email OTP verification, facilitated initially by Supabase, followed by local session management using JWTs. A user begins by submitting their email via the client application, triggering an API call to request an OTP. The backend service validates the email and uses the Supabase client library to initiate the OTP send process. Supabase then emails the code directly to the user.

Once the user enters the received OTP, the client sends the email and OTP to the API for verification. The backend service handles this verification step. A distinct flow exists for seeded test users (identifiable by a specific pattern in their database identifier) using a predefined OTP ("000000"). For these test users, Supabase verification is bypassed entirely; the backend retrieves user details locally and generates internal access and refresh JWTs using the `jsonwebtoken` library, signed with the shared secret. For regular users, the backend calls the Supabase client library to verify the provided email and OTP combination.

Upon successful verification, the backend ensures a corresponding user record exists in its local PostgreSQL database, creating one with a default role if it's the user's first login. The service then returns the appropriate tokens (either the internally generated pair or the access and refresh tokens provided by Supabase) to the client application.

The client application stores these tokens. Subsequent requests to protected API endpoints must include the access token in the `Authorization` header. The API's authentication middleware intercepts these requests, verifies the token's validity locally using the `jsonwebtoken` library and the shared secret, fetches the associated user data from the database, and attaches it to the request context. Token refresh is handled via a dedicated endpoint, which differentiates between internal refresh logic for seeded user tokens and using Supabase's functionality for regular user tokens. Registration follows a similar OTP flow, and OTP resend endpoints are also available.

### Organizer Application & Onboarding Workflow

Becoming an organizer involves a formal application and review procedure, followed by mandatory Stripe Connect onboarding. A standard user submits an application containing details about their proposed organization through a specific API endpoint. The backend service layer records this information in the database with a 'pending' status, ensuring users cannot have multiple active applications via database constraints or service logic checks. A confirmation email is sent upon submission.

Platform administrators review these pending applications, typically through a dedicated interface that retrieves application data from the API. To approve an application, an administrator interacts with an endpoint triggering the relevant service method. This method executes several steps within a single database transaction: it updates the application record's status to 'approved', records the admin's ID and timestamp, creates a new corresponding record in the `organizations` table (linking to the applicant, setting initial Stripe status to 'pending'), updates the applicant's user role to 'ORGANIZER', and dispatches an approval email. If the application is rejected, the service updates the status, records the provided rejection reason, and sends a rejection email.

Once granted the 'ORGANIZER' role, the user must connect their Stripe account. The client application typically prompts for this if the organization's Stripe status is not 'active'. The onboarding process is initiated via an API call that invokes the Stripe integration service. This service ensures a Stripe Connect account ID exists for the organization, creating a new Stripe Standard connected account via the Stripe API if necessary and storing the ID. It then generates a unique, single-use onboarding link using the Stripe API, providing configured return and refresh URLs. This link is returned to the client, which redirects the organizer to Stripe's secure onboarding interface.

Changes to the connected account's status are communicated back asynchronously via Stripe `account.updated` webhooks. The API's webhook handler verifies the event signature and passes the event data to the appropriate service logic. This logic inspects the account details within the webhook payload (checking `details_submitted` and `charges_enabled`) to determine the account's operational status and updates the Stripe status field in the local `organizations` database record accordingly.

### Event & Ticket Type Creation Workflow

Authenticated organizers create and manage events hosted by their organization. The process starts when an organizer submits event details through the client application, triggering a `POST` request to the events endpoint. The controller identifies the organizer's associated organization ID from the authenticated user context. This ID and request data are passed to the event creation service. The service validates the input (required fields, category existence, logical start/end times) and inserts a new record into the `events` table.

After event creation, the organizer defines ticket types via `POST` requests to a nested endpoint (e.g., `/events/:eventId/ticket-types`). The request specifies the parent event ID and ticket type details (name, price in cents, quantity, sales dates). The controller verifies event ownership before invoking the ticket type creation service. This service validates quantity against event capacity and configured limits, checks sale dates, validates min/max per order constraints, converts price to cents, inserts into the `ticketTypes` table, and triggers the creation of the specified quantity of individual placeholder records in the `tickets` table, initially marked 'available'.

Events are created as 'draft' by default. The organizer publishes an event using an update endpoint, setting the `status` field to 'published'. The corresponding service method handles this update after verifying ownership, making the event publicly visible.

### Ticket Reservation & Purchase Workflow

Acquiring tickets involves temporary reservation using Redis locking followed by confirmation (free tickets) or payment (paid tickets). When a user initiates reservation via an API call specifying event and ticket quantities, the backend reservation service first identifies potentially available individual tickets ('available' status in DB). It then checks Redis to filter out any tickets already locked by other concurrent reservations. If sufficient truly available tickets remain, the service attempts to acquire exclusive Redis locks for each required ticket ID, associating them with the requesting user's ID and setting an expiration based on the configured TTL (default 600 seconds). The atomicity of the Redis command prevents overselling. Success returns reservation details; failure (if a lock cannot be acquired) triggers release of any partially acquired locks for that request and returns a conflict error. If a reservation lock expires before purchase, the API takes no further action, requiring the user to restart the process.

Following successful reservation, the flow differs:
* **Free Tickets:** The client confirms the acquisition via a dedicated API call. The backend service executes within a DB transaction: creates a 'completed' `orders` record, creates `orderItems` linking the reserved tickets, releases the Redis locks, updates `tickets` status to 'booked', assigns the `userId`, records `bookedAt`, and generates a unique validation `accessToken` for each ticket.
* **Paid Tickets:** The client initiates payment, triggering an API call. The backend service first verifies the organizer's Stripe account is 'active'. If so, it creates a *pending* `orders` record and associated `orderItems` within a DB transaction. It then calculates the total amount and platform fee, and invokes the Stripe API to create a Checkout Session configured for Direct Charges (passing line items, platform fee, organizer's Stripe destination account ID, and metadata including internal order/user/ticket IDs). The pending `orders` record is updated with the Stripe session/payment intent IDs, and the Checkout URL is returned to the client. The user pays via Stripe. Successful payment triggers a `payment_intent.succeeded` webhook. The API's webhook handler verifies the signature and triggers the payment completion service logic. This logic, within a transaction, finds the order, updates its status to 'completed', releases the relevant Redis locks, and updates the associated `tickets` records to 'booked', assigning `userId`, `bookedAt`, and generating `accessToken`s. Payment failure triggers a different webhook, leading to lock release and setting the order status to 'failed'.

### Stripe Integration Mechanics

Stripe integration facilitates payments and organizer payouts:
* **Connect:** Onboards organizers using Stripe Standard accounts, created and managed via API calls during the onboarding flow initiated by the organizer. Account status is tracked locally, updated via `account.updated` webhooks.
* **Checkout:** Provides the secure payment interface for users purchasing paid tickets. The API creates Checkout Sessions using the Direct Charges model, automatically handling platform fee deduction and fund transfer to the organizer's connected account upon successful payment.
* **Webhooks:** A single endpoint receives asynchronous events from Stripe, secured by signature verification. Key handled events are `account.updated` (for Connect status), `checkout.session.completed` (links payment intent to order), `payment_intent.succeeded` (triggers finalization of successful purchases), and `payment_intent.payment_failed` (triggers failure handling). Refund/dispute events are not handled.

### Ticket Validation Workflow

This workflow verifies ticket authenticity at event entry. After purchase, a booked ticket has an associated unique `accessToken` stored in the database. The client application retrieves this token for a user's owned ticket via a dedicated, authenticated endpoint. This token is then typically encoded in a QR code or used directly in validation requests. A public API endpoint allows checking a ticket's validity and details by providing the event ID, ticket ID, and the correct `accessToken` as a query parameter. For actual check-in, authorized event staff use a separate, protected `POST` endpoint, submitting the event ID, ticket ID, and the `accessToken` (read from the QR code/user) in the request body. The backend service first verifies the token against the stored value for the specified ticket. If valid and the ticket has not already been marked as validated, it performs an authorization check to ensure the staff member has permission for the event's organization. If all checks pass, the service updates the ticket record in the database, marking it as validated and recording the timestamp.

### Administrative Functions

Users with the 'ADMIN' role have privileged access to manage the platform via specific API endpoints, primarily under `/api/admin`, requiring appropriate role authorization. Key administrative capabilities include full management of users (list, view, update role/status, delete, view stats), oversight and processing (approve/reject) of organizer applications, management of global event categories (create, update, delete), modification of platform configuration settings, and access to aggregated platform analytics and reports, often leveraging Redis caching for performance.

### Business Rules & Validation Logic

Data integrity and operational consistency are maintained through:
* **Schema Validation:** Zod schemas integrated with Fastify routes enforce strict validation of incoming request data types, formats, and constraints.
* **Authentication & Authorization:** Middleware ensures valid JWT sessions and enforces role-based permissions using a custom role checker; service-level functions verify resource ownership or specific permissions.
* **Database Constraints:** PostgreSQL constraints (`UNIQUE`, `NOT NULL`, foreign keys) prevent invalid data states at the storage level.
* **Service-Level Logic:** Core rules are implemented in services, such as checking organizer Stripe status before payment initiation, validating ticket quantities against event capacity, using Redis locking for reservation concurrency control, preventing duplicate pending applications, and validating category icon inputs.
* **Atomicity:** Critical multi-step database operations are wrapped in transactions to ensure they succeed or fail as a single unit.

---

## 8. API Endpoint Reference

*(Endpoint list derived from `src/modules/*/*.routes.ts`. Authorization reflects use of `authenticateRequest` and `checkRole` preHandlers/hooks. Service-level checks may apply further restrictions.)*

### User Authentication (`/api/users`)

* **`POST /register`**: Register new user, sends OTP. (Auth: None)
* **`POST /verifyRegistration`**: Verify registration OTP. (Auth: None)
* **`POST /resendRegistrationOTP`**: Resend registration OTP. (Auth: None)
* **`POST /login`**: Initiate login, sends OTP (or bypasses for seeded). (Auth: None)
* **`POST /verifyLogin`**: Verify login OTP, returns tokens. (Auth: None)
* **`POST /resendLoginOTP`**: Resend login OTP. (Auth: None)
* **`POST /refresh-token`**: Refresh session using refresh token. (Auth: None)

### User Profile (`/api/users`)

* **`GET /me`**: Retrieves authenticated user's profile. (Auth: `authenticateRequest`)

### Organizations (`/api/organizations`)

* **`GET /`**: Get all organizations. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`GET /me`**: Get authenticated user's organization. (Auth: `authenticateRequest`)
* **`GET /me/analytics`**: Get analytics for user's organization. (Auth: `authenticateRequest`)
* **`GET /:id`**: Retrieves specific organization details. (Auth: `authenticateRequest`)
* **`GET /:id/analytics`**: Get analytics for specific organization. (Auth: `authenticateRequest`)
* **`PATCH /:id`**: Updates organization details. (Auth: `authenticateRequest`)

### Organizer Applications (`/api/organizer-applications`)

* **`POST /`**: Submits application to become organizer. (Auth: `authenticateRequest`)
* **`GET /me`**: Retrieves authenticated user's application status. (Auth: `authenticateRequest`)
* **`GET /`**: Lists applications. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`GET /:id`**: Retrieves specific application. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`PATCH /:id/status`**: Approves/rejects application. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`GET /stats/pending`**: Get pending application stats. (Auth: `authenticateRequest`, `checkRole(['admin'])`)

### Categories (`/api/categories`)

* **`POST /`**: Creates a new category. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`GET /`**: Retrieves list of all categories. (Auth: None)
* **`GET /:id`**: Retrieves specific category. (Auth: None)
* **`PUT /:id`**: Updates a category. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`DELETE /:id`**: Deletes a category. (Auth: `authenticateRequest`, `checkRole(['admin'])`)

### Events (`/api/events`)

* **`GET /`**: Retrieves published events (filterable). (Auth: None)
* **`GET /:id`**: Retrieves specific event details. (Auth: None)
* **`GET /my`**: Get organizer's events. (Auth: `authenticateRequest` hook)
* **`POST /`**: Creates a new event. (Auth: `authenticateRequest` hook)
* **`PATCH /:id`**: Updates an existing event. (Auth: `authenticateRequest` hook)
* **`DELETE /:id`**: Deletes an event. (Auth: `authenticateRequest` hook)
* **`PATCH /:id/status`**: Update event publish status. (Auth: `authenticateRequest` hook)
* **`GET /:id/analytics`**: Get event analytics. (Auth: `authenticateRequest` hook)
* **`POST /:eventId/ticket-types`**: Creates a new ticket type. (Auth: `authenticateRequest` hook)
* **`PATCH /:eventId/ticket-types/:ticketTypeId`**: Updates a ticket type. (Auth: `authenticateRequest` hook)

### Tickets (`/api/tickets`)

* **`GET /events/:eventId/validate/:ticketId`**: Verify ticket validity via access token query param. (Auth: None)
* **`GET /events/:eventId/tickets/:ticketId/details`**: Get public ticket details. (Auth: None)
* **`POST /`**: Create individual tickets (internal use likely). (Auth: `authenticateRequest` hook)
* **`PATCH /:ticketId/status`**: Update ticket status directly (internal use likely). (Auth: `authenticateRequest` hook)
* **`GET /events/:eventId/ticket-types/:ticketTypeId`**: Get available tickets for a type. (Auth: `authenticateRequest` hook)
* **`GET /my`**: Get authenticated user's tickets. (Auth: `authenticateRequest` hook)
* **`POST /reserve`**: Attempts Redis lock reservation for tickets. (Auth: `authenticateRequest` hook)
* **`POST /purchase`**: Purchase reserved tickets. (Auth: `authenticateRequest` hook)
* **`GET /events/:eventId/tickets/:ticketId/access-token`**: Get access token for an owned ticket. (Auth: `authenticateRequest` hook)
* **`POST /events/:eventId/validate/:ticketId`**: Validate ticket via access token in body (Organizer/Admin). (Auth: `authenticateRequest` hook)
* **`POST /release-reservations`**: Release user's Redis ticket reservations. (Auth: `authenticateRequest` hook)

### Stripe Integration (`/api/stripe`)

* **`POST /connect`**: Generates Stripe Connect onboarding link. (Auth: `authenticateRequest`, `checkRole(['organizer'])`)
* **`GET /onboard/complete/:organizationId`**: Action after returning from Stripe. (Auth: `authenticateRequest`, `checkRole(['organizer'])`)
* **`GET /onboard/refresh/:organizationId`**: Refresh Stripe onboarding link. (Auth: `authenticateRequest`, `checkRole(['organizer'])`)
* **`PATCH /status`**: Update Stripe account status manually. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`POST /webhook`**: Receives Stripe webhooks (signature verified). (Auth: None)

### Platform Configuration (`/api/platform-configurations`)

* **`POST /`**: Create config entry. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`PATCH /:key`**: Update config entry by key. (Auth: `authenticateRequest`, `checkRole(['admin'])`)
* **`GET /`**: Get all config entries. (Auth: `authenticateRequest`)
* **`GET /:key`**: Get config entry by key. (Auth: `authenticateRequest`)
* **`DELETE /:key`**: Delete config entry by key. (Auth: `authenticateRequest`, `checkRole(['admin'])`)

### Admin (`/api/admin`)

*(All routes require `authenticateRequest` and `checkRole(['admin'])` via preHandler)*
* **`GET /dashboard/stats`**: Get dashboard stats.
* **`GET /dashboard/users/monthly`**: Get monthly user stats.
* **`GET /users`**: Get all users.
* **`GET /users/:id`**: Get user by ID.
* **`PUT /users/:id`**: Update user by ID.
* **`DELETE /users/:id`**: Delete user by ID.
* **`GET /users/:id/stats`**: Get specific user stats.
* **`GET /users/:id/events`**: Get specific user's events.
* **`GET /users/:id/transactions`**: Get specific user's transactions.
* **`GET /reports/revenue`**: Get monthly revenue report.
* **`GET /reports/users/growth`**: Get user growth report.
* **`GET /reports/events/statistics`**: Get event statistics report.

---

## 9. Implementation Details

This section provides a factual description of key implementation aspects based on code analysis, avoiding excessive references to specific internal function names for better readability.

### Authentication & Authorization Middleware Implementation

The system employs custom middleware for security. The primary authentication middleware extracts the JWT from the `Authorization` header and verifies its signature locally against the configured shared secret using the `jsonwebtoken` library. Upon success, it fetches the user's full profile from the database based on the token's email claim and attaches this user object to the request context. Failures result in an unauthorized error. Following successful authentication, a separate authorization middleware function handles role checks for protected routes. This function examines the authenticated user's role. Administrators are granted broad access. For other roles, access is granted only if the user's role matches one specified in the route's configuration. Insufficient permissions lead to a forbidden error.

### Error Handling Implementation

A centralized error handling mechanism ensures consistent responses. It utilizes a hierarchy of custom error classes (e.g., `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`) that include standard HTTP status codes. A global error handler function catches all errors, including Zod validation errors and custom application errors. It logs the error details and formats a standardized JSON error response `{ success: false, error: { code, message, errors? } }`, using the appropriate status code based on the error type (400 for validation, specific codes for custom errors, 500 for unexpected issues).

### Configuration Management Implementation

Application configuration relies entirely on environment variables. At startup, the `zennv` library, guided by a Zod schema, loads and validates these variables, ensuring all required settings are present and correctly typed. This prevents runtime failures due to misconfiguration and provides type-safe access to configuration values throughout the application.

### Database Interaction Implementation (Drizzle ORM)

All PostgreSQL database interactions are managed through the Drizzle ORM, leveraging its type safety. A connection pool using `node-postgres` is established based on the database connection URL environment variable. The database schema is declaratively defined in a dedicated schema file, providing the source of truth for table structures and enabling type-safe queries. Service layer logic uses the Drizzle client instance to perform database operations (selects, inserts, updates, deletes) via a fluent query builder. Critical multi-step operations are wrapped in database transactions to ensure atomicity.

### Caching & Locking Implementation (Redis)

Redis fulfills two roles: distributed locking and caching. A Redis client instance connects using the configured URL. For ticket reservations, an atomic Redis `SET` command with `NX` (Not Exists) and `PX` (expiration) flags is used to acquire exclusive locks on individual ticket identifiers, preventing overselling during concurrent requests. The lock duration is configurable via an environment variable (defaulting to 600 seconds). Locks are explicitly released upon purchase completion but expire automatically if the TTL is reached without purchase. Redis is also used to cache results for certain administrative and organizational analytic queries, utilizing specific key prefixes and TTLs to reduce database load.

### External Service Integration Implementation

The API integrates with key third-party services via their official SDKs:
* **Supabase:** Primarily used during the initial authentication phase for sending and verifying email OTPs, and for handling token refreshes for non-test users.
* **Stripe:** Handles all aspects of payment processing and organizer financial onboarding, including creating Connect Standard accounts, generating onboarding links, creating Checkout sessions using the Direct Charge model with platform fees, and processing incoming webhook events for payment status and Connect account updates.
* **Resend:** Utilized for sending transactional emails, such as application status notifications and purchase confirmations, through an abstracted utility function.

### Utility Functions

Common functionalities are encapsulated in utility modules, including email sending abstraction, custom error definitions and handling, pino logger configuration, Redis client setup and operation helpers (locking/caching), and Fastify server setup components.

### Supporting Scripts

Standalone scripts exist for operational tasks outside the main API flow. A notable component is the database seeding mechanism, which uses a structured approach with individual seeder classes, configuration files, and a transaction manager to populate the database with realistic data for development or testing, including rollback capabilities. A one-off data migration script for handling legacy category data is also present.

---

## 10. Overall Commentary

This API constitutes the backend foundation for a functional event ticketing platform, demonstrating adherence to modern development practices through its technology choices and architectural patterns. The selection of **Fastify**, **TypeScript**, and **Drizzle ORM** creates a robust and efficient foundation, promoting performance and end-to-end type safety. The **Modular Monolith** architecture combined with a **Controller-Service** pattern offers good code organization.

Key technical decisions shape the system's behavior. The authentication strategy effectively uses **Supabase** for OTP flow while relying on local JWT verification for improved resilience and performance. A custom middleware handles role-based authorization. **Stripe** integration is well-implemented using Connect Standard accounts and the Direct Charges model for payments and payouts, supported by webhook processing for asynchronous updates. **Redis** provides essential distributed locking for ticket reservations, preventing concurrency issues, and also serves as a cache for specific analytics data. **Zod** enforces data validation rigorously at API boundaries.

The API effectively serves its corresponding frontend application, providing necessary data and operations for core features. The frontend client handles token management and interacts with API endpoints for data display, user actions, and administrative functions. Image uploads appear to be handled separately by the frontend using Supabase storage directly.

While providing core functionality, several areas present opportunities for future enhancement. Implementing more granular, resource-specific authorization beyond the existing roles could enhance security. Introducing a comprehensive automated testing suite (unit, integration, e2e) is critical for long-term stability. Scalability could be improved through advanced caching, database optimization, or asynchronous processing. Potential feature expansions include refund management, discount systems, waitlists, or more advanced analytics. Enhancing observability with structured logging or tracing and implementing API versioning would also be beneficial for production environments and future development.

In conclusion, the API represents a well-architected backend for an event ticketing platform, utilizing a modern, type-safe stack and effective third-party integrations. Its structure and implementation provide a solid base, with clear pathways identified for future enhancements in testing, scalability, feature scope, and observability.

---

## 11. Getting Started

1.  **Prerequisites:** Node.js (version specified in `package.json` `volta` field), npm (or equivalent package manager), Docker, Docker Compose.
2.  **Clone Repository:** `git clone <repository-url>`
3.  **Install Dependencies:** `cd <api-directory-name> && npm install`.
4.  **Configure Environment:** Copy `.env.example` to `.env`. Populate with valid settings (see [Environment Configuration](#environment-configuration), verify against `src/config/env.ts`).
5.  **Start Services:** `docker-compose up -d` (Starts PostgreSQL & Redis containers).
6.  **Run Application (Development):** `npm run dev`. This runs `src/main.ts` using `tsx`. Database migrations (`drizzle/migrations/`) are applied automatically on startup.
7.  **(Development Only) Generate Migrations:** Modify `src/db/schema.ts`, then run `npm run migration:generate` to create new SQL migration files. Commit these files.
8.  **(Optional) Seed Data:** `npm run seed`.
9.  **API Access:** The server runs at the host and port configured in `.env` (defaults to `http://localhost:3000` as per `src/config/env.ts`).