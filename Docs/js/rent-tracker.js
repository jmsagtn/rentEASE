// Docs/js/rent-tracker.js - Enhanced with Clickable Status

import { initializeApp as initFirebase } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDPdEDH0nB5WeWbZ900LZHWTEu1WqJyang",
  authDomain: "rentease292005.firebaseapp.com",
  projectId: "rentease292005",
  storageBucket: "rentease292005.appspot.com",
  messagingSenderId: "752851443491",
  appId: "1:752851443491:web:e662e3fa215df8da3c3696",
  measurementId: "G-Y8M86YFV9W"
};

// Initialize Firebase
const app = initFirebase(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State management
let currentUser = null;
let allTenants = [];
let allProperties = new Map();
let allPayments = [];
let filteredPayments = [];
let paidPaymentRecords = new Map();
let tenantsUnsubscribe = null;
let propertiesUnsubscribe = null;
let paymentsUnsubscribe = null;

// DOM Elements
const DOM = {
  userNameEl: document.querySelector('.user-name'),
  userEmailEl: document.querySelector('.user-email'),
  logoutBtn: document.querySelector('.logout-button'),
  filterStatus: document.querySelectorAll('.filter-select')[0],
  filterProperty: document.querySelectorAll('.filter-select')[1],
  filterMonth: document.querySelectorAll('.filter-select')[2],
  searchInput: document.querySelector('.search-input'),
  tableBody: document.querySelector('tbody'),
  tableCount: document.querySelector('.table-count'),
  exportBtn: document.querySelector('.btn-secondary'),
  recordPaymentBtn: document.querySelector('.btn-primary'),
  totalExpectedEl: document.querySelector('.stats-grid .stat-card:nth-child(1) .stat-number'),
  collectedEl: document.querySelector('.stats-grid .stat-card:nth-child(2) .stat-number'),
  pendingEl: document.querySelector('.stats-grid .stat-card:nth-child(3) .stat-number'),
  overdueEl: document.querySelector('.stats-grid .stat-card:nth-child(4) .stat-number')
};

// ==================== CLICKABLE STATUS FUNCTION ====================

window.changePaymentStatus = function(paymentId) {
  const payment = allPayments.find(p => p.id === paymentId);
  if (!payment) return;
  
  const tenant = allTenants.find(t => t.id === payment.tenantId);
  const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
  
  const content = `
    <div class="payment-details">
      <p style="margin-bottom: 20px; color: #6b7280;">
        Change payment status for <strong>${escapeHtml(payment.tenantName)}</strong>
      </p>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Property:</div>
          <div style="color: #6b7280; font-size: 14px;">${escapeHtml(propertyName)} - Unit ${escapeHtml(payment.unitNumber || 'N/A')}</div>
        </div>
      </div>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Amount:</div>
          <div style="color: #6b7280; font-size: 14px;">₱${payment.amount.toLocaleString()}</div>
        </div>
      </div>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Due Date:</div>
          <div style="color: #6b7280; font-size: 14px;">${payment.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
      </div>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Current Status:</div>
          <div><span class="status-badge status-${payment.status}">${capitalize(payment.status)}</span></div>
        </div>
      </div>
      
      <div style="margin-top: 24px;">
        <h4 style="margin-bottom: 12px; color: #111827; font-size: 16px;">Select New Status:</h4>
      </div>
    </div>
  `;
  
  const modal = createModal('Change Payment Status', content, 'info');
  
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-top: 16px;';
  
  const statusOptions = [
    { 
      status: 'paid', 
      label: '✅ Paid', 
      description: 'Mark as fully paid',
      color: '#10b981',
      current: payment.status === 'paid'
    },
    { 
      status: 'pending', 
      label: '⏰ Pending', 
      description: 'Payment is pending/awaiting',
      color: '#f59e0b',
      current: payment.status === 'pending'
    },
    { 
      status: 'overdue', 
      label: '⚠️ Overdue', 
      description: 'Payment is past due date',
      color: '#ef4444',
      current: payment.status === 'overdue'
    }
  ];
  
  statusOptions.forEach(option => {
    const btn = document.createElement('button');
    btn.className = 'status-type-btn';
    btn.disabled = option.current;
    btn.style.cssText = `
      padding: 14px 18px;
      border: 2px solid ${option.color};
      background: ${option.current ? option.color + '30' : option.color + '15'};
      border-radius: 8px;
      cursor: ${option.current ? 'not-allowed' : 'pointer'};
      transition: all 0.2s;
      text-align: left;
      font-family: inherit;
      opacity: ${option.current ? '0.7' : '1'};
    `;
    
    btn.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: ${option.color}; margin-bottom: 4px;">${option.label}</div>
          <div style="font-size: 13px; color: #6b7280;">${option.description}</div>
        </div>
        ${option.current ? '<span style="font-size: 12px; color: #6b7280; background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">Current</span>' : ''}
      </div>
    `;
    
    if (!option.current) {
      btn.onmouseover = () => {
        btn.style.background = `${option.color}25`;
        btn.style.transform = 'translateX(5px)';
      };
      
      btn.onmouseout = () => {
        btn.style.background = `${option.color}15`;
        btn.style.transform = 'translateX(0)';
      };
      
      btn.onclick = async () => {
        closeModal(modal);
        await updatePaymentStatus(payment, option.status, tenant);
      };
    }
    
    btnContainer.appendChild(btn);
  });
  
  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.marginTop = '12px';
  cancelBtn.onclick = () => closeModal(modal);
  
  btnContainer.appendChild(cancelBtn);
  modal.querySelector('.modal-body').appendChild(btnContainer);
};

async function updatePaymentStatus(payment, newStatus, tenant) {
  const oldStatus = payment.status;
  
  showConfirmModal(
    'Confirm Status Change',
    `Are you sure you want to change the status from "${capitalize(oldStatus)}" to "${capitalize(newStatus)}"?${newStatus === 'paid' && tenant?.email ? '\n\nAn invoice will be sent to the tenant.' : ''}`,
    async () => {
      try {
        const loadingModal = createModal('Updating Status...', '<p>Please wait...</p>', 'info');
        
        const paidRecord = paidPaymentRecords.get(payment.id);
        
        if (newStatus === 'paid') {
          // If marking as paid and no record exists, create one
          if (!paidRecord) {
            await addDoc(collection(db, "payments"), {
              landlordId: currentUser.uid,
              tenantId: payment.tenantId,
              tenantName: payment.tenantName,
              propertyId: payment.propertyId,
              unitNumber: payment.unitNumber,
              amount: payment.amount,
              dueDate: payment.dueDate,
              paidDate: new Date(),
              status: 'paid',
              createdAt: serverTimestamp()
            });
          } else {
            // Update existing record
            await updateDoc(doc(db, "payments", paidRecord.id), {
              status: 'paid',
              paidDate: new Date(),
              updatedAt: serverTimestamp()
            });
          }
          
          // Log activity
          await addDoc(collection(db, "activities"), {
            userId: currentUser.uid,
            type: "payment_received",
            title: "Payment Marked as Paid",
            details: `₱${payment.amount.toLocaleString()} from ${payment.tenantName}`,
            icon: "💰",
            timestamp: serverTimestamp()
          });
          
          // Send invoice if tenant has email
          if (tenant?.email) {
            await sendPaymentInvoice(tenant, payment);
          }
          
        } else if (paidRecord) {
          // If changing from paid to pending/overdue, update the record
          await updateDoc(doc(db, "payments", paidRecord.id), {
            status: newStatus,
            paidDate: null,
            updatedAt: serverTimestamp()
          });
          
          // Log activity
          await addDoc(collection(db, "activities"), {
            userId: currentUser.uid,
            type: "status_changed",
            title: "Payment Status Changed",
            details: `${payment.tenantName}: ${capitalize(oldStatus)} → ${capitalize(newStatus)}`,
            icon: "📝",
            timestamp: serverTimestamp()
          });
        } else {
          // Create a new record with the new status
          await addDoc(collection(db, "payments"), {
            landlordId: currentUser.uid,
            tenantId: payment.tenantId,
            tenantName: payment.tenantName,
            propertyId: payment.propertyId,
            unitNumber: payment.unitNumber,
            amount: payment.amount,
            dueDate: payment.dueDate,
            paidDate: null,
            status: newStatus,
            createdAt: serverTimestamp()
          });
          
          // Log activity
          await addDoc(collection(db, "activities"), {
            userId: currentUser.uid,
            type: "status_changed",
            title: "Payment Status Changed",
            details: `${payment.tenantName}: ${capitalize(oldStatus)} → ${capitalize(newStatus)}`,
            icon: "📝",
            timestamp: serverTimestamp()
          });
        }
        
        closeModal(loadingModal);
        showSuccessModal(`Payment status changed to "${capitalize(newStatus)}" successfully!`);
        
      } catch (error) {
        console.error("Error updating payment status:", error);
        showErrorModal('Error updating status. Please try again.');
      }
    }
  );
}

// ==================== EMAIL SENDING FUNCTIONS ====================

async function sendReminderEmail(tenant, payment, reminderType) {
  try {
    const propertyName = allProperties.get(payment.propertyId)?.name || 'Your Property';
    const tenantEmail = tenant.email;
    
    if (!tenantEmail) {
      console.error("Tenant email not found:", tenant);
      return false;
    }

    let subject = '';
    let message = '';
    
    const dueDate = payment.dueDate.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    switch(reminderType) {
      case '7-day':
        subject = `Rent Payment Reminder - Due in 7 Days`;
        message = `Hello ${tenant.firstName} ${tenant.lastName},

This is a friendly reminder that your rent payment is due in 7 days.

Payment Details:
• Property: ${propertyName}
• Unit: ${payment.unitNumber || 'N/A'}
• Amount Due: ₱${payment.amount.toLocaleString()}
• Due Date: ${dueDate}

Please ensure your payment is made on or before the due date to avoid any late fees.

If you have already made the payment, please disregard this email.

Thank you for your prompt attention to this matter.

Best regards,
RentEase Property Management`;
        break;
        
      case '3-day':
        subject = `Urgent: Rent Payment Due in 3 Days`;
        message = `Hello ${tenant.firstName} ${tenant.lastName},

This is an urgent reminder that your rent payment is due in 3 days.

Payment Details:
• Property: ${propertyName}
• Unit: ${payment.unitNumber || 'N/A'}
• Amount Due: ₱${payment.amount.toLocaleString()}
• Due Date: ${dueDate}

⚠️ Please make your payment as soon as possible to avoid late fees.

If you have already made the payment, please disregard this email.

Thank you for your cooperation.

Best regards,
RentEase Property Management`;
        break;
        
      case 'overdue':
        const daysOverdue = Math.floor((new Date() - payment.dueDate) / (1000 * 60 * 60 * 24));
        subject = `URGENT: Overdue Rent Payment - Immediate Action Required`;
        message = `Hello ${tenant.firstName} ${tenant.lastName},

This is an urgent notice that your rent payment is now OVERDUE.

Payment Details:
• Property: ${propertyName}
• Unit: ${payment.unitNumber || 'N/A'}
• Amount Due: ₱${payment.amount.toLocaleString()}
• Original Due Date: ${dueDate}
• Days Overdue: ${daysOverdue} day(s)

🚨 IMMEDIATE ACTION REQUIRED

Your rent payment is now overdue and must be paid immediately. Late fees may apply.

Please contact us immediately to arrange payment or discuss your situation.

If you have already made the payment, please contact us with proof of payment.

This is a formal notice. Continued non-payment may result in further action.

Best regards,
RentEase Property Management`;
        break;
        
      case 'pending':
        subject = `Rent Payment Reminder`;
        message = `Hello ${tenant.firstName} ${tenant.lastName},

This is a reminder about your upcoming rent payment.

Payment Details:
• Property: ${propertyName}
• Unit: ${payment.unitNumber || 'N/A'}
• Amount Due: ₱${payment.amount.toLocaleString()}
• Due Date: ${dueDate}

Please ensure your payment is made on or before the due date.

If you have already made the payment, please disregard this email.

Thank you!

Best regards,
RentEase Property Management`;
        break;
    }

    console.log(`📧 Sending ${reminderType} reminder to:`, tenantEmail);

    const response = await fetch("/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: tenantEmail,
        subject: subject,
        message: message
      })
    });

    if (!response.ok) {
      console.error("Failed to send email:", response.status);
      return false;
    }

    const result = await response.json();
    console.log(`✅ ${reminderType} reminder sent successfully:`, result);
    
    await addDoc(collection(db, "activities"), {
      userId: currentUser.uid,
      type: "email_sent",
      title: `${reminderType} Reminder Sent`,
      details: `Sent to ${tenant.firstName} ${tenant.lastName} for ${propertyName}`,
      icon: "📧",
      timestamp: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error(`Error sending ${reminderType} reminder:`, error);
    return false;
  }
}

async function sendPaymentInvoice(tenant, payment) {
  try {
    const propertyName = allProperties.get(payment.propertyId)?.name || 'Your Property';
    const tenantEmail = tenant.email;
    
    if (!tenantEmail) {
      console.error("Tenant email not found:", tenant);
      return false;
    }

    const paidDate = new Date().toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    const dueDate = payment.dueDate.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });

    const subject = `Payment Received - Invoice #${Date.now()}`;
    const message = `Hello ${tenant.firstName} ${tenant.lastName},

Thank you for your payment! This email confirms that we have received your rent payment.

═════════════════════════════
                          PAYMENT INVOICE
═════════════════════════════

Invoice Number: #${Date.now()}
Payment Date: ${paidDate}

TENANT INFORMATION:
• Name: ${tenant.firstName} ${tenant.lastName}
• Email: ${tenantEmail}
• Phone: ${tenant.phone || 'N/A'}

PROPERTY INFORMATION:
• Property: ${propertyName}
• Unit: ${payment.unitNumber || 'N/A'}

PAYMENT DETAILS:
• Amount Paid: ₱${payment.amount.toLocaleString()}
• Due Date: ${dueDate}
• Payment Status: PAID ✓

═════════════════════════════

Thank you for your timely payment. Your account is now up to date.

If you have any questions regarding this invoice, please don't hesitate to contact us.

Best regards,
RentEase Property Management

---
This is an automated invoice. Please keep this email for your records.`;

    console.log(`📧 Sending payment invoice to:`, tenantEmail);

    const response = await fetch("/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: tenantEmail,
        subject: subject,
        message: message
      })
    });

    if (!response.ok) {
      console.error("Failed to send invoice:", response.status);
      return false;
    }

    const result = await response.json();
    console.log("✅ Payment invoice sent successfully:", result);
    
    await addDoc(collection(db, "activities"), {
      userId: currentUser.uid,
      type: "invoice_sent",
      title: "Payment Invoice Sent",
      details: `Invoice sent to ${tenant.firstName} ${tenant.lastName} - ₱${payment.amount.toLocaleString()}`,
      icon: "📄",
      timestamp: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error("Error sending payment invoice:", error);
    return false;
  }
}

// ==================== SEND EMAIL WITH OPTIONS ====================

window.sendEmailToTenant = function(paymentId) {
  const payment = allPayments.find(p => p.id === paymentId);
  if (!payment) return;
  
  const tenant = allTenants.find(t => t.id === payment.tenantId);
  if (!tenant) {
    showErrorModal('Tenant information not found');
    return;
  }
  
  if (!tenant.email) {
    showErrorModal('Tenant email address not found. Please add an email address for this tenant.');
    return;
  }
  
  const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
  
  const emailOptions = `
    <div class="payment-details">
      <p style="margin-bottom: 20px; color: #6b7280;">
        Select the type of email to send to <strong>${escapeHtml(tenant.firstName)} ${escapeHtml(tenant.lastName)}</strong>:
      </p>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Property:</div>
          <div style="color: #6b7280; font-size: 14px;">${escapeHtml(propertyName)} - Unit ${escapeHtml(payment.unitNumber || 'N/A')}</div>
        </div>
      </div>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Amount:</div>
          <div style="color: #6b7280; font-size: 14px;">₱${payment.amount.toLocaleString()}</div>
        </div>
      </div>
      
      <div class="detail-row" style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
        <div>
          <div style="font-weight: 600; color: #111827;">Current Status:</div>
          <div><span class="status-badge status-${payment.status}">${capitalize(payment.status)}</span></div>
        </div>
      </div>
      
      <div style="margin-top: 24px;">
        <h4 style="margin-bottom: 12px; color: #111827; font-size: 16px;">Choose Email Type:</h4>
      </div>
    </div>
  `;
  
  const modal = createModal('Send Email to Tenant', emailOptions, 'info');
  
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-top: 16px;';
  
  const emailTypes = [
    { type: 'pending', label: '📧 General Reminder', description: 'Standard payment reminder', color: '#3b82f6' },
    { type: '7-day', label: '📅 7-Day Reminder', description: 'Reminder for payment due in 7 days', color: '#3b82f6' },
    { type: '3-day', label: '⏰ 3-Day Urgent Reminder', description: 'Urgent reminder for payment due in 3 days', color: '#f59e0b' },
    { type: 'overdue', label: '🚨 Overdue Notice', description: 'Formal notice for overdue payment', color: '#ef4444' }
  ];
  
  if (payment.status === 'paid') {
    emailTypes.push({ type: 'invoice', label: '📄 Payment Invoice', description: 'Send payment confirmation invoice', color: '#10b981' });
  }
  
  emailTypes.forEach(emailType => {
    const btn = document.createElement('button');
    btn.className = 'email-type-btn';
    btn.style.cssText = `padding: 14px 18px; border: 2px solid ${emailType.color}; background: ${emailType.color}15; border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: left; font-family: inherit;`;
    
    btn.innerHTML = `
      <div style="font-weight: 600; color: ${emailType.color}; margin-bottom: 4px;">${emailType.label}</div>
      <div style="font-size: 13px; color: #6b7280;">${emailType.description}</div>
    `;
    
    btn.onmouseover = () => { btn.style.background = `${emailType.color}25`; btn.style.transform = 'translateX(5px)'; };
    btn.onmouseout = () => { btn.style.background = `${emailType.color}15`; btn.style.transform = 'translateX(0)'; };
    
    btn.onclick = async () => {
      closeModal(modal);
      showConfirmModal('Confirm Send Email', `Are you sure you want to send a ${emailType.label} to ${tenant.firstName} ${tenant.lastName}?`, async () => {
        try {
          const loadingModal = createModal('Sending Email...', '<p>Please wait while we send the email...</p>', 'info');
          let emailSent = emailType.type === 'invoice' ? await sendPaymentInvoice(tenant, payment) : await sendReminderEmail(tenant, payment, emailType.type);
          closeModal(loadingModal);
          emailSent ? showSuccessModal(`Email sent successfully to ${tenant.firstName} ${tenant.lastName}!`) : showErrorModal('Failed to send email. Please check console for details.');
        } catch (error) {
          console.error('Error sending email:', error);
          showErrorModal('Error sending email. Please try again.');
        }
      });
    };
    
    btnContainer.appendChild(btn);
  });
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.marginTop = '12px';
  cancelBtn.onclick = () => closeModal(modal);
  
  btnContainer.appendChild(cancelBtn);
  modal.querySelector('.modal-body').appendChild(btnContainer);
};

// ==================== MODAL SYSTEM ====================

function createModal(title, content, type = 'info') {
  const existingModal = document.querySelector('.custom-modal-overlay');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'custom-modal-overlay';
  
  const iconMap = { 'success': '✅', 'error': '❌', 'info': 'ℹ️', 'warning': '⚠️', 'confirm': '❓' };

  modal.innerHTML = `
    <div class="custom-modal">
      <div class="modal-header ${type}">
        <span class="modal-icon">${iconMap[type]}</span>
        <h3 class="modal-title">${title}</h3>
      </div>
      <div class="modal-body">${content}</div>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
  return modal;
}

function showInfoModal(title, content) {
  const modal = createModal(title, content, 'info');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn modal-btn-primary';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => closeModal(modal);
  modal.querySelector('.modal-body').appendChild(closeBtn);
}

function showSuccessModal(message) {
  const modal = createModal('Success', `<p>${message}</p>`, 'success');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn modal-btn-primary';
  closeBtn.textContent = 'OK';
  closeBtn.onclick = () => closeModal(modal);
  modal.querySelector('.modal-body').appendChild(closeBtn);
}

function showErrorModal(message) {
  const modal = createModal('Error', `<p>${message}</p>`, 'error');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-btn modal-btn-primary';
  closeBtn.textContent = 'OK';
  closeBtn.onclick = () => closeModal(modal);
  modal.querySelector('.modal-body').appendChild(closeBtn);
}

function showConfirmModal(title, message, onConfirm) {
  const modal = createModal(title, `<p>${message}</p>`, 'confirm');
  const btnContainer = document.createElement('div');
  btnContainer.className = 'modal-btn-group';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => closeModal(modal);
  
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-btn modal-btn-primary';
  confirmBtn.textContent = 'Confirm';
  confirmBtn.onclick = () => { closeModal(modal); onConfirm(); };
  
  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(confirmBtn);
  modal.querySelector('.modal-body').appendChild(btnContainer);
}

function closeModal(modal) {
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 300);
}

// ==================== INITIALIZATION ====================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    setupMobileMenu(); // Add mobile menu setup
    await initializeRentTracker();
  } else {
    cleanup();
    window.location.href = 'index.html';
  }
});

async function initializeRentTracker() {
  try {
    await loadUserData();
    await loadPaidPayments();
    await loadProperties();
    await loadTenants();
    setupEventListeners();
  } catch (error) {
    console.error("Initialization error:", error);
    showErrorModal('Error loading page. Please refresh.');
  }
}

// ==================== MOBILE MENU ====================

function setupMobileMenu() {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.querySelector('aside');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (mobileMenuToggle && sidebar) {
    mobileMenuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('mobile-open');
      if (sidebarOverlay) {
        sidebarOverlay.classList.toggle('active');
      }
    });
  }

  if (sidebarOverlay && sidebar) {
    sidebarOverlay.addEventListener('click', function() {
      sidebar.classList.remove('mobile-open');
      sidebarOverlay.classList.remove('active');
    });
  }

  // Close sidebar when clicking navigation links on mobile
  if (sidebar) {
    const navLinks = sidebar.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
          if (sidebarOverlay) {
            sidebarOverlay.classList.remove('active');
          }
        }
      });
    });
  }
}

// ==================== USER DATA ====================

async function loadUserData() {
  try {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      DOM.userNameEl.textContent = userData.username || 'User';
      DOM.userEmailEl.textContent = userData.email || currentUser.email || '';
      
      // Add plan badge logic
      const userPlan = userData.plan || 'freemium';
      const planBadge = document.getElementById('plan-badge');
      const displayPlanName = userPlan === 'freemium' ? 'Free' : 
                             userPlan === 'premium' ? 'Premium' : 'Platinum';
      planBadge.textContent = displayPlanName;
      planBadge.className = `plan-badge plan-${userPlan}`;
    }
  } catch (error) {
    console.error("Error loading user data:", error);
  }
}

// ==================== LOAD PAID PAYMENTS ====================

async function loadPaidPayments() {
  try {
    const paymentsQuery = query(collection(db, "payments"), where("landlordId", "==", currentUser.uid));
    
    paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      paidPaymentRecords.clear();
      snapshot.forEach((doc) => {
        const payment = doc.data();
        const dueDate = payment.dueDate?.toDate ? payment.dueDate.toDate() : new Date(payment.dueDate);
        const key = `${payment.tenantId}_${dueDate.getTime()}`;
        paidPaymentRecords.set(key, { id: doc.id, ...payment });
      });
      if (allTenants.length > 0) generatePayments();
    });
  } catch (error) {
    console.error("Error loading paid payments:", error);
  }
}

// ==================== PROPERTIES ====================

async function loadProperties() {
  try {
    const propertiesQuery = query(collection(db, "properties"), where("ownerId", "==", currentUser.uid));
    
    propertiesUnsubscribe = onSnapshot(propertiesQuery, (snapshot) => {
      allProperties.clear();
      DOM.filterProperty.innerHTML = '<option value="all">All Properties</option>';
      
      snapshot.forEach((doc) => {
        const property = doc.data();
        allProperties.set(doc.id, property);
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = property.name;
        DOM.filterProperty.appendChild(option);
      });
      
      if (allTenants.length > 0) generatePayments();
    });
  } catch (error) {
    console.error("Error loading properties:", error);
  }
}

// ==================== TENANTS ====================

async function loadTenants() {
  try {
    const tenantsQuery = query(collection(db, "tenants"), where("landlordId", "==", currentUser.uid));
    tenantsUnsubscribe = onSnapshot(tenantsQuery, (snapshot) => {
      allTenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      generatePayments();
    });
  } catch (error) {
    console.error("Error loading tenants:", error);
  }
}

// ==================== GENERATE PAYMENTS ====================

function generatePayments() {
  const currentDate = new Date();
  allPayments = [];
  
  allTenants.forEach(tenant => {
    if (tenant.status === 'active' && tenant.moveInDate) {
      const moveInDate = tenant.moveInDate.toDate ? tenant.moveInDate.toDate() : new Date(tenant.moveInDate);
      const leaseEndDate = tenant.leaseEndDate?.toDate ? tenant.leaseEndDate.toDate() : new Date(2100, 0, 1);
      const dueDay = moveInDate.getDate();
      
      for (let monthOffset = -6; monthOffset <= 3; monthOffset++) {
        const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset, dueDay);
        if (dueDate < moveInDate || dueDate > leaseEndDate) continue;
        
        const paymentId = `${tenant.id}_${dueDate.getTime()}`;
        const paidRecord = paidPaymentRecords.get(paymentId);
        
        let status = 'pending';
        
        if (paidRecord) {
          status = paidRecord.status || 'paid';
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(dueDate);
          due.setHours(0, 0, 0, 0);
          
          if (due < today) {
            const daysPastDue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
            status = daysPastDue > 5 ? 'overdue' : 'pending';
          }
        }
        
        allPayments.push({
          id: paymentId,
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          propertyId: tenant.propertyId,
          unitNumber: tenant.unitNumber,
          amount: tenant.monthlyRent,
          dueDate: dueDate,
          status: status,
          month: dueDate.getMonth(),
          year: dueDate.getFullYear(),
          paidDate: paidRecord?.paidDate
        });
      }
    }
  });
  
  allPayments.sort((a, b) => b.dueDate - a.dueDate);
  applyFilters();
  updateStats();
}

// ==================== STATISTICS ====================

function updateStats() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const currentMonthPayments = allPayments.filter(p => p.month === currentMonth && p.year === currentYear);
  
  const totalExpected = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collected = currentMonthPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
  const pending = currentMonthPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdueCount = currentMonthPayments.filter(p => p.status === 'overdue').length;
  
  DOM.totalExpectedEl.textContent = `₱${totalExpected.toLocaleString()}`;
  DOM.collectedEl.textContent = `₱${collected.toLocaleString()}`;
  DOM.pendingEl.textContent = `₱${pending.toLocaleString()}`;
  DOM.overdueEl.textContent = overdueCount;
}

// ==================== FILTERS ====================

function applyFilters() {
  const statusFilter = DOM.filterStatus.value;
  const propertyFilter = DOM.filterProperty.value;
  const monthFilter = DOM.filterMonth.value;
  const searchTerm = DOM.searchInput.value.toLowerCase().trim();
  
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  
  filteredPayments = allPayments.filter(payment => {
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesProperty = propertyFilter === 'all' || payment.propertyId === propertyFilter;
    
    let matchesMonth = true;
    if (monthFilter === 'current') {
      matchesMonth = payment.month === currentMonth && payment.year === currentYear;
    } else if (monthFilter === 'last') {
      matchesMonth = payment.month === lastMonth && payment.year === lastMonthYear;
    }
    
    let matchesSearch = true;
    if (searchTerm) {
      const propertyName = allProperties.get(payment.propertyId)?.name || '';
      matchesSearch = payment.tenantName.toLowerCase().includes(searchTerm) ||
                     propertyName.toLowerCase().includes(searchTerm) ||
                     payment.unitNumber?.toLowerCase().includes(searchTerm);
    }
    
    return matchesStatus && matchesProperty && matchesMonth && matchesSearch;
  });
  
  renderPayments();
}

// ==================== RENDERING ====================

function renderPayments() {
  DOM.tableBody.innerHTML = '';
  DOM.tableCount.textContent = `${filteredPayments.length} records`;
  
  if (filteredPayments.length === 0) {
    DOM.tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 60px 20px;">
          <div style="font-size: 48px; margin-bottom: 16px;">💰</div>
          <div style="font-size: 16px; color: #6b7280; font-weight: 600; margin-bottom: 8px;">No payment records found</div>
          <div style="font-size: 14px; color: #9ca3af;">Try adjusting your filters</div>
        </td>
      </tr>
    `;
    return;
  }
  
  filteredPayments.forEach(payment => {
    const row = createPaymentRow(payment);
    DOM.tableBody.appendChild(row);
  });
}

function createPaymentRow(payment) {
  const row = document.createElement('tr');
  const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
  const initials = (payment.firstName?.charAt(0) || '') + (payment.lastName?.charAt(0) || '');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(payment.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  
  let dueDateText = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  if (payment.status === 'overdue') {
    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
    dueDateText += ` (${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue)`;
  }
  
  row.innerHTML = `
    <td>
      <div class="tenant-info">
        <div class="tenant-avatar">${escapeHtml(initials)}</div>
        <div class="tenant-details">
          <div class="tenant-name">${escapeHtml(payment.tenantName)}</div>
          <div class="tenant-property">Unit ${escapeHtml(payment.unitNumber || 'N/A')}</div>
        </div>
      </div>
    </td>
    <td>${escapeHtml(propertyName)}</td>
    <td><span class="amount">₱${(payment.amount || 0).toLocaleString()}</span></td>
    <td>${dueDateText}</td>
    <td>
      <span class="status-badge status-${payment.status} status-clickable" 
            onclick="changePaymentStatus('${payment.id}')" 
            title="Click to change status">
        ${capitalize(payment.status)}
        <span class="status-edit-icon"></span>
      </span>
    </td>
    <td>
      <div class="action-buttons">
        <button class="action-btn action-btn-email" onclick="sendEmailToTenant('${payment.id}')">📧 Email</button>
        ${payment.status !== 'paid' ? `<button class="action-btn action-btn-mark" onclick="markAsPaid('${payment.id}')">Mark Paid</button>` : ''}
        <button class="action-btn action-btn-view" onclick="viewPaymentDetails('${payment.id}')">View</button>
      </div>
    </td>
  `;
  
  return row;
}

// ==================== MARK AS PAID ====================

window.markAsPaid = async function(paymentId) {
  showConfirmModal('Confirm Payment', 'Are you sure you want to mark this payment as paid? An invoice will be sent to the tenant.', async () => {
    try {
      const payment = allPayments.find(p => p.id === paymentId);
      if (!payment) return;
      
      const tenant = allTenants.find(t => t.id === payment.tenantId);
      if (!tenant) { showErrorModal('Tenant information not found'); return; }
      
      await addDoc(collection(db, "payments"), {
        landlordId: currentUser.uid, tenantId: payment.tenantId, tenantName: payment.tenantName,
        propertyId: payment.propertyId, unitNumber: payment.unitNumber, amount: payment.amount,
        dueDate: payment.dueDate, paidDate: new Date(), status: 'paid', createdAt: serverTimestamp()
      });
      
      await addDoc(collection(db, "activities"), {
        userId: currentUser.uid, type: "payment_received", title: "Payment Received",
        details: `₱${payment.amount.toLocaleString()} from ${payment.tenantName}`, icon: "💰", timestamp: serverTimestamp()
      });
      
      const emailSent = await sendPaymentInvoice(tenant, payment);
      showSuccessModal(emailSent ? 'Payment marked as paid successfully! Invoice sent to tenant.' : 'Payment marked as paid, but failed to send invoice email.');
    } catch (error) {
      console.error("Error marking payment as paid:", error);
      showErrorModal('Error updating payment. Please try again.');
    }
  });
};

// ==================== VIEW PAYMENT DETAILS ====================

window.viewPaymentDetails = function(paymentId) {
  const payment = allPayments.find(p => p.id === paymentId);
  if (!payment) return;
  
  const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
  const tenant = allTenants.find(t => t.id === payment.tenantId);
  
  const content = `
    <div class="payment-details">
      <div class="detail-row"><span class="detail-label">Tenant:</span><span class="detail-value">${escapeHtml(payment.tenantName)}</span></div>
      <div class="detail-row"><span class="detail-label">Property:</span><span class="detail-value">${escapeHtml(propertyName)}</span></div>
      <div class="detail-row"><span class="detail-label">Unit:</span><span class="detail-value">${escapeHtml(payment.unitNumber || 'N/A')}</span></div>
      <div class="detail-row"><span class="detail-label">Amount:</span><span class="detail-value">₱${payment.amount.toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Due Date:</span><span class="detail-value">${payment.dueDate.toLocaleDateString()}</span></div>
      <div class="detail-row"><span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge status-${payment.status}">${capitalize(payment.status)}</span></span></div>
      ${payment.paidDate ? `<div class="detail-row"><span class="detail-label">Paid Date:</span><span class="detail-value">${payment.paidDate.toDate ? payment.paidDate.toDate().toLocaleDateString() : new Date(payment.paidDate).toLocaleDateString()}</span></div>` : ''}
      ${tenant ? `<div class="detail-section"><h4>Contact Information</h4><div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(tenant.email || 'N/A')}</span></div><div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(tenant.phone || 'N/A')}</span></div></div>` : ''}
    </div>
  `;
  
  showInfoModal('Payment Details', content);
};

// ==================== EXPORT TO PDF ====================

function exportPayments() {
  if (filteredPayments.length === 0) { showErrorModal('No payments to export'); return; }
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  script.onload = () => generatePDF();
  script.onerror = () => showErrorModal('Failed to load PDF library. Please try again.');
  document.head.appendChild(script);
}

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(20); doc.setFont(undefined, 'bold');
  doc.text('Rent Payment Report', 105, 20, { align: 'center' });
  
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 105, 28, { align: 'center' });
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthPayments = filteredPayments.filter(p => p.month === currentMonth && p.year === currentYear);
  
  const totalExpected = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collected = currentMonthPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
  const pending = currentMonthPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdueCount = currentMonthPayments.filter(p => p.status === 'overdue').length;
  
  doc.setFillColor(240, 240, 240); doc.rect(15, 35, 180, 35, 'F');
  doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.text('Monthly Summary:', 20, 43);
  doc.setFont(undefined, 'normal');
  doc.text(`Total Expected: P${totalExpected.toLocaleString()}`, 20, 50);
  doc.text(`Collected: P${collected.toLocaleString()}`, 20, 56);
  doc.text(`Pending: P${pending.toLocaleString()}`, 100, 50);
  doc.text(`Overdue: ${overdueCount}`, 100, 56);
  doc.text(`Total Records: ${filteredPayments.length}`, 20, 64);
  
  let yPos = 80;
  doc.setFillColor(59, 130, 246); doc.rect(10, yPos - 6, 190, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont(undefined, 'bold');
  doc.text('Tenant', 12, yPos); doc.text('Property', 65, yPos); doc.text('Unit', 110, yPos);
  doc.text('Amount', 130, yPos); doc.text('Due Date', 160, yPos); doc.text('Status', 185, yPos);
  
  doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal');
  yPos += 8;
  
  filteredPayments.forEach((payment, index) => {
    if (yPos > 270) {
      doc.addPage(); yPos = 20;
      doc.setFillColor(59, 130, 246); doc.rect(10, yPos - 6, 190, 8, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold');
      doc.text('Tenant', 12, yPos); doc.text('Property', 65, yPos); doc.text('Unit', 110, yPos);
      doc.text('Amount', 130, yPos); doc.text('Due Date', 160, yPos); doc.text('Status', 185, yPos);
      doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal'); yPos += 8;
    }
    
    const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
    if (index % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(10, yPos - 5, 190, 7, 'F'); }
    
    doc.setFontSize(8);
    doc.text(payment.tenantName.length > 25 ? payment.tenantName.substring(0, 22) + '...' : payment.tenantName, 12, yPos);
    doc.text(propertyName.length > 20 ? propertyName.substring(0, 17) + '...' : propertyName, 65, yPos);
    doc.text(payment.unitNumber || 'N/A', 110, yPos);
    doc.text(`P${payment.amount.toLocaleString()}`, 130, yPos);
    doc.text(payment.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 160, yPos);
    doc.text(capitalize(payment.status), 185, yPos);
    yPos += 7;
  });
  
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(128, 128, 128);
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
    doc.text('RentEase - Property Management System', 105, 285, { align: 'center' });
  }
  
  doc.save(`rent-payments-${new Date().toISOString().split('T')[0]}.pdf`);
  showSuccessModal('Payment report exported successfully!');
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  DOM.logoutBtn.addEventListener('click', async () => {
    showConfirmModal('Confirm Logout', 'Are you sure you want to logout?', async () => {
      cleanup(); await signOut(auth); window.location.href = 'index.html';
    });
  });
  
  DOM.filterStatus.addEventListener('change', applyFilters);
  DOM.filterProperty.addEventListener('change', applyFilters);
  DOM.filterMonth.addEventListener('change', applyFilters);
  DOM.searchInput.addEventListener('input', debounce(applyFilters, 300));
  DOM.exportBtn.addEventListener('click', exportPayments);
  
  DOM.recordPaymentBtn.addEventListener('click', () => {
    showInfoModal('Record Payment', '<p>Record Payment feature coming soon!</p><p>You can mark payments as paid from the table below.</p>');
  });
}

// ==================== UTILITY FUNCTIONS ====================

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function cleanup() {
  if (tenantsUnsubscribe) tenantsUnsubscribe();
  if (propertiesUnsubscribe) propertiesUnsubscribe();
  if (paymentsUnsubscribe) paymentsUnsubscribe();
  allTenants = []; allProperties.clear(); allPayments = [];
  filteredPayments = []; paidPaymentRecords.clear();
}

window.addEventListener('beforeunload', cleanup);