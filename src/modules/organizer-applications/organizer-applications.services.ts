import { eq, and, desc, gte } from 'drizzle-orm';
import { db } from '../../db';
import { organizerApplications, users, organizations } from '../../db/schema';
import {
  CreateOrganizerApplicationInput,
  UpdateOrganizerApplicationStatusInput,
} from './organizer-applications.schema';
import { logger } from '../../utils/logger';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors';
import {
  sendEmail,
  organizerApplicationTemplate,
  organizerApplicationSubmissionTemplate,
} from '../../utils/email';

export async function createOrganizerApplication(
  userId: string,
  input: CreateOrganizerApplicationInput,
) {
  try {
    logger.info(`Creating organizer application for user ${userId}`);
    logger.debug(`Application data: ${JSON.stringify(input)}`);

    // Get user email and country
    const user = await db
      .select({
        email: users.email,
        country: users.country,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]) {
      throw new NotFoundError(`User not found with ID ${userId}`);
    }

    // Transform the input to match our database schema
    const applicationData = {
      userId,
      organizationName: input.organizationName,
      organizationType: input.organizationType,
      description: input.description,
      experience: input.experience,
      website: input.website || null,
      eventTypes: JSON.stringify(input.eventTypes), // Convert array to JSON string
      phoneNumber: input.phoneNumber,
      address: input.address,
      socialLinks: JSON.stringify(input.socialLinks), // Convert object to JSON string
      country: user[0].country, // Use user's country
      status: 'pending' as const,
      logoUrl: null, // Optional field
      rejectionReason: null, // Optional field
      approvedBy: null, // Optional field
      approvedAt: null, // Optional field
    };

    const application = await db
      .insert(organizerApplications)
      .values(applicationData)
      .returning();

    // Send confirmation email
    try {
      const emailTemplate = organizerApplicationSubmissionTemplate({
        organizerName: input.organizationName,
      });

      await sendEmail({
        to: user[0].email,
        subject: 'Organizer Application Received',
        html: emailTemplate,
      });

      logger.info(`Sent application confirmation email to ${user[0].email}`);
    } catch (emailError) {
      // Log email error but don't fail the request
      logger.error(
        `Failed to send application confirmation email: ${emailError}`,
      );
    }

    // Parse JSON strings back to objects for the response
    const responseData = {
      ...application[0],
      eventTypes: JSON.parse(application[0].eventTypes),
      socialLinks: application[0].socialLinks ? JSON.parse(application[0].socialLinks) : null,
    };

    logger.info(
      `Successfully created organizer application with ID ${application[0].id}`,
    );
    return responseData;
  } catch (error) {
    logger.error(`Error creating organizer application: ${error}`);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to create organizer application');
  }
}

export async function getOrganizerApplications() {
  try {
    logger.info('Fetching all organizer applications');

    // Join with users to get applicant details and sort by createdAt in descending order
    const applications = await db
      .select({
        application: organizerApplications,
        applicant: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(organizerApplications)
      .leftJoin(users, eq(organizerApplications.userId, users.id))
      .orderBy(desc(organizerApplications.createdAt));

    logger.info(
      `Successfully fetched ${applications.length} organizer applications`,
    );
    return applications;
  } catch (error) {
    logger.error(`Error fetching organizer applications: ${error}`);
    throw new AppError(500, 'Failed to fetch organizer applications');
  }
}

export async function getOrganizerApplicationById(id: string) {
  try {
    logger.info(`Fetching organizer application with ID ${id}`);

    const applications = await db
      .select({
        application: organizerApplications,
        applicant: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(organizerApplications)
      .leftJoin(users, eq(organizerApplications.userId, users.id))
      .where(eq(organizerApplications.id, id))
      .limit(1);

    if (!applications[0]) {
      logger.warn(`No organizer application found with ID ${id}`);
      throw new NotFoundError(`Organizer application not found with ID ${id}`);
    }

    logger.info(`Successfully fetched organizer application with ID ${id}`);
    return applications[0];
  } catch (error) {
    logger.error(
      `Error fetching organizer application with ID ${id}: ${error}`,
    );
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch organizer application');
  }
}

export async function updateOrganizerApplicationStatus(
  applicationId: string,
  adminId: string,
  input: UpdateOrganizerApplicationStatusInput,
) {
  try {
    logger.info(
      `Updating organizer application ${applicationId} status to ${input.status}`,
    );
    logger.debug('Update data:', { applicationId, adminId, ...input });

    const application = await getOrganizerApplicationById(applicationId);

    if (!application) {
      throw new NotFoundError(`Application not found with ID ${applicationId}`);
    }

    if (application.application.status !== 'pending') {
      throw new ValidationError('Application has already been processed');
    }

    if (input.status === 'rejected' && !input.rejectionReason) {
      throw new ValidationError(
        'Rejection reason is required when rejecting an application',
      );
    }

    const [updatedApplication] = await db.transaction(async (tx) => {
      logger.info('Starting transaction for application status update');

      // Update application status
      const [updated] = await tx
        .update(organizerApplications)
        .set({
          status: input.status,
          approvedBy: adminId,
          approvedAt: new Date(),
          updatedAt: new Date(),
          rejectionReason: input.rejectionReason,
        })
        .where(eq(organizerApplications.id, applicationId))
        .returning();

      if (input.status === 'approved') {
        logger.info(
          `Updating user ${application.application.userId} role to organizer`,
        );
        // Update user role to organizer
        await tx
          .update(users)
          .set({
            role: 'organizer',
            updatedAt: new Date(),
          })
          .where(eq(users.id, updated.userId));

        logger.info(
          `Creating organization for user ${application.application.userId}`,
        );
        // Create organization
        await tx.insert(organizations).values({
          name: application.application.organizationName,
          ownerId: application.application.userId,
          organizationType: application.application.organizationType,
          description: application.application.description,
          website: application.application.website || undefined,
          logoUrl: undefined, // logoUrl is not in organizer application
          socialLinks: application.application.socialLinks,
          phoneNumber: application.application.phoneNumber,
          eventTypes: application.application.eventTypes,
          address: application.application.address,
          country: application.application.country,
        });
      }

      logger.info(
        `Successfully updated application ${applicationId} status to ${input.status}`,
      );
      return [updated];
    });

    // Send email notification
    try {
      if (!application.applicant || !application.applicant.email) {
        throw new Error('Applicant email not found');
      }

      const emailTemplate = organizerApplicationTemplate({
        organizerName: application.application.organizationName,
        isApproved: input.status === 'approved',
        message: input.rejectionReason || '',
      });

      await sendEmail({
        to: application.applicant.email,
        subject: `Organizer Application ${input.status === 'approved' ? 'Approved' : 'Rejected'}`,
        html: emailTemplate,
      });

      logger.info(
        `Sent application ${input.status} email to ${application.applicant.email}`,
      );
    } catch (emailError) {
      // Log email error but don't fail the request
      logger.error(
        `Failed to send application ${input.status} email: ${emailError}`,
      );
    }

    return updatedApplication;
  } catch (error) {
    logger.error(`Error updating organizer application status: ${error}`);
    logger.debug('Failed update data:', { applicationId, adminId, ...input });
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update organizer application status');
  }
}

export async function getOrganizerApplicationByUserId(userId: string) {
  try {
    logger.info(`Fetching organizer applications for user ${userId}`);

    const applications = await db
      .select()
      .from(organizerApplications)
      .where(eq(organizerApplications.userId, userId))
      .orderBy(desc(organizerApplications.createdAt));

    logger.info(
      `Successfully fetched ${applications.length} applications for user ${userId}`,
    );
    return applications;
  } catch (error) {
    logger.error(
      `Error fetching organizer applications for user ${userId}: ${error}`,
    );
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to fetch organizer applications');
  }
}

export async function checkPendingOrganizerApplicationExists(
  userId: string,
): Promise<boolean> {
  const result = await db
    .select({ id: organizerApplications.id })
    .from(organizerApplications)
    .where(and(eq(organizerApplications.userId, userId), eq(organizerApplications.status, 'pending')))
    .limit(1);

  return result.length > 0;
}

export async function getPendingApplicationsStats() {
  try {
    logger.info('Fetching pending applications statistics');

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const [totalPending, newSinceYesterday] = await Promise.all([
      // Get total pending count
      db
        .select({ id: organizerApplications.id })
        .from(organizerApplications)
        .where(eq(organizerApplications.status, 'pending'))
        .then(results => results.length),

      // Get count of applications created since yesterday
      db
        .select({ id: organizerApplications.id })
        .from(organizerApplications)
        .where(and(
          eq(organizerApplications.status, 'pending'),
          gte(organizerApplications.createdAt, yesterday)
        ))
        .then(results => results.length)
    ])

    logger.info(
      `Successfully fetched pending applications stats: total=${totalPending}, new=${newSinceYesterday}`,
    );

    return {
      total: totalPending,
      newSinceYesterday
    };
  } catch (error) {
    logger.error(`Error fetching pending applications stats: ${error}`);
    throw new AppError(500, 'Failed to fetch pending applications statistics');
  }
}
