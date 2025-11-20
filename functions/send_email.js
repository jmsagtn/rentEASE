// ------------------------------
// RentEase Email + Frontend Server
// ------------------------------
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");

const app = express();

// Allow JSON requests & cross-origin requests
app.use(cors());
app.use(express.json());

// ------------------------------
// Serve frontend (docs folder)
// ------------------------------
app.use(express.static(path.join(__dirname, "../docs")));

// ------------------------------
// Gmail transporter with improved configuration
// ------------------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "rentease29@gmail.com",
    pass: "caps awvc wzgo hysq" // Gmail App Password
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify transporter configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter error:", error);
  } else {
    console.log("✅ Email server is ready to send messages");
  }
});

// ------------------------------
// API: Send Email (Verification & Confirmation)
// ------------------------------
app.post("/send-email", async (req, res) => {
  const { to, subject, message } = req.body;

  // Validation
  if (!to || !subject || !message) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields: to, subject, message" 
    });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid email format" 
    });
  }

  // Determine email type for styling
  const isVerification = subject.includes("Verification Code");
  
  // Create HTML email template
  const htmlContent = `
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
          background: linear-gradient(135deg, #117c6f 0%, #289c8e 100%);
          padding: 30px 20px;
          text-align: center;
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
        .message-text {
          color: #333;
          font-size: 16px;
          line-height: 1.8;
          white-space: pre-line;
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
          background: linear-gradient(135deg, #117c6f 0%, #289c8e 100%);
          color: #ffffff;
          padding: 14px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 20px 0;
        }
        .warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          font-size: 14px;
          color: #856404;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏠 RentEase</h1>
        </div>
        <div class="content">
          ${isVerification ? `
            <p class="message-text">Hello,</p>
            <p class="message-text">Thank you for signing up with RentEase! To complete your registration, please verify your email address using the code below:</p>
            <div class="verification-code">
              <div class="label">Your Verification Code</div>
              <div class="code">${message.match(/\d{4}/)?.[0] || 'N/A'}</div>
            </div>
            <div class="warning">
              ⚠️ This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
            </div>
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

  const mailOptions = {
    from: '"RentEase" <rentease29@gmail.com>',
    to,
    subject,
    text: message, // Plain text fallback
    html: htmlContent // HTML version
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

// ------------------------------
// Health Check Endpoint
// ------------------------------
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    service: "RentEase Email Server"
  });
});

// ------------------------------
// 404 Handler
// ------------------------------
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: "Endpoint not found" 
  });
});

// ------------------------------
// Error Handler
// ------------------------------
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    success: false, 
    error: "Internal server error" 
  });
});

// ------------------------------
// Start the Server
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RentEase server running at http://localhost:${PORT}`);
  console.log(`📧 Email service: Ready`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, "../docs")}`);
});