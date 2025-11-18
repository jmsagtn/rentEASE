import { initializeApp as initFirebase } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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
let paidPaymentRecords = new Map(); // Store actual payment records from Firebase
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

// ==================== MODAL SYSTEM ====================

function createModal(title, content, type = 'info') {
  const existingModal = document.querySelector('.custom-modal-overlay');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'custom-modal-overlay';
  
  const iconMap = {
    'success': '✅',
    'error': '❌',
    'info': 'ℹ️',
    'warning': '⚠️',
    'confirm': '❓'
  };

  modal.innerHTML = `
    <div class="custom-modal">
      <div class="modal-header ${type}">
        <span class="modal-icon">${iconMap[type]}</span>
        <h3 class="modal-title">${title}</h3>
      </div>
      <div class="modal-body">
        ${content}
      </div>
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
  confirmBtn.onclick = () => {
    closeModal(modal);
    onConfirm();
  };
  
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

// ==================== USER DATA ====================

async function loadUserData() {
  try {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      DOM.userNameEl.textContent = userData.username || 'User';
      DOM.userEmailEl.textContent = userData.email || currentUser.email || '';
    }
  } catch (error) {
    console.error("Error loading user data:", error);
  }
}

// ==================== LOAD PAID PAYMENTS ====================

async function loadPaidPayments() {
  try {
    const paymentsQuery = query(
      collection(db, "payments"),
      where("landlordId", "==", currentUser.uid)
    );
    
    paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      paidPaymentRecords.clear();
      
      snapshot.forEach((doc) => {
        const payment = doc.data();
        // Create a key based on tenant and due date
        const dueDate = payment.dueDate?.toDate ? payment.dueDate.toDate() : new Date(payment.dueDate);
        const key = `${payment.tenantId}_${dueDate.getTime()}`;
        paidPaymentRecords.set(key, {
          id: doc.id,
          ...payment
        });
      });
      
      // Regenerate payments with updated paid status
      if (allTenants.length > 0) {
        generatePayments();
      }
    });
  } catch (error) {
    console.error("Error loading paid payments:", error);
  }
}

// ==================== PROPERTIES ====================

async function loadProperties() {
  try {
    const propertiesQuery = query(
      collection(db, "properties"),
      where("ownerId", "==", currentUser.uid)
    );
    
    propertiesUnsubscribe = onSnapshot(propertiesQuery, (snapshot) => {
      allProperties.clear();
      
      // Update property filter dropdown
      DOM.filterProperty.innerHTML = '<option value="all">All Properties</option>';
      
      snapshot.forEach((doc) => {
        const property = doc.data();
        allProperties.set(doc.id, property);
        
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = property.name;
        DOM.filterProperty.appendChild(option);
      });
      
      // Regenerate payments if tenants are loaded
      if (allTenants.length > 0) {
        generatePayments();
      }
    });
  } catch (error) {
    console.error("Error loading properties:", error);
  }
}

// ==================== TENANTS ====================

async function loadTenants() {
  try {
    const tenantsQuery = query(
      collection(db, "tenants"),
      where("landlordId", "==", currentUser.uid)
    );
    
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
      
      // Get the day of month when rent is due
      const dueDay = moveInDate.getDate();
      
      // Generate payments for last 6 months and next 3 months
      for (let monthOffset = -6; monthOffset <= 3; monthOffset++) {
        const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset, dueDay);
        
        // Skip if outside lease period
        if (dueDate < moveInDate || dueDate > leaseEndDate) continue;
        
        // Create payment ID
        const paymentId = `${tenant.id}_${dueDate.getTime()}`;
        
        // Check if this payment exists in paid records
        const paidRecord = paidPaymentRecords.get(paymentId);
        
        // Determine status
        let status = 'pending';
        
        if (paidRecord && paidRecord.status === 'paid') {
          status = 'paid';
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(dueDate);
          due.setHours(0, 0, 0, 0);
          
          if (due < today) {
            const daysPastDue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
            status = daysPastDue > 5 ? 'overdue' : 'pending';
          } else if (due.getTime() === today.getTime()) {
            status = 'pending';
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
  
  // Sort by due date (newest first)
  allPayments.sort((a, b) => b.dueDate - a.dueDate);
  
  applyFilters();
  updateStats();
}

// ==================== STATISTICS ====================

function updateStats() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const currentMonthPayments = allPayments.filter(p => 
    p.month === currentMonth && p.year === currentYear
  );
  
  const totalExpected = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collected = currentMonthPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const pending = currentMonthPayments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
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
    // Status filter
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    
    // Property filter
    const matchesProperty = propertyFilter === 'all' || payment.propertyId === propertyFilter;
    
    // Month filter
    let matchesMonth = true;
    if (monthFilter === 'current') {
      matchesMonth = payment.month === currentMonth && payment.year === currentYear;
    } else if (monthFilter === 'last') {
      matchesMonth = payment.month === lastMonth && payment.year === lastMonthYear;
    }
    
    // Search filter
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
    <td><span class="status-badge status-${payment.status}">${capitalize(payment.status)}</span></td>
    <td>
      <div class="action-buttons">
        ${payment.status !== 'paid' ? `
          <button class="action-btn action-btn-mark" onclick="markAsPaid('${payment.id}')">Mark Paid</button>
        ` : ''}
        <button class="action-btn action-btn-view" onclick="viewPaymentDetails('${payment.id}')">View</button>
      </div>
    </td>
  `;
  
  return row;
}

// ==================== MARK AS PAID ====================

window.markAsPaid = async function(paymentId) {
  showConfirmModal(
    'Confirm Payment',
    'Are you sure you want to mark this payment as paid?',
    async () => {
      try {
        const payment = allPayments.find(p => p.id === paymentId);
        if (!payment) return;
        
        // Store in Firestore payments collection for persistence
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
        
        // Log activity
        await addDoc(collection(db, "activities"), {
          userId: currentUser.uid,
          type: "payment_received",
          title: "Payment Received",
          details: `₱${payment.amount.toLocaleString()} from ${payment.tenantName}`,
          icon: "💰",
          timestamp: serverTimestamp()
        });
        
        showSuccessModal('Payment marked as paid successfully!');
      } catch (error) {
        console.error("Error marking payment as paid:", error);
        showErrorModal('Error updating payment. Please try again.');
      }
    }
  );
};

// ==================== VIEW PAYMENT DETAILS ====================

window.viewPaymentDetails = function(paymentId) {
  const payment = allPayments.find(p => p.id === paymentId);
  if (!payment) return;
  
  const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
  const tenant = allTenants.find(t => t.id === payment.tenantId);
  
  const content = `
    <div class="payment-details">
      <div class="detail-row">
        <span class="detail-label">Tenant:</span>
        <span class="detail-value">${escapeHtml(payment.tenantName)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Property:</span>
        <span class="detail-value">${escapeHtml(propertyName)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Unit:</span>
        <span class="detail-value">${escapeHtml(payment.unitNumber || 'N/A')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount:</span>
        <span class="detail-value">₱${payment.amount.toLocaleString()}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Due Date:</span>
        <span class="detail-value">${payment.dueDate.toLocaleDateString()}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status:</span>
        <span class="detail-value"><span class="status-badge status-${payment.status}">${capitalize(payment.status)}</span></span>
      </div>
      ${payment.paidDate ? `
      <div class="detail-row">
        <span class="detail-label">Paid Date:</span>
        <span class="detail-value">${payment.paidDate.toDate ? payment.paidDate.toDate().toLocaleDateString() : new Date(payment.paidDate).toLocaleDateString()}</span>
      </div>
      ` : ''}
      ${tenant ? `
        <div class="detail-section">
          <h4>Contact Information</h4>
          <div class="detail-row">
            <span class="detail-label">Email:</span>
            <span class="detail-value">${escapeHtml(tenant.email || 'N/A')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Phone:</span>
            <span class="detail-value">${escapeHtml(tenant.phone || 'N/A')}</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;
  
  showInfoModal('Payment Details', content);
};

// ==================== EXPORT TO PDF ====================

function exportPayments() {
  if (filteredPayments.length === 0) {
    showErrorModal('No payments to export');
    return;
  }

  // Load jsPDF from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  script.onload = () => generatePDF();
  script.onerror = () => showErrorModal('Failed to load PDF library. Please try again.');
  document.head.appendChild(script);
}

function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('Rent Payment Report', 105, 20, { align: 'center' });
  
  // Date range info
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const dateStr = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  doc.text(`Generated on: ${dateStr}`, 105, 28, { align: 'center' });
  
  // Summary statistics
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthPayments = filteredPayments.filter(p => 
    p.month === currentMonth && p.year === currentYear
  );
  
  const totalExpected = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collected = currentMonthPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const pending = currentMonthPayments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdueCount = currentMonthPayments.filter(p => p.status === 'overdue').length;
  
  // Summary box
  doc.setFillColor(240, 240, 240);
  doc.rect(15, 35, 180, 35, 'F');
  
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Monthly Summary:', 20, 43);
  doc.setFont(undefined, 'normal');
  
  // Use PHP or P instead of peso sign to avoid encoding issues
  doc.text(`Total Expected: P${totalExpected.toLocaleString()}`, 20, 50);
  doc.text(`Collected: P${collected.toLocaleString()}`, 20, 56);
  doc.text(`Pending: P${pending.toLocaleString()}`, 100, 50);
  doc.text(`Overdue: ${overdueCount}`, 100, 56);
  
  doc.text(`Total Records: ${filteredPayments.length}`, 20, 64);
  
  // Table header - wider spacing
  let yPos = 80;
  doc.setFillColor(59, 130, 246);
  doc.rect(10, yPos - 6, 190, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Tenant', 12, yPos);
  doc.text('Property', 65, yPos);
  doc.text('Unit', 110, yPos);
  doc.text('Amount', 130, yPos);
  doc.text('Due Date', 160, yPos);
  doc.text('Status', 185, yPos);
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  
  // Table rows
  yPos += 8;
  filteredPayments.forEach((payment, index) => {
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
      
      // Repeat header on new page
      doc.setFillColor(59, 130, 246);
      doc.rect(10, yPos - 6, 190, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      doc.text('Tenant', 12, yPos);
      doc.text('Property', 65, yPos);
      doc.text('Unit', 110, yPos);
      doc.text('Amount', 130, yPos);
      doc.text('Due Date', 160, yPos);
      doc.text('Status', 185, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      yPos += 8;
    }
    
    const propertyName = allProperties.get(payment.propertyId)?.name || 'N/A';
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(10, yPos - 5, 190, 7, 'F');
    }
    
    doc.setFontSize(8);
    
    // Truncate long names properly
    const tenantName = payment.tenantName.length > 25 
      ? payment.tenantName.substring(0, 22) + '...' 
      : payment.tenantName;
    const propName = propertyName.length > 20 
      ? propertyName.substring(0, 17) + '...' 
      : propertyName;
    
    doc.text(tenantName, 12, yPos);
    doc.text(propName, 65, yPos);
    doc.text(payment.unitNumber || 'N/A', 110, yPos);
    // Use P instead of peso sign
    doc.text(`P${payment.amount.toLocaleString()}`, 130, yPos);
    doc.text(payment.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 160, yPos);
    doc.text(capitalize(payment.status), 185, yPos);
    
    yPos += 7;
  });
  
  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
    doc.text('RentEase - Property Management System', 105, 285, { align: 'center' });
  }
  
  // Save PDF
  const fileName = `rent-payments-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  showSuccessModal('Payment report exported successfully!');
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Logout
  DOM.logoutBtn.addEventListener('click', async () => {
    showConfirmModal(
      'Confirm Logout',
      'Are you sure you want to logout?',
      async () => {
        cleanup();
        await signOut(auth);
        window.location.href = 'index.html';
      }
    );
  });
  
  // Filters
  DOM.filterStatus.addEventListener('change', applyFilters);
  DOM.filterProperty.addEventListener('change', applyFilters);
  DOM.filterMonth.addEventListener('change', applyFilters);
  DOM.searchInput.addEventListener('input', debounce(applyFilters, 300));
  
  // Export
  DOM.exportBtn.addEventListener('click', exportPayments);
  
  // Record Payment
  DOM.recordPaymentBtn.addEventListener('click', () => {
    showInfoModal(
      'Record Payment',
      '<p>Record Payment feature coming soon!</p><p>You can mark payments as paid from the table below.</p>'
    );
  });
}

// ==================== UTILITY FUNCTIONS ====================

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function cleanup() {
  if (tenantsUnsubscribe) tenantsUnsubscribe();
  if (propertiesUnsubscribe) propertiesUnsubscribe();
  if (paymentsUnsubscribe) paymentsUnsubscribe();
  allTenants = [];
  allProperties.clear();
  allPayments = [];
  filteredPayments = [];
  paidPaymentRecords.clear();
}

window.addEventListener('beforeunload', cleanup);