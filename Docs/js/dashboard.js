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

// Plan limits configuration
const PLAN_LIMITS = {
  freemium: { 
    maxProperties: 2, 
    maxUnitsPerProperty: 4, 
    features: { properties: true, tenants: true, rentTracker: false, reports: false }
  },
  premium: {
    maxProperties: 20, 
    maxUnitsPerProperty: Infinity, 
    features: { properties: true, tenants: true, rentTracker: true, reports: false }
  },
  platinum: {
    maxProperties: Infinity, 
    maxUnitsPerProperty: Infinity, 
    features: { properties: true, tenants: true, rentTracker: true, reports: true }
  }
};

let currentUser = null;
let userPlan = 'freemium';
let userLimits = PLAN_LIMITS.freemium;

// Store chart instances
let charts = {
  revenue: null,
  paymentStatus: null,
  occupancy: null,
  propertyPerformance: null,
  tenantDistribution: null,
  collectionRate: null
};

// Store unsubscribe functions
let unsubscribers = {
  properties: null,
  tenants: null,
  activity: null
};

// Data for charts
let chartData = {
  properties: [],
  tenants: [],
  payments: [],
  revenueHistory: []
};

// Check authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      await loadUserData(user.uid);
      setupRealtimeDashboard(user.uid);
      initializeCharts();
    } catch (error) {
      console.error("Error initializing dashboard:", error);
      showError("Failed to load dashboard. Please refresh the page.");
    }
  } else {
    cleanupListeners();
    window.location.href = 'index.html';
  }
});

// Clean up all listeners
function cleanupListeners() {
  Object.values(unsubscribers).forEach(unsub => {
    if (unsub) unsub();
  });
  Object.values(charts).forEach(chart => {
    if (chart) chart.destroy();
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
                             userPlan === 'premium' ? 'Premium' : 'Platinum';
      planBadge.textContent = displayPlanName;
      planBadge.className = `plan-badge plan-${userPlan}`;

      const upgradeBanner = document.getElementById('upgrade-banner');
      if (userPlan !== 'platinum') {
        upgradeBanner.classList.remove('hidden');
        const bannerText = upgradeBanner.querySelector('p');
        if (userPlan === 'freemium') {
          bannerText.textContent = 'Unlock more properties and advanced features!';
        } else if (userPlan === 'premium') {
          bannerText.textContent = 'Upgrade to Platinum for unlimited properties!';
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
  const propertiesCount = userData.propertiesCount || 0;

  document.getElementById('property-limit-text').textContent = 
    userLimits.maxProperties !== Infinity 
      ? `(${propertiesCount}/${userLimits.maxProperties})` 
      : '(Unlimited)';

  if (propertiesCount >= userLimits.maxProperties && userLimits.maxProperties !== Infinity) {
    const addPropertyBtn = document.getElementById('add-property-btn');
    addPropertyBtn.disabled = true;
    addPropertyBtn.classList.add('btn-disabled');
    addPropertyBtn.title = `You've reached the ${userLimits.maxProperties} property limit`;

    const warningDiv = document.getElementById('limit-warning');
    warningDiv.innerHTML = `
      <strong>⚠️ Property Limit Reached</strong><br>
      You've reached the maximum of ${userLimits.maxProperties} properties.
      <a href="#" class="upgrade-link" style="color: #856404; text-decoration: underline; margin-left: 8px;">Upgrade to add more</a>
    `;
    warningDiv.classList.add('show');
    
    const upgradeLink = warningDiv.querySelector('.upgrade-link');
    if (upgradeLink) {
      upgradeLink.addEventListener('click', (e) => {
        e.preventDefault();
        openPricingModal();
      });
    }
  }

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

  if (!userLimits.features.reports) {
    const reportBtn = document.getElementById('generate-report-btn');
    if (reportBtn) {
      reportBtn.disabled = true;
      reportBtn.classList.add('btn-disabled');
      reportBtn.title = 'Upgrade to Premium to unlock Advanced Reports';
    }
  }
}

// Generate payments from tenants data
function generatePaymentsFromTenants(tenants) {
  const currentDate = new Date();
  const payments = [];
  
  tenants.forEach(tenant => {
    if (tenant.status === 'active' && tenant.moveInDate) {
      const moveInDate = tenant.moveInDate.toDate ? tenant.moveInDate.toDate() : new Date(tenant.moveInDate);
      const leaseEndDate = tenant.leaseEndDate?.toDate ? tenant.leaseEndDate.toDate() : new Date(2100, 0, 1);
      
      // Get the day of month when rent is due (from moveInDate)
      const dueDay = moveInDate.getDate();
      
      // Calculate current month's due date
      const currentMonthDueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dueDay);
      
      // If current month's due date has passed, check next month
      const nextMonthDueDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, dueDay);
      
      // Determine if we should show current or next month's payment
      let dueDate;
      let status;
      
      if (currentDate < currentMonthDueDate) {
        // Current month's payment is still upcoming
        dueDate = currentMonthDueDate;
        status = 'pending';
      } else if (currentDate.getDate() === dueDay) {
        // Today is the due date
        dueDate = currentMonthDueDate;
        status = 'pending';
      } else {
        // Current month's due date has passed
        // Check if it's overdue (more than 5 days past due)
        const daysPastDue = Math.floor((currentDate - currentMonthDueDate) / (1000 * 60 * 60 * 24));
        
        if (daysPastDue <= 5) {
          // Still within grace period - show as pending
          dueDate = currentMonthDueDate;
          status = 'pending';
        } else {
          // Overdue - show as overdue
          dueDate = currentMonthDueDate;
          status = 'overdue';
        }
      }
      
      // Only include if the due date is within the lease period
      if (dueDate >= moveInDate && dueDate <= leaseEndDate) {
        payments.push({
          id: `${tenant.id}_${dueDate.getTime()}`,
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          propertyId: tenant.propertyId,
          unitNumber: tenant.unitNumber,
          unitName: `Unit ${tenant.unitNumber}`,
          amount: tenant.monthlyRent,
          dueDate: dueDate,
          status: status,
          landlordId: tenant.landlordId
        });
      }
      
      // Also add next month's payment if current is not pending
      if (status !== 'pending' && nextMonthDueDate <= leaseEndDate) {
        payments.push({
          id: `${tenant.id}_${nextMonthDueDate.getTime()}`,
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          propertyId: tenant.propertyId,
          unitNumber: tenant.unitNumber,
          unitName: `Unit ${tenant.unitNumber}`,
          amount: tenant.monthlyRent,
          dueDate: nextMonthDueDate,
          status: 'pending',
          landlordId: tenant.landlordId
        });
      }
    }
  });
  
  return payments;
}

// Real-time dashboard setup
function setupRealtimeDashboard(uid) {
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
      
      chartData.properties = [];
      snapshot.forEach(doc => {
        chartData.properties.push({ id: doc.id, ...doc.data() });
      });
      
      loadPropertiesGrid(snapshot);
      updateCharts();
    },
    (error) => console.error("Error loading properties:", error)
  );

  const tenantsQuery = query(collection(db, "tenants"), where("landlordId", "==", uid));
  unsubscribers.tenants = onSnapshot(
    tenantsQuery, 
    (snapshot) => {
      const tenantsCount = snapshot.size;
      let monthlyRevenue = 0;

      chartData.tenants = [];
      snapshot.forEach((doc) => {
        const tenant = doc.data();
        chartData.tenants.push({ id: doc.id, ...tenant });
        
        if (tenant.status === 'active' && tenant.monthlyRent) {
          monthlyRevenue += Number(tenant.monthlyRent) || 0;
        }
      });

      // Generate payments from tenants
      chartData.payments = generatePaymentsFromTenants(chartData.tenants);
      
      // Count pending payments
      const pendingCount = chartData.payments.filter(p => p.status === 'pending' || p.status === 'overdue').length;

      document.getElementById('active-tenants').textContent = tenantsCount;
      
      const tenantChange = document.getElementById('tenant-change');
      tenantChange.textContent = tenantsCount > 0 ? 
        `${tenantsCount} active ${tenantsCount === 1 ? 'tenant' : 'tenants'}` : 
        'No tenants yet';
      tenantChange.className = tenantsCount > 0 ? 'stat-change positive' : 'stat-change';

      document.getElementById('monthly-revenue').textContent = `₱${monthlyRevenue.toLocaleString()}`;
      
      const revenueChange = document.getElementById('revenue-change');
      revenueChange.textContent = monthlyRevenue > 0 ? 'Expected this month' : 'No revenue yet';
      revenueChange.className = monthlyRevenue > 0 ? 'stat-change positive' : 'stat-change';
      
      // Update pending payments display
      document.getElementById('pending-payments').textContent = pendingCount;
      
      const paymentChange = document.getElementById('payment-change');
      paymentChange.textContent = pendingCount > 0 ? 'Action needed' : 'All clear';
      paymentChange.className = pendingCount > 0 ? 'stat-change negative' : 'stat-change';
      
      // Load pending/overdue payments in the list
      const upcomingPayments = chartData.payments
        .filter(p => p.status === 'pending' || p.status === 'overdue')
        .sort((a, b) => a.dueDate - b.dueDate);
      
      loadPaymentsList(upcomingPayments);
      updateCharts();
    },
    (error) => console.error("Error loading tenants:", error)
  );

  const activityQuery = query(
    collection(db, "activities"),
    where("userId", "==", uid),
    orderBy("timestamp", "desc"),
    limit(5)
  );
  unsubscribers.activity = onSnapshot(
    activityQuery, 
    (snapshot) => loadActivityList(snapshot),
    (error) => console.error("Error loading activities:", error)
  );
}

// Initialize all charts
function initializeCharts() {
  const chartColors = {
    primary: '#2fc4b2',
    secondary: '#107266',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    purple: '#8b5cf6',
    pink: '#ec4899'
  };

  // Revenue Trend Chart
  const revenueCtx = document.getElementById('revenueChart');
  if (revenueCtx) {
    charts.revenue = new Chart(revenueCtx, {
      type: 'line',
      data: {
        labels: getLast6Months(),
        datasets: [{
          label: 'Monthly Revenue',
          data: generateRevenueData(),
          borderColor: chartColors.primary,
          backgroundColor: 'rgba(47, 196, 178, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: chartColors.primary,
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: (context) => `Revenue: ₱${context.parsed.y.toLocaleString()}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => `₱${value.toLocaleString()}`
            },
            grid: { color: 'rgba(0, 0, 0, 0.05)' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // Payment Status Chart
  const paymentStatusCtx = document.getElementById('paymentStatusChart');
  if (paymentStatusCtx) {
    charts.paymentStatus = new Chart(paymentStatusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Pending', 'Overdue'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: [chartColors.success, chartColors.warning, chartColors.danger],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.parsed}`
            }
          }
        }
      }
    });
  }

  // Occupancy Rate Chart
  const occupancyCtx = document.getElementById('occupancyChart');
  if (occupancyCtx) {
    charts.occupancy = new Chart(occupancyCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Occupancy Rate (%)',
          data: [],
          backgroundColor: chartColors.primary,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    });
  }

  // Property Performance Chart
  const propertyPerformanceCtx = document.getElementById('propertyPerformanceChart');
  if (propertyPerformanceCtx) {
    charts.propertyPerformance = new Chart(propertyPerformanceCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Monthly Revenue',
          data: [],
          backgroundColor: [
            chartColors.primary,
            chartColors.info,
            chartColors.purple,
            chartColors.pink,
            chartColors.warning
          ],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Revenue: ₱${context.parsed.y.toLocaleString()}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => `₱${value.toLocaleString()}`
            }
          }
        }
      }
    });
  }

  // Tenant Distribution Chart
  const tenantDistributionCtx = document.getElementById('tenantDistributionChart');
  if (tenantDistributionCtx) {
    charts.tenantDistribution = new Chart(tenantDistributionCtx, {
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
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // Collection Rate Chart
  const collectionRateCtx = document.getElementById('collectionRateChart');
  if (collectionRateCtx) {
    charts.collectionRate = new Chart(collectionRateCtx, {
      type: 'line',
      data: {
        labels: getLast6Months(),
        datasets: [{
          label: 'Collection Rate',
          data: generateCollectionData(),
          borderColor: chartColors.success,
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    });
  }
}

// Update charts with real data
function updateCharts() {
  // Update Payment Status Chart
  if (charts.paymentStatus && chartData.payments) {
    const paid = chartData.payments.filter(p => p.status === 'paid').length;
    const pending = chartData.payments.filter(p => p.status === 'pending').length;
    const overdue = chartData.payments.filter(p => p.status === 'overdue').length;
    
    charts.paymentStatus.data.datasets[0].data = [paid, pending, overdue];
    charts.paymentStatus.update();
  }

  // Update Occupancy Chart
  if (charts.occupancy && chartData.properties) {
    const propertyNames = chartData.properties.map(p => p.name || 'Unnamed');
    const occupancyRates = chartData.properties.map(p => {
      const total = p.totalUnits || 1;
      const occupied = p.occupiedUnits || 0;
      return ((occupied / total) * 100).toFixed(1);
    });
    
    charts.occupancy.data.labels = propertyNames;
    charts.occupancy.data.datasets[0].data = occupancyRates;
    charts.occupancy.update();
  }

  // Update Property Performance Chart
  if (charts.propertyPerformance && chartData.properties) {
    const propertyRevenues = chartData.properties.map(p => {
      const tenants = chartData.tenants.filter(t => t.propertyId === p.id && t.status === 'active');
      return tenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);
    });
    
    charts.propertyPerformance.data.labels = chartData.properties.map(p => p.name || 'Unnamed');
    charts.propertyPerformance.data.datasets[0].data = propertyRevenues;
    charts.propertyPerformance.update();
  }

  // Update Tenant Distribution Chart
  if (charts.tenantDistribution && chartData.tenants) {
    const active = chartData.tenants.filter(t => t.status === 'active').length;
    const inactive = chartData.tenants.filter(t => t.status !== 'active').length;
    
    charts.tenantDistribution.data.datasets[0].data = [active, inactive];
    charts.tenantDistribution.update();
  }

  // Update Revenue Chart
  if (charts.revenue) {
    charts.revenue.data.datasets[0].data = generateRevenueData();
    charts.revenue.update();
  }

  // Update Collection Rate Chart
  if (charts.collectionRate) {
    charts.collectionRate.data.datasets[0].data = generateCollectionData();
    charts.collectionRate.update();
  }
}

// Helper functions
function getLast6Months() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const result = [];
  const date = new Date();
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
    result.push(months[d.getMonth()]);
  }
  
  return result;
}

function generateRevenueData(monthsCount = 6) {
  // Calculate real revenue from tenants data
  const result = [];
  const currentDate = new Date();
  
  for (let i = monthsCount - 1; i >= 0; i--) {
    const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    
    // Calculate revenue from active tenants in that month
    let monthRevenue = 0;
    chartData.tenants.forEach(tenant => {
      if (tenant.status === 'active') {
        const moveInDate = tenant.moveInDate?.toDate ? tenant.moveInDate.toDate() : new Date(0);
        const leaseEndDate = tenant.leaseEndDate?.toDate ? tenant.leaseEndDate.toDate() : new Date(2100, 0, 1);
        
        // Check if tenant was active during this month
        if (moveInDate <= monthEnd && leaseEndDate >= monthStart) {
          monthRevenue += Number(tenant.monthlyRent) || 0;
        }
      }
    });
    
    result.push(monthRevenue);
  }
  
  return result;
}

function generateCollectionData(monthsCount = 6) {
  // Calculate real collection rates from payments
  const result = [];
  const currentDate = new Date();
  
  for (let i = monthsCount - 1; i >= 0; i--) {
    const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
    
    // Count payments for this month
    const monthPayments = chartData.payments.filter(payment => {
      const dueDate = payment.dueDate;
      if (!dueDate) return false;
      return dueDate >= monthStart && dueDate <= monthEnd;
    });
    
    if (monthPayments.length === 0) {
      result.push(0);
      continue;
    }
    
    // Calculate collection rate: paid / total payments
    const paidPayments = monthPayments.filter(p => p.status === 'paid').length;
    const rate = (paidPayments / monthPayments.length) * 100;
    result.push(Math.round(rate));
  }
  
  return result;
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
      <div class="property-info">📍 ${escapeHtml(property.address || property.city || 'No location')}</div>
      <div class="property-info">🛏️ ${property.totalUnits || 0} Units</div>
      <div class="property-occupancy">
        <div class="occupancy-bar">
          <div class="occupancy-fill" style="width: ${occupancyRate}%;"></div>
        </div>
        <div class="occupancy-text">${property.occupiedUnits || 0} of ${property.totalUnits || 0} occupied (${occupancyRate}%)</div>
      </div>
    `;
    
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      window.location.href = 'properties.html';
    });
    
    grid.appendChild(card);
  });
}

// Load payments list
function loadPaymentsList(payments) {
  const list = document.getElementById('payment-list');
  list.innerHTML = '';
  
  if (!payments || payments.length === 0) {
    list.innerHTML = `
      <li class="activity-item" style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">💰</div>
        <div class="activity-details">No upcoming payments</div>
      </li>
    `;
    return;
  }

  // Show only first 5
  payments.slice(0, 5).forEach((payment) => {
    const item = document.createElement('li');
    item.className = 'payment-item';
    
    const dueDate = payment.dueDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    const isOverdue = due < today;
    const isDueToday = due.getTime() === today.getTime();
    const amount = Number(payment.amount) || 0;
    
    let dueDateText;
    if (isDueToday) {
      dueDateText = 'Due Today';
    } else if (isOverdue) {
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      dueDateText = `${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue`;
    } else {
      const daysUntilDue = Math.floor((due - today) / (1000 * 60 * 60 * 24));
      if (daysUntilDue === 0) {
        dueDateText = 'Due Today';
      } else if (daysUntilDue === 1) {
        dueDateText = 'Due Tomorrow';
      } else if (daysUntilDue <= 7) {
        dueDateText = `Due in ${daysUntilDue} days`;
      } else {
        dueDateText = `Due ${dueDate.toLocaleDateString()}`;
      }
    }
    
    item.innerHTML = `
      <div class="payment-header">
        <div class="payment-tenant">${escapeHtml(payment.tenantName || 'Unknown Tenant')}</div>
        <div class="payment-amount">₱${amount.toLocaleString()}</div>
      </div>
      <div class="payment-info">${escapeHtml(payment.unitName || payment.unitNumber || 'Unit')} • ${dueDateText}</div>
      <span class="payment-status ${isOverdue ? 'status-overdue' : isDueToday ? 'status-pending' : 'status-pending'}">
        ${isOverdue ? 'Overdue' : isDueToday ? 'Due Today' : 'Upcoming'}
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

// Helper functions
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

// Event Listeners
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

// Revenue period selector
const revenuePeriodSelect = document.getElementById('revenue-period');
if (revenuePeriodSelect) {
  revenuePeriodSelect.addEventListener('change', function() {
    const period = parseInt(this.value);
    if (charts.revenue) {
      charts.revenue.data.labels = getMonthLabels(period);
      charts.revenue.data.datasets[0].data = generateRevenueData(period);
      charts.revenue.update();
    }
    if (charts.collectionRate) {
      charts.collectionRate.data.labels = getMonthLabels(period);
      charts.collectionRate.data.datasets[0].data = generateCollectionData(period);
      charts.collectionRate.update();
    }
  });
}

function getMonthLabels(count) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const result = [];
  const date = new Date();
  
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
    result.push(months[d.getMonth()]);
  }
  
  return result;
}

// Clean up listeners when page unloads
window.addEventListener('beforeunload', cleanupListeners);