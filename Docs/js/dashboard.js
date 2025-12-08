// Dashboard page
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, orderBy, limit, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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
let paidPaymentRecords = new Map(); // Add this line

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
  
  // Clear data
  paidPaymentRecords.clear();
  allUpcomingPayments = [];
  chartData.payments = [];
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
      reportBtn.classList.add('btn-locked');
      reportBtn.title = 'Upgrade to Platinum to unlock Advanced Reports';
    }
  }
}

// Add new function to load paid payments
async function loadPaidPayments(uid) {
  try {
    const paymentsQuery = query(collection(db, "payments"), where("landlordId", "==", uid));
    
    paymentsListener = onSnapshot(paymentsQuery, (snapshot) => {
      paidPaymentRecords.clear();
      snapshot.forEach((doc) => {
        const payment = doc.data();
        const dueDate = payment.dueDate?.toDate ? payment.dueDate.toDate() : new Date(payment.dueDate);
        const key = `${payment.tenantId}_${dueDate.getTime()}`;
        paidPaymentRecords.set(key, { id: doc.id, ...payment });
      });
      
      // Regenerate payments after loading paid records
      if (chartData.tenants.length > 0) {
        generatePaymentsFromTenants();
      }
    });
  } catch (error) {
    console.error("Error loading paid payments:", error);
  }
}

// Generate payments from tenants data
function generatePaymentsFromTenants() {
  const currentDate = new Date();
  const payments = [];
  
  chartData.tenants.forEach(tenant => {
    if (tenant.status === 'active' && tenant.moveInDate) {
      const moveInDate = tenant.moveInDate.toDate ? tenant.moveInDate.toDate() : new Date(tenant.moveInDate);
      const leaseEndDate = tenant.leaseEndDate?.toDate ? tenant.leaseEndDate.toDate() : new Date(2100, 0, 1);
      const dueDay = moveInDate.getDate();
      
      // Generate payments for last 6 months and next 3 months
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
        
        // Only add non-paid payments to the list
        if (status !== 'paid') {
          payments.push({
            id: paymentId,
            tenantId: tenant.id,
            tenantName: `${tenant.firstName} ${tenant.lastName}`,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            propertyId: tenant.propertyId,
            unitNumber: tenant.unitNumber,
            unitName: `Unit ${tenant.unitNumber}`,
            amount: tenant.monthlyRent,
            dueDate: dueDate,
            status: status,
            landlordId: tenant.landlordId,
            month: dueDate.getMonth(),
            year: dueDate.getFullYear(),
            paidDate: paidRecord?.paidDate
          });
        }
      }
    }
  });
  
  // Sort by due date (oldest first)
  payments.sort((a, b) => a.dueDate - b.dueDate);
  
  // Store all payments for charts and stats
  chartData.payments = payments;
  
  // Update stats and UI
  updateStats();
  updateCharts();
  
  // Load only upcoming payments (not overdue from past months)
  const upcomingPayments = payments.filter(p => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(p.dueDate);
    due.setHours(0, 0, 0, 0);
    return due >= today || p.status === 'overdue';
  });
  
  loadPaymentsList(upcomingPayments);
  allUpcomingPayments = upcomingPayments;
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
      
      // Generate payments when tenants data changes
      if (paidPaymentRecords.size > 0 || chartData.tenants.length > 0) {
        generatePaymentsFromTenants();
      }
      
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
  
  // Load paid payments with real-time updates
  loadPaidPayments(uid);
}

// Update stats
function updateStats() {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const currentMonthPayments = chartData.payments.filter(p => 
    p.month === currentMonth && p.year === currentYear
  );
  
  const totalExpected = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const collected = currentMonthPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
  const pending = currentMonthPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
  const overdueCount = currentMonthPayments.filter(p => p.status === 'overdue').length;
  
  // Count only pending and overdue payments (exclude paid)
  const pendingPaymentsCount = chartData.payments.filter(p => 
    p.status === 'pending' || p.status === 'overdue'
  ).length;
  
  document.getElementById('total-properties').textContent = chartData.properties.length;
  document.getElementById('active-tenants').textContent = chartData.tenants.filter(t => t.status === 'active').length;
  document.getElementById('monthly-revenue').textContent = `₱${totalExpected.toLocaleString()}`;
  document.getElementById('pending-payments').textContent = pendingPaymentsCount;
  
  const paymentChange = document.getElementById('payment-change');
  paymentChange.textContent = pendingPaymentsCount > 0 ? 'Action needed' : 'All clear';
  paymentChange.className = pendingPaymentsCount > 0 ? 'stat-change negative' : 'stat-change positive';
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
  // Check if user has access to reports
  if (!userLimits.features.reports) {
    openPricingModal(userPlan);
    return;
  }
  generateReport();
});

// Generate Report Function
function generateReport() {
  const reportModal = document.getElementById('reportModal');
  if (!reportModal) {
    console.error('Report modal not found');
    return;
  }

  // Set report date
  document.getElementById('reportDate').textContent = `Generated on: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`;

  // Calculate summary stats from actual data
  const totalProperties = chartData.properties.length;
  const activeTenants = chartData.tenants.filter(t => t.status === 'active').length;
  
  // Calculate current month revenue
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthPayments = chartData.payments.filter(p => 
    p.month === currentMonth && p.year === currentYear
  );
  const monthlyRevenue = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  // Calculate collection rate
  const totalExpected = currentMonthPayments.length;
  const totalCollected = currentMonthPayments.filter(p => p.status === 'paid').length;
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
  
  // Populate summary stats
  document.getElementById('report-properties').textContent = totalProperties;
  document.getElementById('report-tenants').textContent = activeTenants;
  document.getElementById('report-revenue').textContent = ` ${monthlyRevenue.toLocaleString()}`;
  document.getElementById('report-collection').textContent = `${collectionRate}%`;

  // Populate properties table
  const propertiesTableBody = document.querySelector('#report-properties-table tbody');
  if (propertiesTableBody) {
    if (chartData.properties && chartData.properties.length > 0) {
      propertiesTableBody.innerHTML = chartData.properties.map(prop => {
        // Calculate revenue for this property
        const propertyTenants = chartData.tenants.filter(t => 
          t.propertyId === prop.id && t.status === 'active'
        );
        const propertyRevenue = propertyTenants.reduce((sum, t) => 
          sum + (Number(t.monthlyRent) || 0), 0
        );
        
        // Calculate occupancy rate
        const totalUnits = prop.totalUnits || 0;
        const occupiedUnits = prop.occupiedUnits || 0;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
        
        return `
          <tr>
            <td>${escapeHtml(prop.name || 'Unnamed')}</td>
            <td>${escapeHtml(prop.address || prop.city || 'N/A')}</td>
            <td>${totalUnits}</td>
            <td>${occupiedUnits}</td>
            <td>${occupancyRate}%</td>
            <td>₱${propertyRevenue.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    } else {
      propertiesTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No properties to display</td></tr>';
    }
  }

  // Populate tenants table
  const tenantsTableBody = document.querySelector('#report-tenants-table tbody');
  if (tenantsTableBody) {
    if (chartData.tenants && chartData.tenants.length > 0) {
      tenantsTableBody.innerHTML = chartData.tenants.map(tenant => {
        // Get property name
        const property = chartData.properties.find(p => p.id === tenant.propertyId);
        const propertyName = property ? property.name : 'N/A';
        
        // Format tenant name
        const tenantName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Unknown';
        
        // Format move-in date
        let moveInDateText = 'N/A';
        if (tenant.moveInDate) {
          const moveInDate = tenant.moveInDate.toDate ? tenant.moveInDate.toDate() : new Date(tenant.moveInDate);
          moveInDateText = moveInDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          });
        }
        
        return `
          <tr>
            <td>${escapeHtml(tenantName)}</td>
            <td>${escapeHtml(propertyName)}</td>
            <td>${escapeHtml(tenant.unitNumber || 'N/A')}</td>
            <td>₱${(Number(tenant.monthlyRent) || 0).toLocaleString()}</td>
            <td><span class="status-badge ${tenant.status === 'active' ? 'status-active' : 'status-inactive'}">${escapeHtml(tenant.status || 'N/A')}</span></td>
            <td>${moveInDateText}</td>
          </tr>
        `;
      }).join('');
    } else {
      tenantsTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">No tenants to display</td></tr>';
    }
  }

  // Populate payment stats
  const paidPayments = chartData.payments.filter(p => p.status === 'paid').length;
  const pendingPayments = chartData.payments.filter(p => p.status === 'pending').length;
  const overduePayments = chartData.payments.filter(p => p.status === 'overdue').length;
  const totalExpectedAmount = chartData.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  document.getElementById('report-paid').textContent = paidPayments;
  document.getElementById('report-pending').textContent = pendingPayments;
  document.getElementById('report-overdue').textContent = overduePayments;
  document.getElementById('report-expected').textContent = `₱${totalExpectedAmount.toLocaleString()}`;

  // Show modal
  reportModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close Report Modal
function closeReportModal() {
  const reportModal = document.getElementById('reportModal');
  if (reportModal) {
    reportModal.classList.remove('active');
    document.body.style.overflow = 'auto';
  }
}

// Report modal close handlers
const closeReportModalBtn = document.getElementById('closeReportModal');
if (closeReportModalBtn) {
  closeReportModalBtn.addEventListener('click', closeReportModal);
}

const reportModalOverlay = document.querySelector('#reportModal .modal-overlay');
if (reportModalOverlay) {
  reportModalOverlay.addEventListener('click', closeReportModal);
}

// Export PDF function
document.getElementById('exportPdfBtn')?.addEventListener('click', async function() {
  try {
    // Load jsPDF and autoTable if not already loaded
    if (typeof window.jspdf === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    // Load jsPDF autoTable plugin for tables
    if (typeof window.jspdf.jsPDF.prototype.autoTable === 'undefined') {
      const autoTableScript = document.createElement('script');
      autoTableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js';
      document.head.appendChild(autoTableScript);
      await new Promise(resolve => autoTableScript.onload = resolve);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPos = 20;
    
    // Header
    doc.setFillColor(26, 33, 49); // Dark blue
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('RentEase Business Report', 20, 25);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 20, 33);
    
    yPos = 50;
    doc.setTextColor(0, 0, 0);
    
    // Executive Summary Section
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(47, 196, 178);
    doc.text('Executive Summary', 20, yPos);
    yPos += 10;
    
    // Summary stats in boxes
    const totalProperties = chartData.properties.length;
    const activeTenants = chartData.tenants.filter(t => t.status === 'active').length;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthPayments = chartData.payments.filter(p => 
      p.month === currentMonth && p.year === currentYear
    );
    const monthlyRevenue = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalExpected = currentMonthPayments.length;
    const totalCollected = currentMonthPayments.filter(p => p.status === 'paid').length;
    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    // Draw stat boxes
    const statBoxes = [
      { label: 'Total Properties', value: totalProperties, x: 20 },
      { label: 'Active Tenants', value: activeTenants, x: 65 },
      { label: 'Monthly Revenue', value: `P${monthlyRevenue.toLocaleString()}`, x: 110 },
      { label: 'Collection Rate', value: `${collectionRate}%`, x: 155 }
    ];
    
    statBoxes.forEach(stat => {
      doc.setDrawColor(229, 231, 235);
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(stat.x, yPos, 40, 20, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(stat.label, stat.x + 20, yPos + 6, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(26, 33, 49);
      doc.text(String(stat.value), stat.x + 20, yPos + 15, { align: 'center' });
      doc.setFont(undefined, 'normal');
    });
    
    yPos += 30;
    
    // Properties Overview Section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(47, 196, 178);
    doc.text('Properties Overview', 20, yPos);
    yPos += 5;
    
    if (chartData.properties && chartData.properties.length > 0) {
      const propertiesData = chartData.properties.map(prop => {
        const propertyTenants = chartData.tenants.filter(t => 
          t.propertyId === prop.id && t.status === 'active'
        );
        const propertyRevenue = propertyTenants.reduce((sum, t) => 
          sum + (Number(t.monthlyRent) || 0), 0
        );
        const totalUnits = prop.totalUnits || 0;
        const occupiedUnits = prop.occupiedUnits || 0;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
        
        return [
          prop.name || 'Unnamed',
          prop.address || '',
          prop.city || '',
          prop.province || '',
          prop.type || '',
          totalUnits,
          occupiedUnits,
          `${occupancyRate}%`,
          `P${propertyRevenue.toLocaleString()}`,
          prop.status || 'Active'
        ];
      });
      
      doc.autoTable({
        startY: yPos,
        head: [['Property', 'Address', 'City', 'Province', 'Type', 'Units', 'Occupied', 'Rate', 'Revenue', 'Status']],
        body: propertiesData,
        theme: 'striped',
        headStyles: { 
          fillColor: [47, 196, 178], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        bodyStyles: { 
          fontSize: 7,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 24, halign: 'left' },
          1: { cellWidth: 28, halign: 'left' },
          2: { cellWidth: 18, halign: 'left' },
          3: { cellWidth: 18, halign: 'left' },
          4: { cellWidth: 16, halign: 'left' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: 14, halign: 'center' },
          7: { cellWidth: 12, halign: 'center' },
          8: { cellWidth: 20, halign: 'right' },
          9: { cellWidth: 16, halign: 'center' }
        },
        margin: { left: 10, right: 10 }
      });
      
      yPos = doc.lastAutoTable.finalY + 15;
    } else {
      doc.setFontSize(10);
      doc.setTextColor(153, 153, 153);
      doc.text('No properties to display', 20, yPos + 5);
      yPos += 15;
    }
    
    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    
    // Tenants Summary Section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(47, 196, 178);
    doc.text('Tenants Summary', 20, yPos);
    yPos += 5;
    
    if (chartData.tenants && chartData.tenants.length > 0) {
      const tenantsData = chartData.tenants.map(tenant => {
        const property = chartData.properties.find(p => p.id === tenant.propertyId);
        const propertyName = property ? property.name : 'N/A';
        
        let moveInDateText = '';
        if (tenant.moveInDate) {
          try {
            const moveInDate = tenant.moveInDate.toDate ? tenant.moveInDate.toDate() : new Date(tenant.moveInDate);
            moveInDateText = moveInDate.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            });
          } catch (e) {
            moveInDateText = '';
          }
        }
        
        let leaseEndDateText = '';
        if (tenant.leaseEndDate) {
          try {
            const leaseEndDate = tenant.leaseEndDate.toDate ? tenant.leaseEndDate.toDate() : new Date(tenant.leaseEndDate);
            leaseEndDateText = leaseEndDate.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            });
          } catch (e) {
            leaseEndDateText = '';
          }
        }
        
        return [
          tenant.firstName || '',
          tenant.lastName || '',
          tenant.email || '',
          tenant.phone || '',
          propertyName,
          tenant.unitNumber || '',
          `P${(Number(tenant.monthlyRent) || 0).toLocaleString()}`,
          `P${(Number(tenant.securityDeposit) || 0).toLocaleString()}`,
          moveInDateText,
          leaseEndDateText,
          tenant.status || ''
        ];
      });
      
      doc.autoTable({
        startY: yPos,
        head: [['First Name', 'Last Name', 'Email', 'Phone', 'Property', 'Unit', 'Rent', 'Deposit', 'Move In', 'Lease End', 'Status']],
        body: tenantsData,
        theme: 'striped',
        headStyles: { 
          fillColor: [47, 196, 178], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'center'
        },
        bodyStyles: { 
          fontSize: 6.5,
          cellPadding: 1.5
        },
        columnStyles: {
          0: { cellWidth: 18, halign: 'left' },
          1: { cellWidth: 18, halign: 'left' },
          2: { cellWidth: 24, halign: 'left' },
          3: { cellWidth: 18, halign: 'left' },
          4: { cellWidth: 20, halign: 'left' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: 16, halign: 'right' },
          7: { cellWidth: 16, halign: 'right' },
          8: { cellWidth: 18, halign: 'left' },
          9: { cellWidth: 18, halign: 'left' },
          10: { cellWidth: 14, halign: 'center' }
        },
        margin: { left: 8, right: 8 }
      });
      
      yPos = doc.lastAutoTable.finalY + 15;
    } else {
      doc.setFontSize(10);
      doc.setTextColor(153, 153, 153);
      doc.text('No tenants to display', 20, yPos + 5);
      yPos += 15;
    }
    
    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    
    // Payment Status Section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(47, 196, 178);
    doc.text('Payment History', 20, yPos);
    yPos += 10;
    
    const paidPayments = chartData.payments.filter(p => p.status === 'paid').length;
    const pendingPayments = chartData.payments.filter(p => p.status === 'pending').length;
    const overduePayments = chartData.payments.filter(p => p.status === 'overdue').length;
    const totalExpectedAmount = chartData.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const paymentStats = [
      { label: 'Paid Payments', value: paidPayments, x: 20 },
      { label: 'Pending Payments', value: pendingPayments, x: 65 },
      { label: 'Overdue Payments', value: overduePayments, x: 110 },
      { label: 'Total Expected', value: `P${totalExpectedAmount.toLocaleString()}`, x: 155 }
    ];
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    paymentStats.forEach(stat => {
      doc.setDrawColor(229, 231, 235);
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(stat.x, yPos, 40, 20, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(stat.label, stat.x + 20, yPos + 6, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(26, 33, 49);
      doc.text(String(stat.value), stat.x + 20, yPos + 15, { align: 'center' });
      doc.setFont(undefined, 'normal');
    });
    
    yPos += 30;
    
    // Add detailed payment history table
    if (chartData.payments && chartData.payments.length > 0) {
      // Check if we need a new page
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }
      
      const paymentsData = chartData.payments.map(payment => {
        let dueDate = '';
        if (payment.dueDate) {
          try {
            dueDate = payment.dueDate.toLocaleDateString ? payment.dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date(payment.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          } catch (e) {
            dueDate = '';
          }
        }
        
        let paidDate = '';
        if (payment.paidDate) {
          try {
            paidDate = payment.paidDate.toDate ? payment.paidDate.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date(payment.paidDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          } catch (e) {
            paidDate = '';
          }
        }
        
        return [
          payment.tenantName || '',
          payment.propertyId || '',
          payment.unitNumber || '',
          `P${(Number(payment.amount) || 0).toLocaleString()}`,
          dueDate,
          paidDate,
          payment.status || '',
          (payment.month + 1) || '',
          payment.year || ''
        ];
      });
      
      doc.autoTable({
        startY: yPos,
        head: [['Tenant', 'Property ID', 'Unit', 'Amount', 'Due Date', 'Paid Date', 'Status', 'Month', 'Year']],
        body: paymentsData,
        theme: 'striped',
        headStyles: { 
          fillColor: [47, 196, 178], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'center'
        },
        bodyStyles: { 
          fontSize: 6.5,
          cellPadding: 1.5
        },
        columnStyles: {
          0: { cellWidth: 22, halign: 'left' },
          1: { cellWidth: 22, halign: 'left' },
          2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 18, halign: 'right' },
          4: { cellWidth: 20, halign: 'left' },
          5: { cellWidth: 20, halign: 'left' },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 12, halign: 'center' },
          8: { cellWidth: 12, halign: 'center' }
        },
        margin: { left: 10, right: 10 }
      });
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: 'center' });
      doc.text('Generated by RentEase', 20, 287);
    }
    
    doc.save('rentease-report.pdf');
    alert('✅ PDF report generated successfully!');
  } catch (error) {
    console.error('PDF export error:', error);
    alert('Failed to export PDF. Please try again.');
  }
});

// Export Excel function
document.getElementById('exportExcelBtn')?.addEventListener('click', async function() {
  try {
    // Load SheetJS library if not already loaded
    if (typeof window.XLSX === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    const XLSX = window.XLSX;
    
    if (!XLSX) {
      throw new Error('XLSX library failed to load');
    }
    const workbook = XLSX.utils.book_new();

    // Calculate summary data
    const totalProperties = chartData.properties.length;
    const activeTenants = chartData.tenants.filter(t => t.status === 'active').length;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthPayments = chartData.payments.filter(p => 
      p.month === currentMonth && p.year === currentYear
    );
    const monthlyRevenue = currentMonthPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalExpected = currentMonthPayments.length;
    const totalCollected = currentMonthPayments.filter(p => p.status === 'paid').length;
    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
    const paidPayments = chartData.payments.filter(p => p.status === 'paid').length;
    const pendingPayments = chartData.payments.filter(p => p.status === 'pending').length;
    const overduePayments = chartData.payments.filter(p => p.status === 'overdue').length;

    // Summary Sheet
    const summaryData = [
      ['RentEase Business Report'],
      ['Export Date:', new Date().toLocaleDateString()],
      [''],
      ['Executive Summary'],
      ['Total Properties:', totalProperties],
      ['Active Tenants:', activeTenants],
      ['Monthly Revenue:', monthlyRevenue],
      ['Collection Rate:', `${collectionRate}%`],
      [''],
      ['Payment Overview'],
      ['Paid Payments:', paidPayments],
      ['Pending Payments:', pendingPayments],
      ['Overdue Payments:', overduePayments]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Properties Sheet
    if (chartData.properties && chartData.properties.length > 0) {
      const propertiesData = [
        ['Property Name', 'Address', 'City', 'Province', 'Type', 'Total Units', 'Occupied Units', 'Occupancy Rate (%)', 'Monthly Revenue', 'Status']
      ];
      
      chartData.properties.forEach(prop => {
        const propertyTenants = chartData.tenants.filter(t => 
          t.propertyId === prop.id && t.status === 'active'
        );
        const propertyRevenue = propertyTenants.reduce((sum, t) => 
          sum + (Number(t.monthlyRent) || 0), 0
        );
        const totalUnits = prop.totalUnits || 0;
        const occupiedUnits = prop.occupiedUnits || 0;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
        
        propertiesData.push([
          prop.name || 'Unnamed',
          prop.address || '',
          prop.city || '',
          prop.province || '',
          prop.type || '',
          totalUnits,
          occupiedUnits,
          occupancyRate,
          propertyRevenue,
          prop.status || 'Active'
        ]);
      });
      
      const propertiesSheet = XLSX.utils.aoa_to_sheet(propertiesData);
      XLSX.utils.book_append_sheet(workbook, propertiesSheet, 'Properties');
    }

    // Tenants Sheet
    if (chartData.tenants && chartData.tenants.length > 0) {
      const tenantsData = [
        ['First Name', 'Last Name', 'Email', 'Phone', 'Property', 'Unit Number', 'Monthly Rent', 'Security Deposit', 'Move In Date', 'Lease End Date', 'Status']
      ];
      
      chartData.tenants.forEach(tenant => {
        const property = chartData.properties.find(p => p.id === tenant.propertyId);
        const propertyName = property ? property.name : 'N/A';
        
        let moveInDate = '';
        if (tenant.moveInDate) {
          try {
            moveInDate = tenant.moveInDate.toDate ? tenant.moveInDate.toDate().toLocaleDateString() : new Date(tenant.moveInDate).toLocaleDateString();
          } catch (e) {
            moveInDate = '';
          }
        }
        
        let leaseEndDate = '';
        if (tenant.leaseEndDate) {
          try {
            leaseEndDate = tenant.leaseEndDate.toDate ? tenant.leaseEndDate.toDate().toLocaleDateString() : new Date(tenant.leaseEndDate).toLocaleDateString();
          } catch (e) {
            leaseEndDate = '';
          }
        }
        
        tenantsData.push([
          tenant.firstName || '',
          tenant.lastName || '',
          tenant.email || '',
          tenant.phone || '',
          propertyName,
          tenant.unitNumber || '',
          Number(tenant.monthlyRent) || 0,
          Number(tenant.securityDeposit) || 0,
          moveInDate,
          leaseEndDate,
          tenant.status || ''
        ]);
      });
      
      const tenantsSheet = XLSX.utils.aoa_to_sheet(tenantsData);
      XLSX.utils.book_append_sheet(workbook, tenantsSheet, 'Tenants');
    }

    // Payments Sheet
    if (chartData.payments && chartData.payments.length > 0) {
      const paymentsData = [
        ['Tenant Name', 'Property ID', 'Unit Number', 'Amount', 'Due Date', 'Paid Date', 'Status', 'Month', 'Year']
      ];
      
      chartData.payments.forEach(payment => {
        let dueDate = '';
        if (payment.dueDate) {
          try {
            dueDate = payment.dueDate.toLocaleDateString ? payment.dueDate.toLocaleDateString() : new Date(payment.dueDate).toLocaleDateString();
          } catch (e) {
            dueDate = '';
          }
        }
        
        let paidDate = '';
        if (payment.paidDate) {
          try {
            paidDate = payment.paidDate.toDate ? payment.paidDate.toDate().toLocaleDateString() : new Date(payment.paidDate).toLocaleDateString();
          } catch (e) {
            paidDate = '';
          }
        }
        
        paymentsData.push([
          payment.tenantName || '',
          payment.propertyId || '',
          payment.unitNumber || '',
          Number(payment.amount) || 0,
          dueDate,
          paidDate,
          payment.status || '',
          payment.month + 1 || '', // Add 1 to convert 0-11 to 1-12
          payment.year || ''
        ]);
      });
      
      const paymentsSheet = XLSX.utils.aoa_to_sheet(paymentsData);
      XLSX.utils.book_append_sheet(workbook, paymentsSheet, 'Payment History');
    }

    // Generate and download Excel file
    XLSX.writeFile(workbook, `rentease_business_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    alert(`✅ Excel report exported successfully!\n\n${totalProperties} properties, ${activeTenants} tenants, ${chartData.payments.length} payment records`);
  } catch (error) {
    console.error('Excel export error:', error);
    alert('Failed to export Excel. Please try again.');
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

// Activity Modal Functions
let allActivities = [];
let filteredActivities = [];

// View All Activities button
document.getElementById('viewAllActivities')?.addEventListener('click', function(e) {
  e.preventDefault();
  openActivityModal();
});

async function openActivityModal() {
  const activityModal = document.getElementById('activityModal');
  if (!activityModal || !currentUser) return;

  try {
    // Load all activities from Firestore
    const activitiesQuery = query(
      collection(db, "activities"),
      where("userId", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    
    const snapshot = await getDocs(activitiesQuery);
    allActivities = [];
    
    snapshot.forEach((doc) => {
      const activity = doc.data();
      allActivities.push({
        id: doc.id,
        ...activity,
        timestamp: activity.timestamp?.toDate ? activity.timestamp.toDate() : new Date()
      });
    });

    // Initialize filtered activities with all activities
    filteredActivities = [...allActivities];
    
    // Reset filter to "all"
    const filterSelect = document.getElementById('activity-filter-select');
    if (filterSelect) filterSelect.value = 'all';
    
    // Update display
    updateActivityDisplay();

    // Show modal
    activityModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('Error loading activities:', error);
    alert('Failed to load activities. Please try again.');
  }
}

function updateActivityDisplay() {
  // Update stats
  document.getElementById('total-activities').textContent = filteredActivities.length;
  
  if (filteredActivities.length > 0) {
    const oldestDate = filteredActivities[filteredActivities.length - 1].timestamp;
    const newestDate = filteredActivities[0].timestamp;
    const dateRange = `${oldestDate.toLocaleDateString()} - ${newestDate.toLocaleDateString()}`;
    document.getElementById('activity-date-range').textContent = dateRange;
  } else {
    document.getElementById('activity-date-range').textContent = 'No activities';
  }

  // Populate activity list
  const activityLogsList = document.getElementById('activity-logs-list');
  if (filteredActivities.length === 0) {
    activityLogsList.innerHTML = `
      <li class="activity-item" style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">📝</div>
        <div class="activity-title">No activities found</div>
        <div class="activity-details">Try changing your filter settings</div>
      </li>
    `;
  } else {
    activityLogsList.innerHTML = filteredActivities.map(activity => `
      <li class="activity-item">
        <div class="activity-icon">${activity.icon || '📝'}</div>
        <div class="activity-content">
          <div class="activity-title">${escapeHtml(activity.title || 'Activity')}</div>
          <div class="activity-details">${escapeHtml(activity.details || '')}</div>
          <div class="activity-time">${getTimeAgo(activity.timestamp)}</div>
        </li>
      `).join('');
  }
}

function filterActivitiesByDateRange(startDate, endDate) {
  filteredActivities = allActivities.filter(activity => {
    const activityDate = activity.timestamp;
    return activityDate >= startDate && activityDate <= endDate;
  });
  updateActivityDisplay();
}

// Activity filter change handler
document.getElementById('activity-filter-select')?.addEventListener('change', function(e) {
  const filterValue = e.target.value;
  const customDateRange = document.getElementById('custom-date-range');
  
  if (filterValue === 'custom') {
    customDateRange.style.display = 'flex';
    return;
  } else {
    customDateRange.style.display = 'none';
  }
  
  const now = new Date();
  let startDate, endDate;
  
  switch(filterValue) {
    case 'all':
      filteredActivities = [...allActivities];
      break;
      
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      filterActivitiesByDateRange(startDate, endDate);
      break;
      
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59);
      filterActivitiesByDateRange(startDate, endDate);
      break;
      
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      filterActivitiesByDateRange(startDate, endDate);
      break;
      
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      filterActivitiesByDateRange(startDate, endDate);
      break;
  }
});

// Apply custom date filter
document.getElementById('apply-date-filter')?.addEventListener('click', function() {
  const startDateInput = document.getElementById('start-date').value;
  const endDateInput = document.getElementById('end-date').value;
  
  if (!startDateInput || !endDateInput) {
    alert('Please select both start and end dates');
    return;
  }
  
  const startDate = new Date(startDateInput);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(endDateInput);
  endDate.setHours(23, 59, 59, 999);
  
  if (startDate > endDate) {
    alert('Start date must be before end date');
    return;
  }
  
  filterActivitiesByDateRange(startDate, endDate);
});

function closeActivityModal() {
  const activityModal = document.getElementById('activityModal');
  if (activityModal) {
    activityModal.classList.remove('active');
    document.body.style.overflow = 'auto';
  }
}

// Close activity modal handlers
document.getElementById('closeActivityModal')?.addEventListener('click', closeActivityModal);

document.querySelector('#activityModal .modal-overlay')?.addEventListener('click', closeActivityModal);

// Export Activity PDF
document.getElementById('exportActivityPdfBtn')?.addEventListener('click', async function() {
  try {
    // Load jsPDF if not already loaded
    if (typeof window.jspdf === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    // Load jsPDF autoTable plugin
    if (typeof window.jspdf.jsPDF.prototype.autoTable === 'undefined') {
      const autoTableScript = document.createElement('script');
      autoTableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js';
      document.head.appendChild(autoTableScript);
      await new Promise(resolve => autoTableScript.onload = resolve);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let yPos = 20;
    
    // Header
    doc.setFillColor(26, 33, 49);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('RentEase Activity Logs', 20, 25);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 20, 33);
    
    yPos = 50;
    doc.setTextColor(0, 0, 0);
    
    // Summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(47, 196, 178);
    doc.text('Activity Summary', 20, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Activities: ${filteredActivities.length}`, 20, yPos);
    yPos += 7;
    
    if (filteredActivities.length > 0) {
      const oldestDate = filteredActivities[filteredActivities.length - 1].timestamp;
      const newestDate = filteredActivities[0].timestamp;
      doc.text(`Date Range: ${oldestDate.toLocaleDateString()} - ${newestDate.toLocaleDateString()}`, 20, yPos);
      yPos += 15;
    } else {
      yPos += 10;
    }
    
    // Activities Table
    if (filteredActivities.length > 0) {
      const activitiesData = filteredActivities.map(activity => [
        activity.timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        activity.title || 'Activity',
        activity.details || '',
        activity.icon || '📝'
      ]);
      
      doc.autoTable({
        startY: yPos,
        head: [['Date & Time', 'Title', 'Details', 'Type']],
        body: activitiesData,
        theme: 'striped',
        headStyles: { 
          fillColor: [47, 196, 178], 
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
          halign: 'center'
        },
        bodyStyles: { 
          fontSize: 9,
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 42, halign: 'left' },
          1: { cellWidth: 50, halign: 'left' },
          2: { cellWidth: 80, halign: 'left' },
          3: { cellWidth: 18, halign: 'center' }
        },
        margin: { left: 10, right: 10 }
      });
    } else {
      doc.setFontSize(10);
      doc.setTextColor(153, 153, 153);
      doc.text('No activities to display', 20, yPos);
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: 'center' });
      doc.text('Generated by RentEase', 20, 287);
    }
    
    doc.save(`rentease_activity_logs_${new Date().toISOString().split('T')[0]}.pdf`);
    alert(`✅ Activity logs PDF exported successfully!\n\n${filteredActivities.length} activities exported`);
  } catch (error) {
    console.error('PDF export error:', error);
    alert('Failed to export PDF. Please try again.');
  }
});

// Export Activity Excel
document.getElementById('exportActivityExcelBtn')?.addEventListener('click', async function() {
  try {
    // Load SheetJS library if not already loaded
    if (typeof window.XLSX === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    const XLSX = window.XLSX;
    
    if (!XLSX) {
      throw new Error('XLSX library failed to load');
    }
    
    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['RentEase Activity Logs'],
      ['Export Date:', new Date().toLocaleDateString()],
      [''],
      ['Summary'],
      ['Total Activities:', filteredActivities.length]
    ];
    
    if (filteredActivities.length > 0) {
      const oldestDate = filteredActivities[filteredActivities.length - 1].timestamp;
      const newestDate = filteredActivities[0].timestamp;
      summaryData.push(['Date Range:', `${oldestDate.toLocaleDateString()} - ${newestDate.toLocaleDateString()}`]);
    }
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Activities Sheet
    if (filteredActivities.length > 0) {
      const activitiesData = [
        ['Date & Time', 'Title', 'Details', 'Type']
      ];
      
      filteredActivities.forEach(activity => {
        activitiesData.push([
          activity.timestamp.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          activity.title || 'Activity',
          activity.details || '',
          activity.icon || '📝'
        ]);
      });
      
      const activitiesSheet = XLSX.utils.aoa_to_sheet(activitiesData);
      XLSX.utils.book_append_sheet(workbook, activitiesSheet, 'Activity Logs');
    }

    // Generate and download Excel file
    XLSX.writeFile(workbook, `rentease_activity_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    alert(`✅ Activity logs Excel exported successfully!\n\n${filteredActivities.length} activities exported`);
  } catch (error) {
    console.error('Excel export error:', error);
    alert('Failed to export Excel. Please try again.');
  }
});

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