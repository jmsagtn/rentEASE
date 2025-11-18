import { initializeApp as initFirebase } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, updateDoc, deleteDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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

// Plan limits
const PLAN_LIMITS = {
  freemium: { 
    maxProperties: 2, 
    maxUnitsPerProperty: 4,
    displayName: 'Free'
  },
  premium: { 
    maxProperties: 20, 
    maxUnitsPerProperty: Infinity,
    displayName: 'Premium'
  },
  platinum: { 
    maxProperties: Infinity, 
    maxUnitsPerProperty: Infinity,
    displayName: 'Platinum'
  }
};

// State management
let currentUser = null;
let userPlan = 'freemium';
let userLimits = PLAN_LIMITS.freemium;
let editingTenantId = null;
let tenantsUnsubscribe = null;
let propertiesUnsubscribe = null;
let propertiesCache = new Map();
let allTenants = [];
let filteredTenants = [];
let currentView = 'table';

// Chart instances
let charts = {
  tenantStatus: null,
  rentDistribution: null,
  leaseTimeline: null
};

// DOM Elements - Cache all at once
const DOM = {
  modal: document.getElementById('tenant-modal'),
  detailsModal: document.getElementById('tenant-details-modal'),
  expiringLeasesModal: document.getElementById('expiring-leases-modal'),
  closeModalBtn: document.getElementById('close-modal'),
  closeDetailsModalBtn: document.getElementById('close-details-modal'),
  closeExpiringModalBtn: document.getElementById('close-expiring-modal'),
  cancelBtn: document.getElementById('cancel-btn'),
  addTenantBtn: document.getElementById('add-tenant-btn'),
  tenantForm: document.getElementById('tenant-form'),
  message: document.getElementById('message'),
  tenantsContainer: document.getElementById('tenants-container'),
  modalTitle: document.getElementById('modal-title'),
  submitBtn: document.getElementById('submit-tenant-btn'),
  filterStatus: document.getElementById('filter-status'),
  filterProperty: document.getElementById('filter-property'),
  searchInput: document.getElementById('search-tenants'),
  tableViewBtn: document.getElementById('table-view-btn'),
  cardViewBtn: document.getElementById('card-view-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  planBadge: document.getElementById('plan-badge'),
  tenantCountText: document.getElementById('tenant-count-text'),
  analyticsSection: document.getElementById('analytics-section'),
  tenantStatus: document.getElementById('tenant-status'),
  tenantPhone: document.getElementById('tenant-phone')
};

// ==================== INITIALIZATION ====================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await initializeApp();
  } else {
    cleanup();
    window.location.href = 'index.html';
  }
});

async function initializeApp() {
  try {
    await loadUserData(currentUser.uid);
    await loadProperties(currentUser.uid);
    setupRealtimeTenants(currentUser.uid);
    initializeCharts();
    setupEventListeners();
    checkURLParams();
    createExpiringLeasesModal();
  } catch (error) {
    console.error("Initialization error:", error);
    showMessage('Error loading page. Please refresh.', 'error');
  }
}

// ==================== USER DATA ====================

async function loadUserData(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      userPlan = userData.plan || 'freemium';
      userLimits = PLAN_LIMITS[userPlan];

      DOM.userName.textContent = userData.username || 'User';
      DOM.userEmail.textContent = userData.email || '';
      DOM.planBadge.textContent = userLimits.displayName;
      DOM.planBadge.className = `plan-badge plan-${userPlan}`;
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    showMessage('Error loading user data. Please refresh the page.', 'error');
  }
}

// ==================== PROPERTIES ====================

async function loadProperties(uid) {
  try {
    const propertiesQuery = query(
      collection(db, "properties"),
      where("ownerId", "==", uid)
    );
    
    // Use real-time listener for properties too
    propertiesUnsubscribe = onSnapshot(propertiesQuery, (snapshot) => {
      updatePropertiesCache(snapshot);
      updatePropertyDropdowns(snapshot);
      
      // Enable/disable add button based on properties
      const hasProperties = !snapshot.empty;
      DOM.addTenantBtn.disabled = !hasProperties;
      DOM.addTenantBtn.style.opacity = hasProperties ? '1' : '0.5';
      DOM.addTenantBtn.title = hasProperties ? 'Add a new tenant' : 'Add a property first';
      
      if (!hasProperties) {
        showMessage('⚠️ Please add a property first before adding tenants.', 'error');
      }
    });
  } catch (error) {
    console.error("Error loading properties:", error);
    showMessage('Error loading properties. Please refresh.', 'error');
  }
}

function updatePropertiesCache(snapshot) {
  propertiesCache.clear();
  snapshot.forEach((doc) => {
    propertiesCache.set(doc.id, doc.data());
  });
}

function updatePropertyDropdowns(snapshot) {
  const propertySelect = document.getElementById('tenant-property');
  const propertyFilter = DOM.filterProperty;
  
  propertySelect.innerHTML = '<option value="">Select a property</option>';
  propertyFilter.innerHTML = '<option value="all">All Properties</option>';
  
  snapshot.forEach((doc) => {
    const property = doc.data();
    
    const option1 = new Option(property.name, doc.id);
    const option2 = new Option(property.name, doc.id);
    
    propertySelect.add(option1);
    propertyFilter.add(option2);
  });
}

// ==================== TENANTS ====================

function setupRealtimeTenants(uid) {
  const tenantsQuery = query(
    collection(db, "tenants"),
    where("landlordId", "==", uid)
  );
  
  tenantsUnsubscribe = onSnapshot(
    tenantsQuery,
    (snapshot) => {
      // Update tenants array
      allTenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Update all dependent UI
      updateStats();
      applyFilters();
      updateCharts();
      toggleAnalyticsSection();
    },
    (error) => {
      console.error("Error loading tenants:", error);
      showMessage('Error loading tenants. Please refresh the page.', 'error');
    }
  );
}

// ==================== STATISTICS ====================

function updateStats() {
  const totalTenants = allTenants.length;
  const activeTenants = allTenants.filter(t => t.status === 'active').length;
  const monthlyRevenue = allTenants
    .filter(t => t.status === 'active')
    .reduce((sum, t) => sum + (t.monthlyRent || 0), 0);
  
  // Calculate expiring leases (next 30 days)
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringLeases = allTenants.filter(t => {
    if (!t.leaseEndDate?.toDate) return false;
    const leaseEnd = t.leaseEndDate.toDate();
    return leaseEnd >= today && leaseEnd <= thirtyDaysFromNow && t.status === 'active';
  }).length;

  document.getElementById('total-tenants-stat').textContent = totalTenants;
  document.getElementById('active-tenants-stat').textContent = activeTenants;
  document.getElementById('monthly-revenue-stat').textContent = `₱${monthlyRevenue.toLocaleString()}`;
  
  const expiringElement = document.getElementById('expiring-leases-stat');
  expiringElement.textContent = expiringLeases;
  
  // Make expiring leases clickable
  const expiringCard = expiringElement.closest('.stat-card');
  if (expiringCard) {
    expiringCard.style.cursor = expiringLeases > 0 ? 'pointer' : 'default';
    expiringCard.onclick = expiringLeases > 0 ? showExpiringLeases : null;
  }
  
  DOM.tenantCountText.textContent = `(${totalTenants} ${totalTenants === 1 ? 'tenant' : 'tenants'})`;
}

// ==================== EXPIRING LEASES MODAL ====================

function createExpiringLeasesModal() {
  // Check if modal already exists
  if (document.getElementById('expiring-leases-modal')) return;
  
  const modalHTML = `
    <div id="expiring-leases-modal" class="modal">
      <div class="modal-overlay"></div>
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header">
          <h2>⏰ Expiring Leases (Next 30 Days)</h2>
          <button id="close-expiring-modal" class="close-modal">&times;</button>
        </div>
        <div id="expiring-leases-content" class="modal-body" style="max-height: 500px; overflow-y: auto;">
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  DOM.expiringLeasesModal = document.getElementById('expiring-leases-modal');
  DOM.closeExpiringModalBtn = document.getElementById('close-expiring-modal');
  
  DOM.closeExpiringModalBtn.addEventListener('click', closeExpiringLeasesModal);
  DOM.expiringLeasesModal.addEventListener('click', (e) => {
    if (e.target === DOM.expiringLeasesModal || e.target.classList.contains('modal-overlay')) {
      closeExpiringLeasesModal();
    }
  });
}

function showExpiringLeases() {
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const expiringTenants = allTenants
    .filter(t => {
      if (!t.leaseEndDate?.toDate || t.status !== 'active') return false;
      const leaseEnd = t.leaseEndDate.toDate();
      return leaseEnd >= today && leaseEnd <= thirtyDaysFromNow;
    })
    .sort((a, b) => a.leaseEndDate.toDate() - b.leaseEndDate.toDate());
  
  const content = document.getElementById('expiring-leases-content');
  
  if (expiringTenants.length === 0) {
    content.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
        <h3 style="color: #6b7280;">No Expiring Leases</h3>
        <p style="color: #9ca3af;">All leases are valid for more than 30 days</p>
      </div>
    `;
  } else {
    content.innerHTML = `
      <table class="tenants-table" style="margin: 0;">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Property</th>
            <th>Unit</th>
            <th>Lease End Date</th>
            <th>Days Until Expiry</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${expiringTenants.map(tenant => {
            const { fullName } = getTenantNames(tenant);
            const propertyName = getPropertyName(tenant.propertyId);
            const leaseEndDate = tenant.leaseEndDate.toDate();
            const daysUntil = Math.ceil((leaseEndDate - today) / (1000 * 60 * 60 * 24));
            const urgencyClass = daysUntil <= 7 ? 'urgent' : daysUntil <= 14 ? 'warning' : 'normal';
            
            return `
              <tr>
                <td>${escapeHtml(fullName)}</td>
                <td>${escapeHtml(propertyName)}</td>
                <td>${escapeHtml(tenant.unitNumber || 'N/A')}</td>
                <td>${leaseEndDate.toLocaleDateString()}</td>
                <td>
                  <span class="expiry-badge expiry-${urgencyClass}">
                    ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}
                  </span>
                </td>
                <td>
                  <div class="action-buttons">
                    <button class="btn-icon" onclick="viewTenantDetails('${tenant.id}')" title="View">👁️</button>
                    <button class="btn-icon" onclick="editTenant('${tenant.id}')" title="Edit">✏️</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <style>
        .expiry-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .expiry-urgent {
          background: #fee2e2;
          color: #991b1b;
        }
        .expiry-warning {
          background: #fef3c7;
          color: #92400e;
        }
        .expiry-normal {
          background: #dbeafe;
          color: #1e40af;
        }
      </style>
    `;
  }
  
  DOM.expiringLeasesModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeExpiringLeasesModal() {
  DOM.expiringLeasesModal.classList.remove('active');
  document.body.style.overflow = '';
}

// ==================== FILTERS ====================

function applyFilters() {
  const statusFilter = DOM.filterStatus.value;
  const propertyFilter = DOM.filterProperty.value;
  const searchTerm = DOM.searchInput.value.toLowerCase().trim();

  filteredTenants = allTenants.filter(tenant => {
    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
    const matchesProperty = propertyFilter === 'all' || tenant.propertyId === propertyFilter;
    
    if (!matchesStatus || !matchesProperty) return false;
    
    // Search optimization - early return if no search term
    if (!searchTerm) return true;
    
    const fullName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.toLowerCase();
    const email = (tenant.email || '').toLowerCase();
    const phone = (tenant.phone || '').toLowerCase();
    
    return fullName.includes(searchTerm) || email.includes(searchTerm) || phone.includes(searchTerm);
  });

  renderTenants();
}

// ==================== RENDERING ====================

function renderTenants() {
  DOM.tenantsContainer.innerHTML = '';

  if (filteredTenants.length === 0) {
    renderEmptyState();
    return;
  }

  currentView === 'table' ? renderTableView() : renderCardView();
}

function renderEmptyState() {
  const emptyMessage = allTenants.length === 0 
    ? 'No tenants yet. Start by adding your first tenant!'
    : 'No tenants match your filters.';
    
  DOM.tenantsContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">👥</div>
      <h3>${allTenants.length === 0 ? 'No Tenants Yet' : 'No Results Found'}</h3>
      <p>${emptyMessage}</p>
    </div>
  `;
}

function renderTableView() {
  const table = document.createElement('div');
  table.className = 'tenants-table-container';
  table.innerHTML = `
    <table class="tenants-table">
      <thead>
        <tr>
          <th>Tenant</th>
          <th>Contact</th>
          <th>Property</th>
          <th>Unit</th>
          <th>Rent</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="tenants-tbody"></tbody>
    </table>
  `;
  
  DOM.tenantsContainer.appendChild(table);
  const tbody = document.getElementById('tenants-tbody');
  
  // Use document fragment for better performance
  const fragment = document.createDocumentFragment();
  filteredTenants.forEach((tenant) => {
    fragment.appendChild(createTenantRow(tenant));
  });
  tbody.appendChild(fragment);
}

function createTenantRow(tenant) {
  const row = document.createElement('tr');
  const propertyName = getPropertyName(tenant.propertyId);
  const { initials, fullName } = getTenantNames(tenant);

  row.innerHTML = `
    <td>
      <div class="tenant-name" onclick="viewTenantDetails('${tenant.id}')">
        <div class="tenant-avatar">${escapeHtml(initials)}</div>
        <div>${escapeHtml(fullName)}</div>
      </div>
    </td>
    <td>
      <div>${escapeHtml(tenant.email || 'N/A')}</div>
      <div style="font-size: 12px; color: #999;">${escapeHtml(tenant.phone || 'N/A')}</div>
    </td>
    <td>${escapeHtml(propertyName)}</td>
    <td>${escapeHtml(tenant.unitNumber || 'N/A')}</td>
    <td style="font-weight: 600;">₱${(tenant.monthlyRent || 0).toLocaleString()}</td>
    <td>
      <span class="status-badge status-${tenant.status || 'active'}">
        ${capitalize(tenant.status || 'active')}
      </span>
    </td>
    <td>
      <div class="action-buttons">
        <button class="btn-icon" onclick="viewTenantDetails('${tenant.id}')" title="View">👁️</button>
        <button class="btn-icon" onclick="editTenant('${tenant.id}')" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteTenant('${tenant.id}', '${escapeHtml(fullName)}')" title="Delete">🗑️</button>
      </div>
    </td>
  `;
  
  return row;
}

function renderCardView() {
  const container = document.createElement('div');
  container.className = 'tenants-cards-container';
  
  // Use document fragment for better performance
  const fragment = document.createDocumentFragment();
  filteredTenants.forEach((tenant) => {
    fragment.appendChild(createTenantCard(tenant));
  });
  container.appendChild(fragment);
  
  DOM.tenantsContainer.appendChild(container);
}

function createTenantCard(tenant) {
  const card = document.createElement('div');
  card.className = 'tenant-card';
  const propertyName = getPropertyName(tenant.propertyId);
  const { initials, fullName } = getTenantNames(tenant);

  card.innerHTML = `
    <div class="tenant-card-header">
      <div class="tenant-card-avatar">${escapeHtml(initials)}</div>
      <div class="tenant-card-info">
        <div class="tenant-card-name" onclick="viewTenantDetails('${tenant.id}')">${escapeHtml(fullName)}</div>
        <div class="tenant-card-contact">${escapeHtml(tenant.email || 'N/A')}</div>
        <span class="status-badge status-${tenant.status || 'active'}" style="margin-top: 8px;">
          ${capitalize(tenant.status || 'active')}
        </span>
      </div>
    </div>
    
    <div class="tenant-card-details">
      <div class="detail-item">
        <span class="detail-label">Property</span>
        <span class="detail-value">${escapeHtml(propertyName)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Unit</span>
        <span class="detail-value">${escapeHtml(tenant.unitNumber || 'N/A')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Monthly Rent</span>
        <span class="detail-value">₱${(tenant.monthlyRent || 0).toLocaleString()}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Phone</span>
        <span class="detail-value">${escapeHtml(tenant.phone || 'N/A')}</span>
      </div>
    </div>
    
    <div class="tenant-card-actions">
      <button class="btn-card-action btn-view" onclick="viewTenantDetails('${tenant.id}')">
        👁️ View
      </button>
      <button class="btn-card-action btn-edit" onclick="editTenant('${tenant.id}')">
        ✏️ Edit
      </button>
      <button class="btn-card-action btn-delete" onclick="deleteTenant('${tenant.id}', '${escapeHtml(fullName)}')">
        🗑️ Delete
      </button>
    </div>
  `;
  
  return card;
}

// ==================== TENANT DETAILS ====================

window.viewTenantDetails = function(tenantId) {
  const tenant = allTenants.find(t => t.id === tenantId);
  if (!tenant) return;

  const { fullName } = getTenantNames(tenant);
  const propertyName = getPropertyName(tenant.propertyId);
  const moveInDate = formatDate(tenant.moveInDate);
  const leaseEndDate = formatDate(tenant.leaseEndDate);

  document.getElementById('details-tenant-name').textContent = fullName;
  
  const detailsContent = document.getElementById('tenant-details-content');
  detailsContent.innerHTML = `
    <div class="detail-section">
      <h3>👤 Personal Information</h3>
      <div class="detail-row">
        <div class="detail-label">Full Name:</div>
        <div class="detail-value">${escapeHtml(fullName)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Email:</div>
        <div class="detail-value">${escapeHtml(tenant.email || 'N/A')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Phone:</div>
        <div class="detail-value">${escapeHtml(tenant.phone || 'N/A')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Status:</div>
        <div class="detail-value">
          <span class="status-badge status-${tenant.status || 'active'}">${capitalize(tenant.status || 'active')}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>🏠 Rental Information</h3>
      <div class="detail-row">
        <div class="detail-label">Property:</div>
        <div class="detail-value">${escapeHtml(propertyName)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Unit/Room:</div>
        <div class="detail-value">${escapeHtml(tenant.unitNumber || 'N/A')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Monthly Rent:</div>
        <div class="detail-value">₱${(tenant.monthlyRent || 0).toLocaleString()}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Security Deposit:</div>
        <div class="detail-value">₱${(tenant.securityDeposit || 0).toLocaleString()}</div>
      </div>
    </div>

    <div class="detail-section">
      <h3>📅 Lease Details</h3>
      <div class="detail-row">
        <div class="detail-label">Move-in Date:</div>
        <div class="detail-value">${moveInDate}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Lease End Date:</div>
        <div class="detail-value">${leaseEndDate}</div>
      </div>
    </div>
  `;

  DOM.detailsModal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

// ==================== EDIT TENANT ====================

window.editTenant = function(tenantId) {
  const tenant = allTenants.find(t => t.id === tenantId);
  
  if (tenant) {
    editingTenantId = tenantId;
    
    document.getElementById('tenant-firstname').value = tenant.firstName || '';
    document.getElementById('tenant-lastname').value = tenant.lastName || '';
    document.getElementById('tenant-email').value = tenant.email || '';
    document.getElementById('tenant-phone').value = tenant.phone || '';
    document.getElementById('tenant-property').value = tenant.propertyId || '';
    document.getElementById('tenant-unit').value = tenant.unitNumber || '';
    document.getElementById('tenant-rent').value = tenant.monthlyRent || '';
    document.getElementById('tenant-deposit').value = tenant.securityDeposit || '';
    document.getElementById('tenant-status').value = tenant.status || 'active';
    
    if (tenant.moveInDate?.toDate) {
      document.getElementById('tenant-movein').value = tenant.moveInDate.toDate().toISOString().split('T')[0];
    }
    
    if (tenant.leaseEndDate?.toDate) {
      document.getElementById('tenant-lease-end').value = tenant.leaseEndDate.toDate().toISOString().split('T')[0];
    }
    
    openModal(true);
  }
};

// ==================== DELETE TENANT ====================

window.deleteTenant = async function(tenantId, tenantName) {
  if (!confirm(`Are you sure you want to remove ${tenantName}?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "tenants", tenantId));

    await addDoc(collection(db, "activities"), {
      userId: currentUser.uid,
      type: "tenant_removed",
      title: "Tenant Removed",
      details: `${tenantName} was removed`,
      icon: "👋",
      timestamp: serverTimestamp()
    });

    showMessage(`✅ Tenant "${tenantName}" removed successfully!`, 'success');
  } catch (error) {
    console.error("Error deleting tenant:", error);
    showMessage('❌ Error removing tenant. Please try again.', 'error');
  }
};

// ==================== FORM SUBMISSION ====================

DOM.tenantForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validate phone number
  const phone = DOM.tenantPhone.value.trim();
  if (phone && phone.length !== 11) {
    showMessage('⚠️ Phone number must be exactly 11 digits.', 'error');
    DOM.tenantPhone.focus();
    return;
  }

  const tenantData = {
    firstName: document.getElementById('tenant-firstname').value.trim(),
    lastName: document.getElementById('tenant-lastname').value.trim(),
    email: document.getElementById('tenant-email').value.trim(),
    phone: phone,
    propertyId: document.getElementById('tenant-property').value,
    unitNumber: document.getElementById('tenant-unit').value.trim(),
    monthlyRent: parseFloat(document.getElementById('tenant-rent').value),
    securityDeposit: parseFloat(document.getElementById('tenant-deposit').value) || 0,
    moveInDate: new Date(document.getElementById('tenant-movein').value),
    leaseEndDate: document.getElementById('tenant-lease-end').value 
      ? new Date(document.getElementById('tenant-lease-end').value) 
      : null,
    status: document.getElementById('tenant-status').value
  };

  DOM.submitBtn.disabled = true;
  DOM.submitBtn.textContent = editingTenantId ? 'Updating...' : 'Adding...';

  try {
    if (editingTenantId) {
      await updateDoc(doc(db, "tenants", editingTenantId), {
        ...tenantData,
        updatedAt: serverTimestamp()
      });
      showMessage('✅ Tenant updated successfully!', 'success');
    } else {
      tenantData.landlordId = currentUser.uid;
      tenantData.createdAt = serverTimestamp();
      await addDoc(collection(db, "tenants"), tenantData);

      await addDoc(collection(db, "activities"), {
        userId: currentUser.uid,
        type: "tenant_added",
        title: "New Tenant Added",
        details: `${tenantData.firstName} ${tenantData.lastName} moved in`,
        icon: "👤",
        timestamp: serverTimestamp()
      });

      showMessage('✅ Tenant added successfully!', 'success');
    }

    closeModal();
  } catch (error) {
    console.error("Error saving tenant:", error);
    showMessage('❌ Error saving tenant. Please try again.', 'error');
  } finally {
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.textContent = editingTenantId ? 'Update Tenant' : 'Add Tenant';
  }
});

// ==================== MODAL FUNCTIONS ====================

function openModal(isEdit = false) {
  DOM.modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  if (isEdit) {
    DOM.modalTitle.textContent = 'Edit Tenant';
    DOM.submitBtn.textContent = 'Update Tenant';
  } else {
    DOM.modalTitle.textContent = 'Add New Tenant';
    DOM.submitBtn.textContent = 'Add Tenant';
    DOM.tenantForm.reset();
    editingTenantId = null;
  }
}

function closeModal() {
  DOM.modal.classList.remove('active');
  document.body.style.overflow = '';
  DOM.tenantForm.reset();
  editingTenantId = null;
}

function closeDetailsModal() {
  DOM.detailsModal.classList.remove('active');
  document.body.style.overflow = '';
}

// ==================== CHARTS ====================

function initializeCharts() {
  const chartColors = {
    primary: '#2fc4b2',
    secondary: '#107266',
    success: '#10b981',
    danger: '#ef4444',
    colors: ['#2fc4b2', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']
  };

  const tenantStatusCtx = document.getElementById('tenantStatusChart');
  if (tenantStatusCtx) {
    charts.tenantStatus = new Chart(tenantStatusCtx, {
      type: 'pie',
      data: {
        labels: ['Active', 'Inactive'],
        datasets: [{
          data: [0, 0],
          backgroundColor: [chartColors.success, chartColors.danger],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  const rentDistributionCtx = document.getElementById('rentDistributionChart');
  if (rentDistributionCtx) {
    charts.rentDistribution = new Chart(rentDistributionCtx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: chartColors.colors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  const leaseTimelineCtx = document.getElementById('leaseTimelineChart');
  if (leaseTimelineCtx) {
    charts.leaseTimeline = new Chart(leaseTimelineCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'New Tenants',
          data: [],
          backgroundColor: chartColors.primary,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}

function updateCharts() {
  if (!allTenants.length) return;

  // Tenant Status Chart
  if (charts.tenantStatus) {
    const active = allTenants.filter(t => t.status === 'active').length;
    const inactive = allTenants.length - active;
    charts.tenantStatus.data.datasets[0].data = [active, inactive];
    charts.tenantStatus.update('none'); // Disable animation for performance
  }

  // Rent Distribution Chart
  if (charts.rentDistribution) {
    const rentByProperty = {};
    allTenants.forEach(t => {
      if (t.status === 'active' && t.propertyId) {
        const propName = getPropertyName(t.propertyId);
        rentByProperty[propName] = (rentByProperty[propName] || 0) + (t.monthlyRent || 0);
      }
    });
    
    charts.rentDistribution.data.labels = Object.keys(rentByProperty);
    charts.rentDistribution.data.datasets[0].data = Object.values(rentByProperty);
    charts.rentDistribution.update('none');
  }

  // Lease Timeline Chart
  if (charts.leaseTimeline) {
    const last6Months = getLast6Months();
    const tenantsByMonth = new Array(6).fill(0);
    
    allTenants.forEach(t => {
      if (t.moveInDate?.toDate) {
        const moveIn = t.moveInDate.toDate();
        const monthIndex = last6Months.findIndex(m => {
          const [month, year] = m.split(' ');
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthNum = monthNames.indexOf(month);
          return moveIn.getMonth() === monthNum && moveIn.getFullYear() === parseInt(year);
        });
        if (monthIndex !== -1) tenantsByMonth[monthIndex]++;
      }
    });
    
    charts.leaseTimeline.data.labels = last6Months;
    charts.leaseTimeline.data.datasets[0].data = tenantsByMonth;
    charts.leaseTimeline.update('none');
  }
}

function getLast6Months() {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const result = [];
  const today = new Date();
  
  for (let i = 5; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    result.push(`${monthNames[date.getMonth()]} ${date.getFullYear()}`);
  }
  
  return result;
}

function toggleAnalyticsSection() {
  DOM.analyticsSection.style.display = allTenants.length > 0 ? 'block' : 'none';
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Modal events
  DOM.addTenantBtn.addEventListener('click', () => {
    if (!DOM.addTenantBtn.disabled) openModal(false);
  });
  
  DOM.closeModalBtn.addEventListener('click', closeModal);
  DOM.closeDetailsModalBtn.addEventListener('click', closeDetailsModal);
  DOM.cancelBtn.addEventListener('click', closeModal);
  
  DOM.modal.addEventListener('click', (e) => {
    if (e.target === DOM.modal) closeModal();
  });
  
  DOM.detailsModal.addEventListener('click', (e) => {
    if (e.target === DOM.detailsModal) closeDetailsModal();
  });
  
  // Phone number validation - only allow numbers and limit to 11 digits
  DOM.tenantPhone.addEventListener('input', (e) => {
    // Remove non-numeric characters
    let value = e.target.value.replace(/\D/g, '');
    // Limit to 11 digits
    if (value.length > 11) {
      value = value.slice(0, 11);
    }
    e.target.value = value;
  });
  
  // Filter events - use debouncing for search
  DOM.filterStatus.addEventListener('change', applyFilters);
  DOM.filterProperty.addEventListener('change', applyFilters);
  DOM.searchInput.addEventListener('input', debounce(applyFilters, 300));
  
  // View toggle events
  DOM.tableViewBtn.addEventListener('click', () => {
    currentView = 'table';
    DOM.tableViewBtn.classList.add('active');
    DOM.cardViewBtn.classList.remove('active');
    renderTenants();
  });
  
  DOM.cardViewBtn.addEventListener('click', () => {
    currentView = 'card';
    DOM.cardViewBtn.classList.add('active');
    DOM.tableViewBtn.classList.remove('active');
    renderTenants();
  });
  
  // Logout
  DOM.logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
      cleanup();
      await signOut(auth);
      window.location.href = 'index.html';
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.modal.classList.contains('active')) closeModal();
      if (DOM.detailsModal.classList.contains('active')) closeDetailsModal();
      if (DOM.expiringLeasesModal && DOM.expiringLeasesModal.classList.contains('active')) closeExpiringLeasesModal();
    }
  });
}

// ==================== UTILITY FUNCTIONS ====================

function getPropertyName(propertyId) {
  if (!propertyId || !propertiesCache.has(propertyId)) return 'N/A';
  return propertiesCache.get(propertyId).name;
}

function getTenantNames(tenant) {
  const firstName = tenant.firstName || '';
  const lastName = tenant.lastName || '';
  const initials = (firstName.charAt(0) || '') + (lastName.charAt(0) || '');
  const fullName = `${firstName} ${lastName}`.trim() || 'N/A';
  return { initials, fullName };
}

function formatDate(dateField) {
  if (!dateField?.toDate) return 'N/A';
  return dateField.toDate().toLocaleDateString();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(text, type) {
  DOM.message.textContent = text;
  DOM.message.className = `message ${type} show`;
  
  setTimeout(() => {
    DOM.message.classList.remove('show');
  }, 5000);
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

function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'add' && !DOM.addTenantBtn.disabled) {
    openModal(false);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function cleanup() {
  if (tenantsUnsubscribe) tenantsUnsubscribe();
  if (propertiesUnsubscribe) propertiesUnsubscribe();
  
  // Destroy charts
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
  });
  
  // Clear caches
  propertiesCache.clear();
  allTenants = [];
  filteredTenants = [];
}

// Clean up on page unload
window.addEventListener('beforeunload', cleanup);