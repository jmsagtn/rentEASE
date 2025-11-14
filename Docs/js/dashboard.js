import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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

// Plan limits configuration - FIXED NAMING
const PLAN_LIMITS = {
  freemium: { 
    maxProperties: 2, 
    maxUnitsPerProperty: 4, 
    features: { properties: true, tenants: true, rentTracker: false, reports: false }
  },
  premium: { // Maps to "Pro" plan in UI
    maxProperties: 20, 
    maxUnitsPerProperty: Infinity, 
    features: { properties: true, tenants: true, rentTracker: true, reports: false }
  },
  platinum: { // Maps to "Premium" plan in UI
    maxProperties: Infinity, 
    maxUnitsPerProperty: Infinity, 
    features: { properties: true, tenants: true, rentTracker: true, reports: true }
  }
};

let currentUser = null;
let userPlan = 'freemium';
let userLimits = PLAN_LIMITS.freemium;

// Store unsubscribe functions to prevent memory leaks
let unsubscribers = {
  properties: null,
  tenants: null,
  payments: null,
  activity: null
};

// Check authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      await loadUserData(user.uid);
      setupRealtimeDashboard(user.uid);
    } catch (error) {
      console.error("Error initializing dashboard:", error);
      showError("Failed to load dashboard. Please refresh the page.");
    }
  } else {
    // Clean up listeners before redirecting
    cleanupListeners();
    window.location.href = 'index.html';
  }
});

// Clean up all listeners
function cleanupListeners() {
  Object.values(unsubscribers).forEach(unsub => {
    if (unsub) unsub();
  });
}

// Load user data and apply plan restrictions
async function loadUserData(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      userPlan = userData.plan || 'freemium';
      userLimits = PLAN_LIMITS[userPlan];

      document.getElementById('user-name').textContent = userData.username || 'User';
      document.getElementById('user-email').textContent = userData.email || '';
      document.getElementById('welcome-message').textContent = `Welcome back, ${userData.username}! 👋`;

      const planBadge = document.getElementById('plan-badge');
      const displayPlanName = userPlan === 'freemium' ? 'Free' : 
                             userPlan === 'premium' ? 'Pro' : 'Premium';
      planBadge.textContent = displayPlanName;
      planBadge.className = `plan-badge plan-${userPlan}`;

      // Show/hide upgrade banner
      const upgradeBanner = document.getElementById('upgrade-banner');
      if (userPlan !== 'platinum') {
        upgradeBanner.classList.remove('hidden');
        // Update banner text based on current plan
        const bannerText = upgradeBanner.querySelector('p');
        if (userPlan === 'freemium') {
          bannerText.textContent = 'Unlock more properties and advanced features!';
        } else if (userPlan === 'premium') {
          bannerText.textContent = 'Upgrade to Premium for unlimited properties!';
        }
      } else {
        upgradeBanner.classList.add('hidden');
      }

      applyPlanRestrictions(userData);
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    throw error;
  }
}

// Apply plan-based restrictions
function applyPlanRestrictions(userData) {
  // Use actual count from userData, will be updated by real-time listeners
  const propertiesCount = userData.propertiesCount || 0;

  document.getElementById('property-limit-text').textContent = 
    userLimits.maxProperties !== Infinity 
      ? `(${propertiesCount}/${userLimits.maxProperties})` 
      : '(Unlimited)';

  // Check property limit
  if (propertiesCount >= userLimits.maxProperties && userLimits.maxProperties !== Infinity) {
    const addPropertyBtn = document.getElementById('add-property-btn');
    addPropertyBtn.disabled = true;
    addPropertyBtn.classList.add('btn-disabled');
    addPropertyBtn.title = `You've reached the ${userLimits.maxProperties} property limit for your ${userPlan} plan`;

    const warningDiv = document.getElementById('limit-warning');
    warningDiv.innerHTML = `
      <strong>⚠️ Property Limit Reached</strong><br>
      You've reached the maximum of ${userLimits.maxProperties} properties for your ${userPlan} plan.
      <a href="#" class="upgrade-link" style="color: #856404; text-decoration: underline; margin-left: 8px;">Upgrade to add more</a>
    `;
    warningDiv.classList.add('show');
    
    // Add click handler to upgrade link
    const upgradeLink = warningDiv.querySelector('.upgrade-link');
    if (upgradeLink) {
      upgradeLink.addEventListener('click', (e) => {
        e.preventDefault();
        openPricingModal();
      });
    }
  }

  // Restrict rent tracker
  if (!userLimits.features.rentTracker) {
    const rentTrackerLink = document.getElementById('nav-rent');
    if (rentTrackerLink) {
      rentTrackerLink.classList.add('nav-locked');
      rentTrackerLink.addEventListener('click', (e) => {
        e.preventDefault();
        alert('🔒 Upgrade to Pro to unlock Rent Tracker!');
      });
    }
  }

  // Restrict reports
  if (!userLimits.features.reports) {
    const reportBtn = document.getElementById('generate-report-btn');
    if (reportBtn) {
      reportBtn.disabled = true;
      reportBtn.classList.add('btn-disabled');
      reportBtn.title = 'Upgrade to Premium to unlock Advanced Reports';
    }
  }
}

// Real-time dashboard setup with error handling
function setupRealtimeDashboard(uid) {
  let totalMonthlyRevenue = 0;

  // Properties listener
  const propertiesQuery = query(collection(db, "properties"), where("ownerId", "==", uid));
  unsubscribers.properties = onSnapshot(
    propertiesQuery, 
    (snapshot) => {
      const propertiesCount = snapshot.size;
      document.getElementById('total-properties').textContent = propertiesCount;
      
      const changeEl = document.getElementById('property-change');
      changeEl.textContent = propertiesCount > 0 ? 
        `${propertiesCount} active ${propertiesCount === 1 ? 'property' : 'properties'}` : 
        'No properties yet';
      changeEl.className = propertiesCount > 0 ? 'stat-change positive' : 'stat-change';
      
      loadPropertiesGrid(snapshot);
    },
    (error) => {
      console.error("Error loading properties:", error);
      showError("Failed to load properties");
    }
  );

  // Tenants listener
  const tenantsQuery = query(collection(db, "tenants"), where("landlordId", "==", uid));
  unsubscribers.tenants = onSnapshot(
    tenantsQuery, 
    (snapshot) => {
      const tenantsCount = snapshot.size;
      let monthlyRevenue = 0;

      // Calculate monthly revenue from active tenants
      snapshot.forEach((doc) => {
        const tenant = doc.data();
        if (tenant.status === 'active' && tenant.rentAmount) {
          monthlyRevenue += Number(tenant.rentAmount) || 0;
        }
      });

      totalMonthlyRevenue = monthlyRevenue;

      document.getElementById('active-tenants').textContent = tenantsCount;
      
      const tenantChange = document.getElementById('tenant-change');
      tenantChange.textContent = tenantsCount > 0 ? 
        `${tenantsCount} active ${tenantsCount === 1 ? 'tenant' : 'tenants'}` : 
        'No tenants yet';
      tenantChange.className = tenantsCount > 0 ? 'stat-change positive' : 'stat-change';

      // Update monthly revenue display
      document.getElementById('monthly-revenue').textContent = `₱${monthlyRevenue.toLocaleString()}`;
      
      const revenueChange = document.getElementById('revenue-change');
      revenueChange.textContent = monthlyRevenue > 0 ? 
        `Expected this month` : 
        'No revenue yet';
      revenueChange.className = monthlyRevenue > 0 ? 'stat-change positive' : 'stat-change';
    },
    (error) => {
      console.error("Error loading tenants:", error);
      showError("Failed to load tenant data");
    }
  );

  // Payments listener
  const paymentsQuery = query(
    collection(db, "payments"),
    where("landlordId", "==", uid),
    where("status", "==", "pending")
  );
  unsubscribers.payments = onSnapshot(
    paymentsQuery, 
    (snapshot) => {
      const pendingPayments = snapshot.size;
      document.getElementById('pending-payments').textContent = pendingPayments;
      
      const paymentChange = document.getElementById('payment-change');
      paymentChange.textContent = pendingPayments > 0 ? 'Action needed' : 'All clear';
      paymentChange.className = pendingPayments > 0 ? 'stat-change negative' : 'stat-change';
      
      loadPaymentsList(snapshot);
    },
    (error) => {
      console.error("Error loading payments:", error);
      showError("Failed to load payment data");
    }
  );

  // Recent activity listener
  const activityQuery = query(
    collection(db, "activities"),
    where("userId", "==", uid),
    orderBy("timestamp", "desc"),
    limit(5)
  );
  unsubscribers.activity = onSnapshot(
    activityQuery, 
    (snapshot) => {
      loadActivityList(snapshot);
    },
    (error) => {
      console.error("Error loading activities:", error);
      // Don't show error for activities as it's not critical
    }
  );
}

// Load properties grid
function loadPropertiesGrid(snapshot) {
  const grid = document.getElementById('properties-grid');
  grid.innerHTML = '';
  
  if (snapshot.empty) {
    grid.innerHTML = `
      <div style="text-align: center; padding: 60px; grid-column: 1/-1;">
        <div style="font-size: 64px; margin-bottom: 16px;">🏠</div>
        <h3 style="margin: 0 0 8px 0; color: #333;">No properties yet</h3>
        <p style="color: #666; margin: 0 0 20px 0;">Click "Add New Property" to get started</p>
      </div>
    `;
    return;
  }

  snapshot.forEach((doc) => {
    const property = doc.data();
    const card = document.createElement('div');
    card.className = 'property-card';
    
    const occupancyRate = property.totalUnits > 0 
      ? ((property.occupiedUnits || 0) / property.totalUnits * 100).toFixed(0) 
      : 0;
    
    card.innerHTML = `
      <div class="property-image">🏢</div>
      <div class="property-name">${escapeHtml(property.name || 'Unnamed Property')}</div>
      <div class="property-info">📍 ${escapeHtml(property.location || property.city || 'No location')}</div>
      <div class="property-info">🛏️ ${property.totalUnits || 0} Units</div>
      <div class="property-occupancy">
        <div class="occupancy-bar">
          <div class="occupancy-fill" style="width: ${occupancyRate}%;"></div>
        </div>
        <div class="occupancy-text">${property.occupiedUnits || 0} of ${property.totalUnits || 0} occupied (${occupancyRate}%)</div>
      </div>
    `;
    
    // Make card clickable
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      window.location.href = 'properties.html';
    });
    
    grid.appendChild(card);
  });
}

// Load payments list
function loadPaymentsList(snapshot) {
  const list = document.getElementById('payment-list');
  list.innerHTML = '';
  
  if (snapshot.empty) {
    list.innerHTML = `
      <li class="activity-item" style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">💰</div>
        <div class="activity-details">No upcoming payments</div>
      </li>
    `;
    return;
  }

  snapshot.forEach((doc) => {
    const payment = doc.data();
    const item = document.createElement('li');
    item.className = 'payment-item';
    
    const dueDate = payment.dueDate?.toDate ? payment.dueDate.toDate() : new Date();
    const isOverdue = dueDate < new Date();
    const amount = Number(payment.amount) || 0;
    
    item.innerHTML = `
      <div class="payment-header">
        <div class="payment-tenant">${escapeHtml(payment.tenantName || 'Unknown Tenant')}</div>
        <div class="payment-amount">₱${amount.toLocaleString()}</div>
      </div>
      <div class="payment-info">${escapeHtml(payment.unitName || 'Unit')} • Due ${dueDate.toLocaleDateString()}</div>
      <span class="payment-status ${isOverdue ? 'status-overdue' : 'status-pending'}">
        ${isOverdue ? 'Overdue' : 'Pending'}
      </span>
    `;
    list.appendChild(item);
  });
}

// Load activity list
function loadActivityList(snapshot) {
  const list = document.getElementById('activity-list');
  list.innerHTML = '';
  
  if (snapshot.empty) {
    list.innerHTML = `
      <li class="activity-item">
        <div class="activity-icon">📝</div>
        <div class="activity-content">
          <div class="activity-title">Welcome to RentEase!</div>
          <div class="activity-details">Start by adding your first property</div>
          <div class="activity-time">Just now</div>
        </div>
      </li>
    `;
    return;
  }

  snapshot.forEach((doc) => {
    const activity = doc.data();
    const item = document.createElement('li');
    item.className = 'activity-item';
    
    const timestamp = activity.timestamp?.toDate ? activity.timestamp.toDate() : new Date();
    const timeAgo = getTimeAgo(timestamp);
    
    item.innerHTML = `
      <div class="activity-icon">${activity.icon || '📝'}</div>
      <div class="activity-content">
        <div class="activity-title">${escapeHtml(activity.title || 'Activity')}</div>
        <div class="activity-details">${escapeHtml(activity.details || '')}</div>
        <div class="activity-time">${timeAgo}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

// Helper: time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// Helper: escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper: show error message
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-banner';
  errorDiv.style.cssText = `
    background: #fee;
    border: 1px solid #fcc;
    color: #c33;
    padding: 12px 20px;
    border-radius: 8px;
    margin-bottom: 20px;
  `;
  errorDiv.innerHTML = `<strong>⚠️ Error:</strong> ${escapeHtml(message)}`;
  
  const main = document.querySelector('main');
  main.insertBefore(errorDiv, main.firstChild);
  
  setTimeout(() => errorDiv.remove(), 5000);
}

// Logout with cleanup
document.getElementById('logout-btn').addEventListener('click', async function() {
  if(confirm('Are you sure you want to logout?')) {
    try {
      cleanupListeners();
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Error signing out:", error);
      alert("Error logging out. Please try again.");
    }
  }
});

// Quick actions - with proper validation
document.getElementById('add-property-btn').addEventListener('click', function() {
  if (!this.disabled) {
    window.location.href = 'properties.html?action=add';
  }
});

document.getElementById('add-tenant-btn').addEventListener('click', function() {
  window.location.href = 'tenants.html?action=add';
});

document.getElementById('record-payment-btn').addEventListener('click', function() {
  if (userLimits.features.rentTracker) {
    window.location.href = 'rent-tracker.html?action=record';
  } else {
    alert('🔒 Upgrade to Pro to unlock Rent Tracker!');
  }
});

document.getElementById('generate-report-btn').addEventListener('click', function() {
  if (!this.disabled) {
    window.location.href = 'reports.html';
  } else {
    alert('🔒 Upgrade to Premium to unlock Advanced Reports!');
  }
});

// Modal functionality
const pricingModal = document.getElementById('pricingModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOverlay = document.querySelector('.modal-overlay');

function openPricingModal() {
  pricingModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePricingModal() {
  pricingModal.classList.remove('active');
  document.body.style.overflow = '';
}

// Open modal when upgrade button is clicked
const upgradeBanner = document.getElementById('upgrade-banner');
if (upgradeBanner) {
  const upgradeBtn = upgradeBanner.querySelector('.upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openPricingModal();
    });
  }
}

// Close modal handlers
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closePricingModal);
}

if (modalOverlay) {
  modalOverlay.addEventListener('click', closePricingModal);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && pricingModal.classList.contains('active')) {
    closePricingModal();
  }
});

// Handle plan button clicks
const planButtons = document.querySelectorAll('.plan-button');
planButtons.forEach(button => {
  button.addEventListener('click', function() {
    const planCard = this.closest('.pricing-card');
    const planNameElement = planCard.querySelector('h3');
    const planAmountElement = planCard.querySelector('.amount');
    
    let selectedPlan = {
      name: '',
      displayName: planNameElement.textContent,
      price: parseInt(planAmountElement.textContent),
      currency: '₱'
    };
    
    // Map UI names to backend plan names
    if (planNameElement.textContent === 'Pro') {
      selectedPlan.name = 'premium';
      selectedPlan.features = [
        'Up to 20 properties',
        'Advanced payment tracking',
        'Automated reminders',
        'Financial reports',
        'Priority support'
      ];
    } else if (planNameElement.textContent === 'Premium') {
      selectedPlan.name = 'platinum';
      selectedPlan.features = [
        'Unlimited properties',
        'All Pro features',
        'Multi-user access',
        'Custom integrations',
        '24/7 support'
      ];
    }
    
    sessionStorage.setItem('selectedPlan', JSON.stringify(selectedPlan));
    
    button.disabled = true;
    button.textContent = 'Redirecting...';
    
    setTimeout(() => {
      window.location.href = 'payment.html';
    }, 500);
  });
});

// Clean up listeners when page unloads
window.addEventListener('beforeunload', cleanupListeners);