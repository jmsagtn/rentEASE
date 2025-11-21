// functions/send_email.js - Enhanced with Reminder & Invoice Templates

const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../docs")));

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "rentease29@gmail.com",
    pass: "caps awvc wzgo hysq"
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify transporter
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter error:", error);
  } else {
    console.log("✅ Email server is ready to send messages");
  }
});

// Email Template Generator
function generateEmailHTML(subject, message) {
  // Determine email type
  const isVerification = subject.includes("Verification Code");
  const isInvoice = subject.includes("Invoice") || subject.includes("Payment Received");
  const is7DayReminder = subject.includes("Due in 7 Days");
  const is3DayReminder = subject.includes("Due in 3 Days");
  const isOverdue = subject.includes("Overdue") || subject.includes("OVERDUE");
  const isWelcome = subject.includes("Welcome");
  
  // Extract verification code if present
  const codeMatch = message.match(/\b\d{4}\b/);
  const verificationCode = codeMatch ? codeMatch[0] : null;
  
  // Choose color scheme based on email type
  let headerGradient = 'linear-gradient(135deg, #117c6f 0%, #289c8e 100%)';
  let iconEmoji = '🏠';
  
  if (isInvoice) {
    headerGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    iconEmoji = '📄';
  } else if (isOverdue) {
    headerGradient = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    iconEmoji = '⚠️';
  } else if (is3DayReminder) {
    headerGradient = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    iconEmoji = '⏰';
  } else if (is7DayReminder) {
    headerGradient = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
    iconEmoji = '📅';
  } else if (isWelcome) {
    iconEmoji = '🎉';
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
          background: ${headerGradient};
          padding: 30px 20px;
          text-align: center;
        }
        .header-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
          font-weight: 700;
        }
        .content {
          padding: 40px 30px;
        }
        .verification-code {
          background: linear-gradient(135deg, #e8f8f5 0%, #d4f1ec 100%);
          border: 2px solid #2fc4b2;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin: 30px 0;
        }
        .verification-code .code {
          font-size: 36px;
          font-weight: 700;
          color: #117c6f;
          letter-spacing: 8px;
          margin: 10px 0;
          font-family: 'Courier New', monospace;
        }
        .verification-code .label {
          font-size: 14px;
          color: #64948d;
          margin-bottom: 10px;
        }
        .invoice-box {
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 25px;
          margin: 20px 0;
        }
        .invoice-header {
          text-align: center;
          border-bottom: 2px solid #d1d5db;
          padding-bottom: 15px;
          margin-bottom: 20px;
          font-weight: 700;
          font-size: 18px;
          color: #111827;
        }
        .invoice-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .invoice-row:last-child {
          border-bottom: none;
        }
        .invoice-label {
          font-weight: 600;
          color: #6b7280;
        }
        .invoice-value {
          color: #111827;
          font-weight: 500;
        }
        .invoice-total {
          background: linear-gradient(135deg, #e8f8f5 0%, #d4f1ec 100%);
          padding: 15px;
          border-radius: 8px;
          margin-top: 15px;
          text-align: center;
        }
        .invoice-total .amount {
          font-size: 28px;
          font-weight: 700;
          color: #117c6f;
        }
        .message-text {
          color: #333;
          font-size: 16px;
          line-height: 1.8;
          white-space: pre-line;
        }
        .alert-box {
          padding: 15px 20px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 15px;
          font-weight: 500;
        }
        .alert-warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          color: #856404;
        }
        .alert-danger {
          background: #fee;
          border-left: 4px solid #ef4444;
          color: #991b1b;
        }
        .alert-info {
          background: #e0f2fe;
          border-left: 4px solid #3b82f6;
          color: #1e40af;
        }
        .alert-success {
          background: #d1fae5;
          border-left: 4px solid #10b981;
          color: #065f46;
        }
        .footer {
          background: #f8fcfb;
          padding: 20px 30px;
          text-align: center;
          color: #64948d;
          font-size: 14px;
          border-top: 1px solid #e0f2f0;
        }
        .button {
          display: inline-block;
          background: ${headerGradient};
          color: #ffffff;
          padding: 14px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 20px 0;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 25px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="header-icon">${iconEmoji}</div>
          <h1>RentEase</h1>
        </div>
        <div class="content">
          ${isVerification && verificationCode ? `
            <p class="message-text">Hello,</p>
            <p class="message-text">Thank you for signing up with RentEase! To complete your registration, please verify your email address using the code below:</p>
            <div class="verification-code">
              <div class="label">Your Verification Code</div>
              <div class="code">${verificationCode}</div>
            </div>
            <div class="alert-box alert-warning">
              ⚠️ This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
            </div>
          ` : isInvoice ? `
            ${generateInvoiceHTML(message)}
          ` : isOverdue ? `
            <div class="alert-box alert-danger">
              🚨 URGENT: Your rent payment is overdue and requires immediate attention.
            </div>
            <p class="message-text">${message}</p>
          ` : is3DayReminder ? `
            <div class="alert-box alert-warning">
              ⚠️ REMINDER: Your rent payment is due in 3 days.
            </div>
            <p class="message-text">${message}</p>
          ` : is7DayReminder ? `
            <div class="alert-box alert-info">
              📅 REMINDER: Your rent payment is due in 7 days.
            </div>
            <p class="message-text">${message}</p>
          ` : `
            <p class="message-text">${message}</p>
          `}
        </div>
        <div class="footer">
          <p style="margin: 0;">© ${new Date().getFullYear()} RentEase. All rights reserved.</p>
          <p style="margin: 10px 0 0 0; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate Invoice HTML
function generateInvoiceHTML(message) {
  // Extract invoice details from message
  const invoiceMatch = message.match(/Invoice Number: #(\d+)/);
  const amountMatch = message.match(/Amount Paid: ₱([\d,]+)/);
  const dateMatch = message.match(/Payment Date: ([^\n]+)/);
  const tenantMatch = message.match(/Name: ([^\n]+)/);
  const propertyMatch = message.match(/Property: ([^\n]+)/);
  const unitMatch = message.match(/Unit: ([^\n]+)/);
  
  return `
    <div class="alert-box alert-success">
      ✅ Payment Received Successfully
    </div>
    <p class="message-text">Thank you for your payment! This email confirms that we have received your rent payment.</p>
    
    <div class="invoice-box">
      <div class="invoice-header">PAYMENT INVOICE</div>
      
      ${invoiceMatch ? `
      <div class="invoice-row">
        <span class="invoice-label">Invoice Number:</span>
        <span class="invoice-value">#${invoiceMatch[1]}</span>
      </div>
      ` : ''}
      
      ${dateMatch ? `
      <div class="invoice-row">
        <span class="invoice-label">Payment Date:</span>
        <span class="invoice-value">${dateMatch[1]}</span>
      </div>
      ` : ''}
      
      ${tenantMatch ? `
      <div class="invoice-row">
        <span class="invoice-label">Tenant Name:</span>
        <span class="invoice-value">${tenantMatch[1]}</span>
      </div>
      ` : ''}
      
      ${propertyMatch ? `
      <div class="invoice-row">
        <span class="invoice-label">Property:</span>
        <span class="invoice-value">${propertyMatch[1]}</span>
      </div>
      ` : ''}
      
      ${unitMatch ? `
      <div class="invoice-row">
        <span class="invoice-label">Unit:</span>
        <span class="invoice-value">${unitMatch[1]}</span>
      </div>
      ` : ''}
      
      ${amountMatch ? `
      <div class="invoice-total">
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Amount Paid</div>
        <div class="amount">₱${amountMatch[1]}</div>
        <div style="font-size: 14px; color: #059669; margin-top: 8px; font-weight: 600;">✓ PAID</div>
      </div>
      ` : ''}
    </div>
    
    <p class="message-text" style="font-size: 14px; color: #6b7280;">
      Thank you for your timely payment. Your account is now up to date. Please keep this email for your records.
    </p>
  `;
}

// API: Send Email
app.post("/send-email", async (req, res) => {
  const { to, subject, message } = req.body;

  if (!to || !subject || !message) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields: to, subject, message" 
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid email format" 
    });
  }

  const htmlContent = generateEmailHTML(subject, message);

  const mailOptions = {
    from: '"RentEase" <rentease29@gmail.com>',
    to,
    subject,
    text: message,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}:`, info.messageId);
    
    res.json({ 
      success: true, 
      messageId: info.messageId,
      info: info.response 
    });
  } catch (error) {
    console.error("❌ Email sending error:", error);
    
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to send email"
    });
  }
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    service: "RentEase Email Server"
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: "Endpoint not found" 
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    success: false, 
    error: "Internal server error" 
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RentEase server running at http://localhost:${PORT}`);
  console.log(`📧 Email service: Ready`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, "../docs")}`);
});