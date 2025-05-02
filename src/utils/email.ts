import { Resend } from 'resend';
import { env } from '../config/env';

if (!env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is required');
}

const resend = new Resend(env.RESEND_API_KEY);

export interface EmailTemplate {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, subject, html }: EmailTemplate) => {
  try {
    const data = await resend.emails.send({
      from: `Event App <${env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });

    return { success: true, data };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};

export const organizerApplicationTemplate = ({
  organizerName,
  isApproved,
  message = '',
}: {
  organizerName: string;
  isApproved: boolean;
  message?: string;
}) => {
  const status = isApproved ? 'approved' : 'rejected';
  const statusColor = isApproved ? '#22c55e' : '#ef4444';
  const greeting = isApproved
    ? 'Congratulations!'
    : 'Thank you for your application';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Organizer Application ${status}</title>
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; padding: 20px; max-width: 600px; margin: 0 auto; color: #374151;">
        <div style="background-color: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <h1 style="color: ${statusColor}; margin-bottom: 24px; font-size: 24px;">${greeting}</h1>

          <p style="margin-bottom: 16px;">Dear ${organizerName},</p>

          <p style="margin-bottom: 16px;">
            We have reviewed your application to become an organizer on our platform.
            Your application has been <strong style="color: ${statusColor}">${status}</strong>.
          </p>

          ${
            !isApproved && message
              ? `
                <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                  <h3 style="color: #991b1b; margin-top: 0; margin-bottom: 8px; font-size: 16px;">Reason for Rejection:</h3>
                  <p style="color: #7f1d1d; margin: 0;">${message}</p>
                </div>
              `
              : ''
          }

          ${
            isApproved
              ? `<p style="margin-bottom: 16px;">
                  You can now start creating and managing events on our platform.
                  Log in to your account to get started.
                </p>`
              : `<p style="margin-bottom: 16px;">
                  We encourage you to review our guidelines and consider applying again in the future.
                </p>`
          }

          <p style="margin-bottom: 16px;">
            Best regards,<br>
            The Event App Team
          </p>
        </div>
      </body>
    </html>
  `;
};

export const organizerApplicationSubmissionTemplate = ({
  organizerName,
}: {
  organizerName: string;
}) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Organizer Application Received</title>
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; padding: 20px; max-width: 600px; margin: 0 auto; color: #374151;">
        <div style="background-color: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #3b82f6; margin-bottom: 24px; font-size: 24px;">Application Received</h1>

          <p style="margin-bottom: 16px;">Dear ${organizerName},</p>

          <p style="margin-bottom: 16px;">
            Thank you for applying to become an organizer on our platform. We have received your application and it is now under review.
          </p>

          <p style="margin-bottom: 16px;">
            Our team will carefully evaluate your application and you will receive another email with our decision soon.
            This process typically takes 1-2 business days.
          </p>

          <p style="margin-bottom: 16px;">
            Best regards,<br>
            The Event App Team
          </p>
        </div>
      </body>
    </html>
  `;
};

// --- New Ticket Confirmation Template ---

interface TicketInfo {
  name: string; // Ticket type name
  quantity: number;
  price?: number; // Add optional price (in cents)
}

export const ticketConfirmationTemplate = ({
  userName,
  eventName,
  eventDate,
  ticketsInfo, // Now expects [{ name: 'VIP', quantity: 2, price: 5000 }, { name: 'General', quantity: 1, price: 0 }]
  orderId,
  eventUrl,
  totalPrice,
}: {
  userName: string;
  eventName: string;
  eventDate: string;
  ticketsInfo: TicketInfo[];
  orderId: string;
  eventUrl: string;
  totalPrice?: number;
}) => {
  let ticketListHtml = ticketsInfo
    .map((t) => {
      const priceString =
        t.price !== undefined && t.price > 0
          ? `$${(t.price / 100).toFixed(2)} each`
          : 'Free';
      return `<li>${t.quantity} x ${t.name} (${priceString})</li>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Your Ticket Confirmation for ${eventName}</title>
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; padding: 20px; max-width: 600px; margin: 0 auto; color: #374151;">
        <div style="background-color: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #3b82f6; margin-bottom: 24px; font-size: 24px;">Ticket Confirmation</h1>

          <p style="margin-bottom: 16px;">Hi ${userName || 'there'},</p>

          <p style="margin-bottom: 16px;">
            Thank you for your order! You've successfully booked tickets for the event: <strong>${eventName}</strong>.
          </p>

          <p style="margin-bottom: 16px;">
            <strong>Event Date:</strong> ${eventDate}
          </p>

          <h2>Your Tickets:</h2>
          <ul>
            ${ticketListHtml}
          </ul>

          ${
            totalPrice !== undefined && totalPrice > 0
              ? `
          <p style="margin-bottom: 16px; font-weight: bold;">
            Total Amount Paid: $${(totalPrice / 100).toFixed(2)}
          </p>
          `
              : ''
          }

          <p style="margin-bottom: 16px;">
You can view your tickets and event details, including QR codes for entry, here:
          </p>
          <p style="margin-bottom: 24px;">
            <a href="${eventUrl}" style="background-color: #3b82f6; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">View My Tickets</a>
          </p>

          <p style="font-size: 12px; color: #6b7280;">Order ID: ${orderId}</p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>

          <p style="margin-bottom: 16px;">
            We look forward to seeing you there!<br>
            The Event App Team
          </p>
        </div>
      </body>
    </html>
  `;
};
