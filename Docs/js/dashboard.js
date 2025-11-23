// Dashboard page
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



// Add at the beginning after imports
let paymentsListener = null;
let allUpcomingPayments = [];
let currentPaymentFilter = 'all';

// Mobile menu functionality
document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', function() {
      sidebar.classList.toggle('mobile-open');
      sidebarOverlay.classList.toggle('active');
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function() {
      sidebar.classList.remove('mobile-open');
      sidebarOverlay.classList.remove('active');
    });
  }

  // Close sidebar when clicking navigation links on mobile
  const navLinks = sidebar.querySelectorAll('a');
  navLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
      }
    });
  });
});

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
  // Clean up payment listener
  if (paymentsListener) {
    paymentsListener();
    paymentsListener = null;
  }
  
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
      
      // Load real payments from Firestore with live updates
      loadRealPayments(uid);
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

// Add new function to load real payments with live updates
function loadRealPayments(uid) {
  // Clean up existing listener
  if (paymentsListener) {
    paymentsListener();
  }

  // Remove orderBy to avoid index requirement - sort in JavaScript instead
  const paymentsQuery = query(
    collection(db, "payments"),
    where("landlordId", "==", uid)
  );

  paymentsListener = onSnapshot(
    paymentsQuery,
    (snapshot) => {
      const realPayments = [];
      snapshot.forEach(doc => {
        const payment = doc.data();
        const dueDate = payment.dueDate?.toDate ? payment.dueDate.toDate() : new Date(payment.dueDate);
        
        realPayments.push({ 
          id: doc.id, 
          ...payment,
          dueDate: dueDate
        });
      });

      // Sort by due date in JavaScript (newest first for processing)
      realPayments.sort((a, b) => b.dueDate - a.dueDate);

      // Generate expected payments from tenants
      const expectedPayments = generatePaymentsFromTenants(chartData.tenants);

      // Merge real payments with expected ones
      chartData.payments = mergePayments(expectedPayments, realPayments);

      // Count only pending/overdue payments (exclude paid)
      const pendingCount = chartData.payments.filter(p => 
        p.status === 'pending' || p.status === 'overdue'
      ).length;

      // Update pending payments display
      document.getElementById('pending-payments').textContent = pendingCount;
      
      const paymentChange = document.getElementById('payment-change');
      paymentChange.textContent = pendingCount > 0 ? 'Action needed' : 'All clear';
      paymentChange.className = pendingCount > 0 ? 'stat-change negative' : 'stat-change positive';
      
      // Load only pending/overdue payments in the list (excluding paid)
      const upcomingPayments = chartData.payments
        .filter(p => p.status === 'pending' || p.status === 'overdue')
        .sort((a, b) => a.dueDate - b.dueDate); // Sort by due date (oldest first for display)
      
      loadPaymentsList(upcomingPayments);
      updateCharts();
    },
    (error) => console.error("Error loading payments:", error)
  );
}

// Add new function to merge expected and real payments
function mergePayments(expectedPayments, realPayments) {
  const merged = [];
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  expectedPayments.forEach(expected => {
    // Check if this payment exists in real payments
    const real = realPayments.find(p => 
      p.tenantId === expected.tenantId && 
      p.dueDate && 
      Math.abs(p.dueDate.getTime() - expected.dueDate.getTime()) < 86400000 // Within 1 day
    );

    if (real) {
      // Use real payment data from Firestore (this includes the actual status)
      // Only include if status is NOT "paid"
      if (real.status !== 'paid') {
        merged.push({
          ...expected,
          id: real.id,
          status: real.status, // Use Firestore status (overdue, pending, etc)
          paidDate: real.paidDate,
          paidAmount: real.paidAmount,
          paymentMethod: real.paymentMethod,
          notes: real.notes,
          dueDate: real.dueDate,
          createdAt: real.createdAt,
          updatedAt: real.updatedAt
        });
      }
      // If status is "paid", don't add to merged array (it will be excluded)
    } else {
      // No real payment record exists yet, use expected payment
      const dueDate = expected.dueDate;
      const daysPastDue = Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24));
      
      if (daysPastDue > 5 && expected.status === 'pending') {
        expected.status = 'overdue';
      }
      
      merged.push(expected);
    }
  });

  // Add any real payments that don't match expected (manual entries)
  // But ONLY if they are not marked as "paid"
  realPayments.forEach(real => {
    if (real.status === 'paid') {
      return; // Skip paid payments
    }
    
    const exists = merged.find(m => m.id === real.id);
    
    if (!exists) {
      merged.push({
        id: real.id,
        tenantId: real.tenantId,
        tenantName: real.tenantName || 'Unknown Tenant',
        propertyId: real.propertyId,
        unitNumber: real.unitNumber,
        unitName: real.unitName || `Unit ${real.unitNumber}`,
        amount: real.amount,
        dueDate: real.dueDate,
        status: real.status,
        landlordId: real.landlordId,
        paidDate: real.paidDate,
        paidAmount: real.paidAmount,
        paymentMethod: real.paymentMethod,
        notes: real.notes,
        createdAt: real.createdAt,
        updatedAt: real.updatedAt
      });
    }
  });

  return merged;
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

function openPricingModal(currentPlan) {
  if (!pricingModal) {
    showError('Pricing modal not found. Please refresh the page.');
    return;
  }

  // Get pricing cards container
  const pricingCards = pricingModal.querySelector('.pricing-cards');
  if (!pricingCards) return;

  // Clear existing cards
  pricingCards.innerHTML = '';

  // Define plans to show based on current plan
  const plans = [];
  
  if (currentPlan === 'freemium') {
    // Show both Pro and Premium plans
    plans.push({
      name: 'premium',
      displayName: 'Premium',
      price: 499,
      description: 'For growing landlords',
      features: [
        'Up to 20 properties',
        'Advanced payment tracking',
        'Automated reminders',
        'Financial reports',
        'Priority support'
      ],
      isFeatured: true
    });
    
    plans.push({
      name: 'platinum',
      displayName: 'Platinum',
      price: 999,
      description: 'For property managers',
      features: [
        'Unlimited properties',
        'All Pro features',
        'Multi-user access',
        'Custom integrations',
        '24/7 support'
      ],
      isFeatured: false
    });
  } else if (currentPlan === 'premium') {
    // Show only Premium plan
    plans.push({
      name: 'platinum',
      displayName: 'Platinum',
      price: 999,
      description: 'For property managers',
      features: [
        'Unlimited properties',
        'All Pro features',
        'Multi-user access',
        'Custom integrations',
        '24/7 support'
      ],
      isFeatured: true
    });
  }

  // Generate HTML for each plan
  plans.forEach(plan => {
    const cardDiv = document.createElement('div');
    cardDiv.className = `pricing-card${plan.isFeatured ? ' featured' : ''}`;
    
    cardDiv.innerHTML = `
      ${plan.isFeatured ? '<div class="popular-badge">Most Popular</div>' : ''}
      <div class="plan-header">
        <h3>${plan.displayName}</h3>
        <div class="plan-price">
          <span class="currency">₱</span>
          <span class="amount">${plan.price}</span>
          <span class="period">/month</span>
        </div>
        <p class="plan-description">${plan.description}</p>
      </div>
      <ul class="plan-features">
        ${plan.features.map(feature => `<li><span class="check">✓</span> ${feature}</li>`).join('')}
      </ul>
      <button class="plan-button ${plan.isFeatured ? 'pro-button' : 'enterprise-button'}">
        ${plan.isFeatured ? 'Recommended' : 'Continue'}
      </button>
    `;
    
    pricingCards.appendChild(cardDiv);
  });

  // Add event listeners to plan buttons
  const planButtons = pricingModal.querySelectorAll('.plan-button');
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
      sessionStorage.setItem('returnTo', 'dashboard.html');
      
      button.disabled = true;
      button.textContent = 'Redirecting...';
      
      setTimeout(() => {
        window.location.href = 'payment.html';
      }, 500);
    });
  });

  // Show modal
  pricingModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePricingModal() {
  if (pricingModal) {
    pricingModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

const upgradeBanner = document.getElementById('upgrade-banner');
if (upgradeBanner) {
  const upgradeBtn = upgradeBanner.querySelector('.upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openPricingModal(userPlan);
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
  if (e.key === 'Escape' && pricingModal && pricingModal.classList.contains('active')) {
    closePricingModal();
  }
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

// Add new function to open payments modal
function openPaymentsModal() {
  const paymentsModal = document.getElementById('paymentsModal');
  if (!paymentsModal) return;

  // Get all pending and overdue payments
  allUpcomingPayments = chartData.payments
    .filter(p => p.status === 'pending' || p.status === 'overdue')
    .sort((a, b) => a.dueDate - b.dueDate);

  // Reset filter
  currentPaymentFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });

  // Load payments
  loadModalPayments(allUpcomingPayments);

  // Show modal
  paymentsModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePaymentsModal() {
  const paymentsModal = document.getElementById('paymentsModal');
  if (paymentsModal) {
    paymentsModal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function loadModalPayments(payments) {
  const list = document.getElementById('paymentsModalList');
  if (!list) return;

  list.innerHTML = '';

  if (!payments || payments.length === 0) {
    list.innerHTML = `
      <div class="no-payments-message">
        <div class="icon">✅</div>
        <h3>All Clear!</h3>
        <p>No ${currentPaymentFilter === 'all' ? 'upcoming' : currentPaymentFilter} payments at the moment</p>
      </div>
    `;
    return;
  }

  payments.forEach(payment => {
    const item = document.createElement('div');
    item.className = 'modal-payment-item';

    const dueDate = payment.dueDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const isOverdue = due < today;
    const isDueToday = due.getTime() === today.getTime();
    const amount = Number(payment.amount) || 0;

    let dueDateText;
    let dueClass;
    if (isDueToday) {
      dueDateText = '⚠️ Due Today';
      dueClass = 'today';
    } else if (isOverdue) {
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      dueDateText = `🔴 ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue`;
      dueClass = 'overdue';
    } else {
      const daysUntilDue = Math.floor((due - today) / (1000 * 60 * 60 * 24));
      if (daysUntilDue === 1) {
        dueDateText = '⚠️ Due Tomorrow';
        dueClass = 'today';
      } else if (daysUntilDue <= 7) {
        dueDateText = `🟡 Due in ${daysUntilDue} days`;
        dueClass = 'upcoming';
      } else {
        dueDateText = `🟢 Due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        dueClass = 'upcoming';
      }
    }

    item.innerHTML = `
      <div class="modal-payment-header">
        <div class="modal-payment-tenant">${escapeHtml(payment.tenantName || 'Unknown Tenant')}</div>
        <div class="modal-payment-amount">₱${amount.toLocaleString()}</div>
      </div>
      <div class="modal-payment-details">
        <div class="modal-payment-detail">
          <span class="modal-payment-detail-icon">🏠</span>
          <span>${escapeHtml(payment.unitName || payment.unitNumber || 'Unit')}</span>
        </div>
        <div class="modal-payment-detail">
          <span class="modal-payment-detail-icon">📅</span>
          <span>Due: ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
      <div class="modal-payment-footer">
        <span class="modal-payment-due ${dueClass}">${dueDateText}</span>
        <span class="payment-status ${isOverdue ? 'status-overdue' : isDueToday ? 'status-pending' : 'status-pending'}">
          ${isOverdue ? 'Overdue' : isDueToday ? 'Due Today' : 'Upcoming'}
        </span>
      </div>
    `;

    list.appendChild(item);
  });
}

// Update the "View All" link event listener
document.addEventListener('DOMContentLoaded', function() {
  // ...existing mobile menu code...

  // Add event listener for View All link in Upcoming Payments
  const viewAllPaymentsLink = document.querySelector('.card-header a[href="rent-tracker.html"]');
  if (viewAllPaymentsLink) {
    viewAllPaymentsLink.addEventListener('click', function(e) {
      e.preventDefault();
      openPaymentsModal();
    });
  }

  // Add event listeners for payment filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // Update active state
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      // Get filter value
      currentPaymentFilter = this.dataset.filter;

      // Filter payments
      let filteredPayments = allUpcomingPayments;
      if (currentPaymentFilter === 'pending') {
        filteredPayments = allUpcomingPayments.filter(p => p.status === 'pending');
      } else if (currentPaymentFilter === 'overdue') {
        filteredPayments = allUpcomingPayments.filter(p => p.status === 'overdue');
      }

      // Reload list
      loadModalPayments(filteredPayments);
    });
  });

  // Add event listener for close payments modal button
  const closePaymentsModalBtn = document.getElementById('closePaymentsModal');
  if (closePaymentsModalBtn) {
    closePaymentsModalBtn.addEventListener('click', closePaymentsModal);
  }

  // Add event listener for payments modal overlay
  const paymentsModal = document.getElementById('paymentsModal');
  if (paymentsModal) {
    const overlay = paymentsModal.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', closePaymentsModal);
    }
  }
});

// Update the keydown event listener to handle both modals
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const pricingModal = document.getElementById('pricingModal');
    const paymentsModal = document.getElementById('paymentsModal');
    
    if (pricingModal && pricingModal.classList.contains('active')) {
      closePricingModal();
    }
    
    if (paymentsModal && paymentsModal.classList.contains('active')) {
      closePaymentsModal();
    }
  }
});