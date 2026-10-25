export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

function baseLayout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #121826;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
    }
    .header {
      padding: 32px 32px 24px;
      background: linear-gradient(180deg, #182234 0%, #121826 100%);
      border-bottom: 1px solid #1e293b;
      text-align: center;
    }
    .logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.15em;
      color: #38bdf8;
      text-transform: uppercase;
      margin: 0;
    }
    .tagline {
      font-size: 12px;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-top: 4px;
    }
    .content {
      padding: 32px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      margin-top: 0;
      margin-bottom: 16px;
      color: #cbd5e1;
    }
    .card {
      background-color: #1a2234;
      border: 1px solid #2d3748;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #2d3748;
      font-size: 14px;
    }
    .item-row:last-child {
      border-bottom: none;
      font-weight: 700;
      color: #ffffff;
    }
    .ticket-badge {
      display: inline-block;
      padding: 6px 14px;
      background-color: #0284c7;
      color: #ffffff;
      font-weight: 700;
      font-family: monospace;
      font-size: 16px;
      border-radius: 6px;
      letter-spacing: 0.1em;
      margin: 12px 0;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #38bdf8;
      color: #0b0f19;
      font-weight: 600;
      text-decoration: none;
      border-radius: 6px;
      margin: 16px 0;
    }
    .footer {
      padding: 24px 32px;
      background-color: #0f1420;
      border-top: 1px solid #1e293b;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">VORYN</div>
      <div class="tagline">Exclusive Event Discovery & Ticketing</div>
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      <p style="margin: 0; color: #64748b;">This is a transactional message sent by Voryn.</p>
      <p style="margin: 4px 0 0; color: #64748b;">&copy; ${new Date().getFullYear()} Voryn. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

export function ticketPurchaseEmail(params: {
  userName: string;
  orderNumber: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  currency: string;
  totalMinor: number;
  tickets: Array<{ name: string; quantity: number; code: string }>;
  walletUrl: string;
}): EmailContent {
  const formattedTotal = (params.totalMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const ticketRows = params.tickets
    .map(
      (t) => `
    <div style="margin-bottom: 16px; padding: 12px; background-color: #121826; border-radius: 6px;">
      <div style="font-weight: 600; color: #ffffff;">${t.name} (Qty: ${t.quantity})</div>
      <div class="ticket-badge">${t.code}</div>
    </div>
  `
    )
    .join("");

  const html = baseLayout(
    `Your tickets for ${params.eventTitle} - Voryn`,
    `
    <h1>Order Confirmed!</h1>
    <p>Hi ${params.userName},</p>
    <p>Your payment has been successfully verified. You are confirmed for <strong>${params.eventTitle}</strong>.</p>
    
    <div class="card">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 8px;">EVENT DETAILS</div>
      <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">${params.eventTitle}</div>
      <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 4px;">📅 ${params.eventDate}</div>
      <div style="font-size: 14px; color: #cbd5e1;">📍 ${params.eventVenue}</div>
    </div>

    <div class="card">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">ORDER #${params.orderNumber}</div>
      ${ticketRows}
      <div class="item-row">
        <span>Total Paid</span>
        <span>${params.currency} ${formattedTotal}</span>
      </div>
    </div>

    <p style="text-align: center;">
      <a href="${params.walletUrl}" class="button">View in Ticket Wallet</a>
    </p>
    <p style="font-size: 13px; color: #94a3b8;">Present your digital ticket code or QR code at check-in for venue access.</p>
  `
  );

  const text = `
Order Confirmed: ${params.eventTitle}
Order Number: ${params.orderNumber}
Attendee: ${params.userName}
Date: ${params.eventDate}
Venue: ${params.eventVenue}
Total: ${params.currency} ${formattedTotal}

Tickets:
${params.tickets.map((t) => `- ${t.name} (Qty: ${t.quantity}): Code ${t.code}`).join("\n")}

View your tickets: ${params.walletUrl}
`;

  return {
    subject: `Order Confirmed: ${params.eventTitle} (#${params.orderNumber})`,
    html,
    text
  };
}

export function paymentReceiptEmail(params: {
  userName: string;
  orderNumber: string;
  transactionReference: string;
  currency: string;
  totalMinor: number;
  paidAt: string;
  eventTitle: string;
}): EmailContent {
  const formattedTotal = (params.totalMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const html = baseLayout(
    `Payment Receipt #${params.orderNumber} - Voryn`,
    `
    <h1>Payment Receipt</h1>
    <p>Hi ${params.userName},</p>
    <p>Thank you for your purchase. Here is your payment receipt.</p>
    
    <div class="card">
      <div class="item-row">
        <span>Order Number</span>
        <span>${params.orderNumber}</span>
      </div>
      <div class="item-row">
        <span>Transaction Reference</span>
        <span style="font-family: monospace;">${params.transactionReference}</span>
      </div>
      <div class="item-row">
        <span>Event</span>
        <span>${params.eventTitle}</span>
      </div>
      <div class="item-row">
        <span>Date Paid</span>
        <span>${params.paidAt}</span>
      </div>
      <div class="item-row">
        <span>Amount Charged</span>
        <span>${params.currency} ${formattedTotal}</span>
      </div>
      <div class="item-row">
        <span>Payment Status</span>
        <span style="color: #4ade80;">Successful</span>
      </div>
    </div>
  `
  );

  const text = `
Payment Receipt
Order: ${params.orderNumber}
Transaction Ref: ${params.transactionReference}
Event: ${params.eventTitle}
Date: ${params.paidAt}
Amount: ${params.currency} ${formattedTotal}
Status: Successful
`;

  return {
    subject: `Payment Receipt: Order #${params.orderNumber}`,
    html,
    text
  };
}

export function refundStatusEmail(params: {
  userName: string;
  orderNumber: string;
  eventTitle: string;
  currency: string;
  amountMinor: number;
  status: "approved" | "completed" | "rejected";
  reason?: string;
}): EmailContent {
  const formattedAmount = (params.amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const statusTitle =
    params.status === "completed"
      ? "Refund Processed"
      : params.status === "approved"
        ? "Refund Approved"
        : "Refund Request Declined";

  const html = baseLayout(
    `${statusTitle} - Order #${params.orderNumber}`,
    `
    <h1>${statusTitle}</h1>
    <p>Hi ${params.userName},</p>
    <p>We are writing to update you on your refund request for <strong>${params.eventTitle}</strong> (Order #${params.orderNumber}).</p>
    
    <div class="card">
      <div class="item-row">
        <span>Refund Amount</span>
        <span>${params.currency} ${formattedAmount}</span>
      </div>
      <div class="item-row">
        <span>Status</span>
        <span style="color: ${params.status === 'rejected' ? '#f87171' : '#4ade80'}; font-weight: 700;">
          ${params.status.toUpperCase()}
        </span>
      </div>
      ${params.reason ? `<div style="margin-top: 12px; font-size: 14px; color: #94a3b8;">Note: ${params.reason}</div>` : ""}
    </div>
    
    <p>${params.status === "rejected" ? "If you have questions regarding this decision, please reach out to the event organizer or support." : "Please allow 3-5 business days for your payment provider or banking institution to credit your account."}</p>
  `
  );

  const text = `
${statusTitle}
Order: ${params.orderNumber}
Event: ${params.eventTitle}
Amount: ${params.currency} ${formattedAmount}
Status: ${params.status}
${params.reason ? `Note: ${params.reason}` : ""}
`;

  return {
    subject: `${statusTitle}: Order #${params.orderNumber}`,
    html,
    text
  };
}

export function eventReminderEmail(params: {
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  timingNotice: string;
  ticketCode: string;
  walletUrl: string;
}): EmailContent {
  const html = baseLayout(
    `Reminder: ${params.eventTitle} starts soon!`,
    `
    <h1>Event Reminder: ${params.timingNotice}</h1>
    <p>Hi ${params.userName},</p>
    <p>This is a reminder that <strong>${params.eventTitle}</strong> is happening ${params.timingNotice.toLowerCase()}.</p>
    
    <div class="card">
      <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">${params.eventTitle}</div>
      <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 4px;">📅 ${params.eventDate}</div>
      <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 12px;">📍 ${params.eventVenue}</div>
      
      <div style="font-size: 13px; color: #94a3b8; margin-top: 8px;">YOUR TICKET CODE</div>
      <div class="ticket-badge">${params.ticketCode}</div>
    </div>

    <p style="text-align: center;">
      <a href="${params.walletUrl}" class="button">Access Ticket QR Code</a>
    </p>
  `
  );

  const text = `
Event Reminder: ${params.eventTitle} (${params.timingNotice})
Date: ${params.eventDate}
Venue: ${params.eventVenue}
Ticket Code: ${params.ticketCode}
Access Ticket: ${params.walletUrl}
`;

  return {
    subject: `Reminder: ${params.eventTitle} is ${params.timingNotice.toLowerCase()}`,
    html,
    text
  };
}

export function passwordResetEmail(params: {
  email: string;
  resetUrl: string;
}): EmailContent {
  const html = baseLayout(
    "Reset your Voryn password",
    `
    <h1>Password Reset Request</h1>
    <p>We received a request to reset the password for your Voryn account (${params.email}).</p>
    <p>Click the button below to choose a new secure password. This link is valid for 1 hour.</p>
    <p style="text-align: center;">
      <a href="${params.resetUrl}" class="button">Reset Password</a>
    </p>
    <p style="font-size: 13px; color: #94a3b8;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  `
  );

  const text = `
Password Reset Request
Reset your password at: ${params.resetUrl}
This link will expire in 1 hour.
If you did not request this, please ignore this email.
`;

  return {
    subject: "Reset your Voryn password",
    html,
    text
  };
}

export function eventAnnouncementEmail(params: {
  userName: string;
  eventTitle: string;
  organizerName: string;
  subject: string;
  message: string;
  eventUrl: string;
}): EmailContent {
  const html = baseLayout(
    params.subject,
    `
    <h1>Announcement from ${params.organizerName}</h1>
    <p>Regarding: <strong>${params.eventTitle}</strong></p>
    <div class="card" style="white-space: pre-wrap; font-size: 14px; line-height: 1.7;">
${params.message}
    </div>
    <p style="text-align: center;">
      <a href="${params.eventUrl}" class="button">View Event Page</a>
    </p>
  `
  );

  const text = `
Announcement: ${params.eventTitle}
From: ${params.organizerName}
Subject: ${params.subject}

${params.message}

Event details: ${params.eventUrl}
`;

  return {
    subject: `[${params.eventTitle}] ${params.subject}`,
    html,
    text
  };
}
