import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, updateDoc, deleteDoc, serverTimestamp, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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

let currentUser = null;
let userPlan = 'freemium';
let userLimits = PLAN_LIMITS.freemium;
let currentPropertiesCount = 0;
let editingPropertyId = null;
let propertiesUnsubscribe = null;
let tenantsUnsubscribe = null;
let allProperties = [];
let allTenants = [];
let filteredProperties = [];

// Chart instances
let charts = {
  propertyType: null,
  occupancyOverview: null,
  unitsPerProperty: null
};

// DOM Elements
const modal = document.getElementById('property-modal');
const detailsModal = document.getElementById('property-details-modal');
const closeModalBtn = document.getElementById('close-modal');
const closeDetailsModalBtn = document.getElementById('close-details-modal');
const cancelBtn = document.getElementById('cancel-btn');
const addPropertyBtn = document.getElementById('add-property-btn');
const propertyForm = document.getElementById('property-form');
const message = document.getElementById('message');
const propertiesContainer = document.getElementById('properties-container');
const modalTitle = document.getElementById('modal-title');
const submitBtn = document.getElementById('submit-property-btn');

// Filters
const filterType = document.getElementById('filter-type');
const filterStatus = document.getElementById('filter-status');
const searchInput = document.getElementById('search-properties');
const gridViewBtn = document.getElementById('grid-view-btn');
const listViewBtn = document.getElementById('list-view-btn');

// Check authentication
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData(user.uid);
    setupRealtimeListeners(user.uid);
    initializeCharts();
    setupEventListeners();
    checkURLParams();
  } else {
    cleanup();
    window.location.href = 'index.html';
  }
});

// Load user data
async function loadUserData(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      userPlan = userData.plan || 'freemium';
      userLimits = PLAN_LIMITS[userPlan];
      currentPropertiesCount = userData.propertiesCount || 0;

      document.getElementById('user-name').textContent = userData.username || 'User';
      document.getElementById('user-email').textContent = userData.email || '';
      
      const planBadge = document.getElementById('plan-badge');
      planBadge.textContent = userLimits.displayName;
      planBadge.className = `plan-badge plan-${userPlan}`;

      checkPropertyLimit();
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    showMessage('Error loading user data. Please refresh the page.', 'error');
  }
}

// Check property limit
function checkPropertyLimit() {
  if (currentPropertiesCount >= userLimits.maxProperties && userLimits.maxProperties !== Infinity) {
    addPropertyBtn.disabled = true;
    addPropertyBtn.style.opacity = '0.5';
    addPropertyBtn.title = `You've reached the limit of ${userLimits.maxProperties} properties`;
    
    showMessage(
      `⚠️ Property limit reached! <a href="dashboard.html" style="color: #721c24; text-decoration: underline; font-weight: 600; margin-left: 8px;">Upgrade your plan</a> to add more properties.`, 
      'error'
    );
  } else {
    addPropertyBtn.disabled = false;
    addPropertyBtn.style.opacity = '1';
    addPropertyBtn.title = 'Add a new property';
  }
}

// Setup real-time listeners for both properties and tenants
function setupRealtimeListeners(uid) {
  // Listen to tenants first
  const tenantsQuery = query(
    collection(db, "tenants"),
    where("landlordId", "==", uid)
  );
  
  tenantsUnsubscribe = onSnapshot(
    tenantsQuery,
    (snapshot) => {
      allTenants = [];
      snapshot.forEach((doc) => {
        allTenants.push({ id: doc.id, ...doc.data() });
      });
      
      // After tenants are loaded, update property occupancy
      if (allProperties.length > 0) {
        updatePropertyOccupancy();
      }
    },
    (error) => {
      console.error("Error loading tenants:", error);
    }
  );

  // Listen to properties
  const propertiesQuery = query(
    collection(db, "properties"),
    where("ownerId", "==", uid)
  );
  
  propertiesUnsubscribe = onSnapshot(
    propertiesQuery,
    async (snapshot) => {
      currentPropertiesCount = snapshot.size;
      
      // Update property count
      document.getElementById('property-count-text').textContent = 
        `(${currentPropertiesCount} ${currentPropertiesCount === 1 ? 'property' : 'properties'})`;

      // Update user's property count in Firestore
      try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, {
          propertiesCount: currentPropertiesCount
        });
      } catch (error) {
        console.error("Error updating property count:", error);
      }

      checkPropertyLimit();

      // Store all properties
      allProperties = [];
      snapshot.forEach((doc) => {
        allProperties.push({ id: doc.id, ...doc.data() });
      });

      // Update occupancy if tenants are loaded
      if (allTenants.length > 0) {
        await updatePropertyOccupancy();
      }

      // Update stats
      updateStats();
      
      // Apply filters and render
      applyFilters();
      
      // Update charts
      updateCharts();
      
      // Show/hide analytics section
      const analyticsSection = document.getElementById('analytics-section');
      if (allProperties.length > 0) {
        analyticsSection.style.display = 'block';
      } else {
        analyticsSection.style.display = 'none';
      }
    },
    (error) => {
      console.error("Error loading properties:", error);
      showMessage('Error loading properties. Please refresh the page.', 'error');
    }
  );
}

// Update property occupancy based on tenants
async function updatePropertyOccupancy() {
  try {
    const batch = writeBatch(db);
    let hasUpdates = false;

    for (const property of allProperties) {
      // Get active tenants for this property
      const activeTenants = allTenants.filter(
        tenant => tenant.propertyId === property.id && tenant.status === 'active'
      );
      
      // Count unique unit numbers (multiple tenants in same unit = 1 occupied unit)
      const uniqueUnits = new Set();
      activeTenants.forEach(tenant => {
        if (tenant.unitNumber) {
          uniqueUnits.add(tenant.unitNumber.toString().trim().toLowerCase());
        }
      });
      
      const occupiedUnits = uniqueUnits.size;
      
      // Only update if the count has changed
      if (property.occupiedUnits !== occupiedUnits) {
        const propertyRef = doc(db, "properties", property.id);
        batch.update(propertyRef, { occupiedUnits });
        
        // Update local data immediately
        property.occupiedUnits = occupiedUnits;
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await batch.commit();
      console.log("Property occupancy updated successfully");
    }
  } catch (error) {
    console.error("Error updating property occupancy:", error);
  }
}

// Update statistics
function updateStats() {
  const totalProperties = allProperties.length;
  const totalUnits = allProperties.reduce((sum, p) => sum + (p.totalUnits || 0), 0);
  const occupiedUnits = allProperties.reduce((sum, p) => sum + (p.occupiedUnits || 0), 0);
  const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : 0;

  document.getElementById('total-properties-stat').textContent = totalProperties;
  document.getElementById('total-units-stat').textContent = totalUnits;
  document.getElementById('occupied-units-stat').textContent = occupiedUnits;
  document.getElementById('occupancy-rate-stat').textContent = `${occupancyRate}%`;
}

// Apply filters
function applyFilters() {
  const typeFilter = filterType.value;
  const statusFilter = filterStatus.value;
  const searchTerm = searchInput.value.toLowerCase();

  filteredProperties = allProperties.filter(property => {
    const matchesType = typeFilter === 'all' || property.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || property.status === statusFilter;
    const matchesSearch = property.name.toLowerCase().includes(searchTerm) ||
                         property.city.toLowerCase().includes(searchTerm) ||
                         property.province.toLowerCase().includes(searchTerm);
    
    return matchesType && matchesStatus && matchesSearch;
  });

  renderProperties();
}

// Render properties
function renderProperties() {
  propertiesContainer.innerHTML = '';

  if (filteredProperties.length === 0) {
    const emptyMessage = allProperties.length === 0 
      ? 'No properties yet. Start by adding your first property!'
      : 'No properties match your filters.';
      
    propertiesContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏠</div>
        <h3>${allProperties.length === 0 ? 'No Properties Yet' : 'No Results Found'}</h3>
        <p>${emptyMessage}</p>
      </div>
    `;
    return;
  }

  filteredProperties.forEach((property) => {
    const card = createPropertyCard(property);
    propertiesContainer.appendChild(card);
  });
}

// Create property card
function createPropertyCard(property) {
  const card = document.createElement('div');
  card.className = 'property-card-full';
  
  const occupancyRate = property.totalUnits > 0 
    ? ((property.occupiedUnits || 0) / property.totalUnits * 100).toFixed(0)
    : 0;

  const typeIcons = {
    'apartment': '🏢',
    'boarding-house': '🏠',
    'house': '🏡',
    'condominium': '🏙️',
    'commercial': '🏪'
  };

  const typeNames = {
    'apartment': 'Apartment',
    'boarding-house': 'Boarding House',
    'house': 'House',
    'condominium': 'Condominium',
    'commercial': 'Commercial'
  };

  card.innerHTML = `
    <div class="property-header">
      <div class="property-icon">${typeIcons[property.type] || '🏢'}</div>
      <span class="property-badge badge-${property.status || 'active'}">${property.status || 'active'}</span>
    </div>
    
    <div class="property-name" onclick="viewPropertyDetails('${property.id}')">${escapeHtml(property.name)}</div>
    <div class="property-type">${typeNames[property.type] || property.type}</div>
    <div class="property-location">📍 ${escapeHtml(property.city)}, ${escapeHtml(property.province)}</div>
    
    <div class="property-stats">
      <div class="stat-item">
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${property.totalUnits || 0}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Occupied</div>
        <div class="stat-value">${property.occupiedUnits || 0}</div>
      </div>
    </div>
    
    <div class="occupancy-indicator">
      <div class="occupancy-label">
        <span>Occupancy Rate</span>
        <span>${occupancyRate}%</span>
      </div>
      <div class="occupancy-bar">
        <div class="occupancy-fill" style="width: ${occupancyRate}%;"></div>
      </div>
    </div>
    
    <div class="property-actions">
      <button class="btn-view" onclick="viewPropertyDetails('${property.id}')">
        👁️ View
      </button>
      <button class="btn-edit" onclick="editProperty('${property.id}')">
        ✏️ Edit
      </button>
      <button class="btn-delete" onclick="deleteProperty('${property.id}', '${escapeHtml(property.name)}')">
        🗑️ Delete
      </button>
    </div>
  `;
  
  return card;
}

// View property details
window.viewPropertyDetails = async function(propertyId) {
  try {
    const property = allProperties.find(p => p.id === propertyId);
    if (!property) return;

    const typeNames = {
      'apartment': 'Apartment',
      'boarding-house': 'Boarding House',
      'house': 'House',
      'condominium': 'Condominium',
      'commercial': 'Commercial Space'
    };

    const occupancyRate = property.totalUnits > 0 
      ? ((property.occupiedUnits || 0) / property.totalUnits * 100).toFixed(1)
      : 0;

    // Get tenants for this property
    const propertyTenants = allTenants.filter(t => t.propertyId === propertyId && t.status === 'active');
    
    // Group tenants by unit number
    const tenantsByUnit = {};
    propertyTenants.forEach(tenant => {
      const unitKey = tenant.unitNumber ? tenant.unitNumber.toString().trim() : 'Unknown';
      if (!tenantsByUnit[unitKey]) {
        tenantsByUnit[unitKey] = [];
      }
      tenantsByUnit[unitKey].push(tenant);
    });

    document.getElementById('details-property-name').textContent = property.name;
    
    const detailsContent = document.getElementById('property-details-content');
    detailsContent.innerHTML = `
      <div class="detail-section">
        <h3>📋 Basic Information</h3>
        <div class="detail-row">
          <div class="detail-label">Property Name:</div>
          <div class="detail-value">${escapeHtml(property.name)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Property Type:</div>
          <div class="detail-value">${typeNames[property.type] || property.type}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Status:</div>
          <div class="detail-value">
            <span class="property-badge badge-${property.status || 'active'}">${property.status || 'active'}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3>📍 Location</h3>
        <div class="detail-row">
          <div class="detail-label">Address:</div>
          <div class="detail-value">${escapeHtml(property.address)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">City:</div>
          <div class="detail-value">${escapeHtml(property.city)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Province:</div>
          <div class="detail-value">${escapeHtml(property.province)}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>📊 Statistics</h3>
        <div class="detail-row">
          <div class="detail-label">Total Units:</div>
          <div class="detail-value">${property.totalUnits || 0}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Occupied Units:</div>
          <div class="detail-value">${property.occupiedUnits || 0}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Available Units:</div>
          <div class="detail-value">${(property.totalUnits || 0) - (property.occupiedUnits || 0)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Occupancy Rate:</div>
          <div class="detail-value">${occupancyRate}%</div>
        </div>
      </div>

      ${propertyTenants.length > 0 ? `
      <div class="detail-section">
        <h3>👥 Active Tenants (${Object.keys(tenantsByUnit).length} occupied ${Object.keys(tenantsByUnit).length === 1 ? 'unit' : 'units'})</h3>
        ${Object.entries(tenantsByUnit).map(([unitNumber, tenants]) => `
          <div class="detail-row">
            <div class="detail-label">Unit ${escapeHtml(unitNumber)}:</div>
            <div class="detail-value">
              ${tenants.map(t => `${escapeHtml(t.firstName)} ${escapeHtml(t.lastName)}`).join(', ')}
              ${tenants.length > 1 ? `<span style="color: #6b7280; font-size: 0.85em;"> (${tenants.length} tenants)</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${property.description ? `
      <div class="detail-section">
        <h3>📝 Description</h3>
        <p style="color: #6b7280; line-height: 1.6;">${escapeHtml(property.description)}</p>
      </div>
      ` : ''}
    `;

    detailsModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error("Error loading property details:", error);
    showMessage('Error loading property details.', 'error');
  }
};

// Edit property
window.editProperty = async function(propertyId) {
  try {
    const property = allProperties.find(p => p.id === propertyId);
    
    if (property) {
      editingPropertyId = propertyId;
      
      document.getElementById('property-name').value = property.name;
      document.getElementById('property-type').value = property.type;
      document.getElementById('total-units').value = property.totalUnits;
      document.getElementById('property-address').value = property.address;
      document.getElementById('property-city').value = property.city;
      document.getElementById('property-province').value = property.province;
      document.getElementById('property-description').value = property.description || '';
      
      openModal(true);
    }
  } catch (error) {
    console.error("Error loading property:", error);
    showMessage('Error loading property data.', 'error');
  }
};

// Delete property
window.deleteProperty = async function(propertyId, propertyName) {
  // Check if property has tenants
  const propertyTenants = allTenants.filter(t => t.propertyId === propertyId);
  
  if (propertyTenants.length > 0) {
    alert(`Cannot delete "${propertyName}" because it has ${propertyTenants.length} tenant(s). Please remove all tenants first.`);
    return;
  }

  if (!confirm(`Are you sure you want to delete "${propertyName}"?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "properties", propertyId));

    await addDoc(collection(db, "activities"), {
      userId: currentUser.uid,
      type: "property_deleted",
      title: "Property Deleted",
      details: `${propertyName} was removed`,
      icon: "🗑️",
      timestamp: serverTimestamp()
    });

    showMessage(`✅ Property "${propertyName}" deleted successfully!`, 'success');
  } catch (error) {
    console.error("Error deleting property:", error);
    showMessage('❌ Error deleting property. Please try again.', 'error');
  }
};

// Submit property form
propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!editingPropertyId && currentPropertiesCount >= userLimits.maxProperties && userLimits.maxProperties !== Infinity) {
    showMessage(`⚠️ You've reached your ${userLimits.displayName} plan limit of ${userLimits.maxProperties} properties. Please upgrade to add more.`, 'error');
    return;
  }

  const propertyData = {
    name: document.getElementById('property-name').value.trim(),
    type: document.getElementById('property-type').value,
    totalUnits: parseInt(document.getElementById('total-units').value),
    address: document.getElementById('property-address').value.trim(),
    city: document.getElementById('property-city').value.trim(),
    province: document.getElementById('property-province').value.trim(),
    description: document.getElementById('property-description').value.trim(),
    status: 'active'
  };

  submitBtn.disabled = true;
  submitBtn.textContent = editingPropertyId ? 'Updating...' : 'Adding...';

  try {
    if (editingPropertyId) {
      const propertyRef = doc(db, "properties", editingPropertyId);
      await updateDoc(propertyRef, {
        ...propertyData,
        updatedAt: serverTimestamp()
      });

      showMessage('✅ Property updated successfully!', 'success');
    } else {
      propertyData.ownerId = currentUser.uid;
      propertyData.occupiedUnits = 0;
      propertyData.createdAt = serverTimestamp();

      await addDoc(collection(db, "properties"), propertyData);

      await addDoc(collection(db, "activities"), {
        userId: currentUser.uid,
        type: "property_added",
        title: "New Property Added",
        details: `${propertyData.name} was added to your portfolio`,
        icon: "🏠",
        timestamp: serverTimestamp()
      });

      showMessage('✅ Property added successfully!', 'success');
    }

    closeModal();
  } catch (error) {
    console.error("Error saving property:", error);
    showMessage('❌ Error saving property. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingPropertyId ? 'Update Property' : 'Add Property';
  }
});

// Modal functions
function openModal(isEdit = false) {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  if (isEdit) {
    modalTitle.textContent = 'Edit Property';
    submitBtn.textContent = 'Update Property';
  } else {
    modalTitle.textContent = 'Add New Property';
    submitBtn.textContent = 'Add Property';
    propertyForm.reset();
    editingPropertyId = null;
  }
}

function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
  propertyForm.reset();
  editingPropertyId = null;
}

function closeDetailsModal() {
  detailsModal.classList.remove('active');
  document.body.style.overflow = '';
}

// Initialize charts
function initializeCharts() {
  const chartColors = {
    primary: '#2fc4b2',
    secondary: '#107266',
    tertiary: '#8de5db',
    colors: ['#2fc4b2', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']
  };

  // Property Type Distribution
  const propertyTypeCtx = document.getElementById('propertyTypeChart');
  if (propertyTypeCtx) {
    charts.propertyType = new Chart(propertyTypeCtx, {
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
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // Occupancy Overview
  const occupancyOverviewCtx = document.getElementById('occupancyOverviewChart');
  if (occupancyOverviewCtx) {
    charts.occupancyOverview = new Chart(occupancyOverviewCtx, {
      type: 'pie',
      data: {
        labels: ['Occupied', 'Available'],
        datasets: [{
          data: [0, 0],
          backgroundColor: [chartColors.primary, '#e5e7eb'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // Units per Property
  const unitsPerPropertyCtx = document.getElementById('unitsPerPropertyChart');
  if (unitsPerPropertyCtx) {
    charts.unitsPerProperty = new Chart(unitsPerPropertyCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Total Units',
            data: [],
            backgroundColor: chartColors.tertiary,
            borderRadius: 8
          },
          {
            label: 'Occupied Units',
            data: [],
            backgroundColor: chartColors.primary,
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
}

// Update charts
function updateCharts() {
  if (!allProperties.length) return;

  // Property Type Distribution
  if (charts.propertyType) {
    const typeCounts = {};
    allProperties.forEach(p => {
      typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    });
    
    const typeNames = {
      'apartment': 'Apartments',
      'boarding-house': 'Boarding Houses',
      'house': 'Houses',
      'condominium': 'Condominiums',
      'commercial': 'Commercial'
    };
    
    charts.propertyType.data.labels = Object.keys(typeCounts).map(t => typeNames[t] || t);
    charts.propertyType.data.datasets[0].data = Object.values(typeCounts);
    charts.propertyType.update();
  }

  // Occupancy Overview
  if (charts.occupancyOverview) {
    const totalUnits = allProperties.reduce((sum, p) => sum + (p.totalUnits || 0), 0);
    const occupiedUnits = allProperties.reduce((sum, p) => sum + (p.occupiedUnits || 0), 0);
    const availableUnits = totalUnits - occupiedUnits;
    
    charts.occupancyOverview.data.datasets[0].data = [occupiedUnits, availableUnits];
    charts.occupancyOverview.update();
  }

  // Units per Property
  if (charts.unitsPerProperty) {
    const propertyNames = allProperties.map(p => p.name);
    const totalUnits = allProperties.map(p => p.totalUnits || 0);
    const occupiedUnits = allProperties.map(p => p.occupiedUnits || 0);
    
    charts.unitsPerProperty.data.labels = propertyNames;
    charts.unitsPerProperty.data.datasets[0].data = totalUnits;
    charts.unitsPerProperty.data.datasets[1].data = occupiedUnits;
    charts.unitsPerProperty.update();
  }
}

// Setup event listeners
function setupEventListeners() {
  addPropertyBtn.addEventListener('click', () => {
    if (!addPropertyBtn.disabled) openModal(false);
  });

  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  closeDetailsModalBtn.addEventListener('click', closeDetailsModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) closeDetailsModal();
  });

  // Filters
  filterType.addEventListener('change', applyFilters);
  filterStatus.addEventListener('change', applyFilters);
  searchInput.addEventListener('input', applyFilters);

  // View toggle
  gridViewBtn.addEventListener('click', () => {
    propertiesContainer.classList.remove('list-view');
    gridViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
  });

  listViewBtn.addEventListener('click', () => {
    propertiesContainer.classList.add('list-view');
    listViewBtn.classList.add('active');
    gridViewBtn.classList.remove('active');
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
      cleanup();
      await signOut(auth);
      window.location.href = 'index.html';
    }
  });
}

// Add mobile menu functionality after setupEventListeners()
document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.querySelector('aside'); // Changed from getElementById
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
});

// Check URL params
function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'add' && !addPropertyBtn.disabled) {
    openModal(false);
  }
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(text, type) {
  message.innerHTML = text;
  message.className = `message ${type} show`;
  
  setTimeout(() => {
    message.classList.remove('show');
  }, 6000);
}

function cleanup() {
  if (propertiesUnsubscribe) propertiesUnsubscribe();
  if (tenantsUnsubscribe) tenantsUnsubscribe();
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
  });
}

window.addEventListener('beforeunload', cleanup);