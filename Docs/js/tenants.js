import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ✅ FIXED: Plan limits using correct naming
const PLAN_LIMITS = {
  freemium: { 
    maxProperties: 2, 
    maxUnitsPerProperty: 4,
    displayName: 'Free'
  },
  premium: { 
    maxProperties: 20, 
    maxUnitsPerProperty: Infinity,
    displayName: 'Pro'
  },
  platinum: { 
    maxProperties: Infinity, 
    maxUnitsPerProperty: Infinity,
    displayName: 'Premium'
  }
};

let currentUser = null;
let userPlan = 'freemium';
let userLimits = PLAN_LIMITS.freemium;
let editingTenantId = null;
let tenantsUnsubscribe = null;
let propertiesCache = new Map(); // Cache properties for faster lookup

// DOM Elements
const modal = document.getElementById('tenant-modal');
const closeModalBtn = document.getElementById('close-modal');
const addTenantBtn = document.getElementById('add-tenant-btn');
const tenantForm = document.getElementById('tenant-form');
const message = document.getElementById('message');
const tenantsContainer = document.getElementById('tenants-container');
const modalTitle = document.getElementById('modal-title');
const submitBtn = document.getElementById('submit-tenant-btn');

// Check authentication
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData(user.uid);
    await loadProperties(user.uid);
    setupRealtimeTenants(user.uid);
    checkURLParams();
  } else {
    if (tenantsUnsubscribe) tenantsUnsubscribe();
    window.location.href = 'index.html';
  }
});

// ✅ FIXED: Load user data from single plan field
async function loadUserData(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      
      // ✅ Read from SINGLE plan field (no duplicates)
      userPlan = userData.plan || 'freemium';
      userLimits = PLAN_LIMITS[userPlan];

      document.getElementById('user-name').textContent = userData.username || 'User';
      document.getElementById('user-email').textContent = userData.email || '';
      
      const planBadge = document.getElementById('plan-badge');
      planBadge.textContent = userLimits.displayName;
      planBadge.className = `plan-badge plan-${userPlan}`;
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    showMessage('Error loading user data. Please refresh the page.', 'error');
  }
}

// Load properties for dropdown and cache them
async function loadProperties(uid) {
  try {
    const propertiesQuery = query(
      collection(db, "properties"),
      where("ownerId", "==", uid)
    );
    
    const snapshot = await getDocs(propertiesQuery);
    const propertySelect = document.getElementById('tenant-property');
    
    propertySelect.innerHTML = '<option value="">Select a property</option>';
    propertiesCache.clear();
    
    snapshot.forEach((doc) => {
      const property = doc.data();
      propertiesCache.set(doc.id, property); // Cache for later use
      
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = property.name;
      propertySelect.appendChild(option);
    });

    if (snapshot.empty) {
      addTenantBtn.disabled = true;
      addTenantBtn.style.opacity = '0.5';
      addTenantBtn.title = 'Add a property first before adding tenants';
      showMessage('⚠️ Please add a property first before adding tenants.', 'error');
    } else {
      addTenantBtn.disabled = false;
      addTenantBtn.style.opacity = '1';
      addTenantBtn.title = 'Add a new tenant';
    }
  } catch (error) {
    console.error("Error loading properties:", error);
    showMessage('Error loading properties. Please refresh.', 'error');
  }
}

// ✅ FIXED: Real-time tenants listener
function setupRealtimeTenants(uid) {
  const tenantsQuery = query(
    collection(db, "tenants"),
    where("landlordId", "==", uid)
  );
  
  tenantsUnsubscribe = onSnapshot(
    tenantsQuery,
    async (snapshot) => {
      const tenantCount = snapshot.size;

      document.getElementById('tenant-count-text').textContent = 
        `(${tenantCount} ${tenantCount === 1 ? 'tenant' : 'tenants'})`;

      if (snapshot.empty) {
        tenantsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👥</div>
            <h3>No tenants yet</h3>
            <p>Start by adding your first tenant</p>
          </div>
        `;
        return;
      }

      // Create table
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
      
      tenantsContainer.innerHTML = '';
      tenantsContainer.appendChild(table);

      const tbody = document.getElementById('tenants-tbody');
      
      for (const doc of snapshot.docs) {
        const tenant = doc.data();
        const row = createTenantRow(doc.id, tenant);
        tbody.appendChild(row);
      }
    },
    (error) => {
      console.error("Error loading tenants:", error);
      showMessage('Error loading tenants. Please refresh the page.', 'error');
    }
  );
}

// ✅ FIXED: Create tenant row using cached properties (faster)
function createTenantRow(id, tenant) {
  const row = document.createElement('tr');
  
  // Get property name from cache
  let propertyName = 'N/A';
  if (tenant.propertyId && propertiesCache.has(tenant.propertyId)) {
    propertyName = propertiesCache.get(tenant.propertyId).name;
  }

  const initials = (tenant.firstName?.charAt(0) || '') + (tenant.lastName?.charAt(0) || '');
  const fullName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim();

  row.innerHTML = `
    <td>
      <div class="tenant-name">
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
        ${(tenant.status || 'active').charAt(0).toUpperCase() + (tenant.status || 'active').slice(1)}
      </span>
    </td>
    <td>
      <div class="action-buttons">
        <button class="btn-icon" onclick="editTenant('${id}')" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteTenant('${id}', '${escapeHtml(fullName)}')" title="Delete">🗑️</button>
      </div>
    </td>
  `;
  
  return row;
}

// Open modal
function openModal(isEdit = false) {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  if (isEdit) {
    modalTitle.textContent = 'Edit Tenant';
    submitBtn.textContent = 'Update Tenant';
  } else {
    modalTitle.textContent = 'Add New Tenant';
    submitBtn.textContent = 'Add Tenant';
    tenantForm.reset();
    editingTenantId = null;
  }
}

// Close modal
function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
  tenantForm.reset();
  editingTenantId = null;
}

// Edit tenant
window.editTenant = async function(tenantId) {
  try {
    const tenantDoc = await getDoc(doc(db, "tenants", tenantId));
    
    if (tenantDoc.exists()) {
      const tenant = tenantDoc.data();
      editingTenantId = tenantId;
      
      // Fill form
      document.getElementById('tenant-firstname').value = tenant.firstName || '';
      document.getElementById('tenant-lastname').value = tenant.lastName || '';
      document.getElementById('tenant-email').value = tenant.email || '';
      document.getElementById('tenant-phone').value = tenant.phone || '';
      document.getElementById('tenant-property').value = tenant.propertyId || '';
      document.getElementById('tenant-unit').value = tenant.unitNumber || '';
      document.getElementById('tenant-rent').value = tenant.monthlyRent || '';
      document.getElementById('tenant-deposit').value = tenant.securityDeposit || '';
      
      if (tenant.moveInDate?.toDate) {
        const date = tenant.moveInDate.toDate().toISOString().split('T')[0];
        document.getElementById('tenant-movein').value = date;
      }
      
      if (tenant.leaseEndDate?.toDate) {
        const date = tenant.leaseEndDate.toDate().toISOString().split('T')[0];
        document.getElementById('tenant-lease-end').value = date;
      }
      
      openModal(true);
    }
  } catch (error) {
    console.error("Error loading tenant:", error);
    showMessage('Error loading tenant data.', 'error');
  }
};

// Delete tenant
window.deleteTenant = async function(tenantId, tenantName) {
  if (!confirm(`Are you sure you want to remove ${tenantName}? This action cannot be undone.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "tenants", tenantId));

    // Log activity
    await addDoc(collection(db, "activities"), {
      userId: currentUser.uid,
      type: "tenant_removed",
      title: "Tenant Removed",
      details: `${tenantName} was removed from your tenants`,
      icon: "👋",
      timestamp: serverTimestamp()
    });

    showMessage(`✅ Tenant "${tenantName}" removed successfully!`, 'success');
    
    // Real-time listener will handle the update automatically
  } catch (error) {
    console.error("Error deleting tenant:", error);
    showMessage('Error removing tenant. Please try again.', 'error');
  }
};

// ✅ FIXED: Submit tenant form
tenantForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const tenantData = {
    firstName: document.getElementById('tenant-firstname').value.trim(),
    lastName: document.getElementById('tenant-lastname').value.trim(),
    email: document.getElementById('tenant-email').value.trim(),
    phone: document.getElementById('tenant-phone').value.trim(),
    propertyId: document.getElementById('tenant-property').value,
    unitNumber: document.getElementById('tenant-unit').value.trim(),
    monthlyRent: parseFloat(document.getElementById('tenant-rent').value),
    securityDeposit: parseFloat(document.getElementById('tenant-deposit').value) || 0,
    moveInDate: new Date(document.getElementById('tenant-movein').value),
    leaseEndDate: document.getElementById('tenant-lease-end').value 
      ? new Date(document.getElementById('tenant-lease-end').value) 
      : null,
    status: 'active'
  };

  submitBtn.disabled = true;
  submitBtn.textContent = editingTenantId ? 'Updating...' : 'Adding...';

  try {
    if (editingTenantId) {
      // Update existing tenant
      const tenantRef = doc(db, "tenants", editingTenantId);
      await updateDoc(tenantRef, {
        ...tenantData,
        updatedAt: serverTimestamp()
      });

      showMessage('✅ Tenant updated successfully!', 'success');
    } else {
      // Add new tenant
      tenantData.landlordId = currentUser.uid;
      tenantData.createdAt = serverTimestamp();

      await addDoc(collection(db, "tenants"), tenantData);

      // Log activity
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
    // Real-time listener will handle the update automatically
    
  } catch (error) {
    console.error("Error saving tenant:", error);
    showMessage('Error saving tenant. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingTenantId ? 'Update Tenant' : 'Add Tenant';
  }
});

// Event listeners
addTenantBtn.addEventListener('click', () => {
  if (!addTenantBtn.disabled) {
    openModal(false);
  }
});

closeModalBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to logout?')) {
    if (tenantsUnsubscribe) tenantsUnsubscribe();
    await signOut(auth);
    window.location.href = 'index.html';
  }
});

// Check URL params
function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'add' && !addTenantBtn.disabled) {
    openModal(false);
  }
}

// Helper: escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper: show messages
function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type} show`;
  
  setTimeout(() => {
    message.classList.remove('show');
  }, 5000);
}

// Clean up listeners on page unload
window.addEventListener('beforeunload', () => {
  if (tenantsUnsubscribe) tenantsUnsubscribe();
});