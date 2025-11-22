// Profile page
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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

// Plan configuration
const PLAN_CONFIG = {
  freemium: {
    displayName: 'Free',
    maxProperties: 2,
    maxTenants: 8,
    features: [
      'Up to 2 properties',
      'Up to 8 tenants total',
      'Basic payment tracking',
      'Monthly reports',
      'Email support'
    ]
  },
  premium: {
    displayName: 'Premium',
    maxProperties: 20,
    maxTenants: Infinity,
    features: [
      'Up to 20 properties',
      'Unlimited tenants',
      'Advanced payment tracking',
      'Automated reminders',
      'Financial reports',
      'Priority support'
    ]
  },
  platinum: {
    displayName: 'Platinum',
    maxProperties: Infinity,
    maxTenants: Infinity,
    features: [
      'Unlimited properties',
      'Unlimited tenants',
      'All Pro features',
      'Multi-user access',
      'Custom integrations',
      '24/7 support'
    ]
  }
};

let currentUser = null;
let userData = null;
let propertiesCount = 0;
let tenantsCount = 0;

// Check authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      await loadUserProfile(user.uid);
      await loadUserStats(user.uid);
    } catch (error) {
      console.error("Error loading profile:", error);
      showNotification("Failed to load profile data", "error");
    }
  } else {
    window.location.href = 'index.html';
  }
});

// Load user profile data
async function loadUserProfile(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    
    if (userDoc.exists()) {
      userData = userDoc.data();
      const userPlan = userData.plan || 'freemium';
      const planConfig = PLAN_CONFIG[userPlan];

      // Update sidebar user info
      const sidebarName = document.querySelector('.user-name');
      const sidebarEmail = document.querySelector('.user-email');
      if (sidebarName) sidebarName.textContent = userData.username || 'User';
      if (sidebarEmail) sidebarEmail.textContent = userData.email || '';

      // Update plan badge in sidebar
      const planBadge = document.querySelector('.plan-badge');
      if (planBadge) {
        const displayPlanName = userPlan === 'freemium' ? 'Free' : 
                               userPlan === 'premium' ? 'Premium' : 'Platinum';
        planBadge.textContent = displayPlanName;
        planBadge.className = `plan-badge plan-${userPlan}`;
      }

      // Update subscription card
      updateSubscriptionCard(userPlan, planConfig);

      // Update profile form
      updateProfileForm(userData);

      // Update notification settings
      updateNotificationSettings(userData);
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
    throw error;
  }
}

// Load user statistics
async function loadUserStats(uid) {
  try {
    // Count properties
    const propertiesQuery = query(collection(db, "properties"), where("ownerId", "==", uid));
    const propertiesSnapshot = await getDocs(propertiesQuery);
    propertiesCount = propertiesSnapshot.size;

    // Count tenants
    const tenantsQuery = query(collection(db, "tenants"), where("landlordId", "==", uid));
    const tenantsSnapshot = await getDocs(tenantsQuery);
    tenantsCount = tenantsSnapshot.size;

    // Update limits display
    updateLimitsDisplay();
  } catch (error) {
    console.error("Error loading user stats:", error);
  }
}

// Update subscription card
function updateSubscriptionCard(userPlan, planConfig) {
  const planNameEl = document.querySelector('.subscription-details h3');
  const planDescEl = document.querySelector('.subscription-details p');
  const featuresList = document.querySelector('.subscription-features');
  const upgradeBtn = document.querySelector('.subscription-action .btn-primary');

  if (planNameEl) planNameEl.textContent = planConfig.displayName;
  
  // Update description based on plan
  if (planDescEl) {
    if (userPlan === 'freemium') {
      planDescEl.textContent = 'Basic features to get started';
    } else if (userPlan === 'premium') {
      planDescEl.textContent = 'Advanced features for growing portfolios';
    } else {
      planDescEl.textContent = 'Complete solution for property management';
    }
  }

  // Update features list
  if (featuresList) {
    featuresList.innerHTML = planConfig.features.map(feature => 
      `<li>${feature}</li>`
    ).join('');
  }

  // Show/hide upgrade button
  if (upgradeBtn) {
    if (userPlan === 'platinum') {
      upgradeBtn.style.display = 'none';
    } else {
      upgradeBtn.style.display = 'flex';
      upgradeBtn.onclick = () => {
        openPricingModal(userPlan);
      };
    }
  }

  // Update alert message
  const alertInfo = document.querySelector('.alert-info');
  if (alertInfo) {
    if (userPlan === 'platinum') {
      alertInfo.style.display = 'none';
    } else {
      alertInfo.style.display = 'flex';
      const alertText = alertInfo.querySelector('.alert-text');
      if (userPlan === 'freemium') {
        alertText.textContent = 'Get up to 20 properties, advanced reporting, automated reminders, and priority support with our Pro plan starting at ₱499/month.';
      } else {
        alertText.textContent = 'Upgrade to Premium for unlimited properties, multi-user access, custom integrations, and 24/7 support starting at ₱999/month.';
      }
    }
  }
}

// Open pricing modal
function openPricingModal(currentPlan) {
  const modal = document.getElementById('pricingModal');
  if (!modal) {
    showNotification('Pricing modal not found. Please refresh the page.', 'error');
    return;
  }

  // Get pricing cards container
  const pricingCards = modal.querySelector('.pricing-cards');
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
      displayName: 'Premium',
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
  const planButtons = modal.querySelectorAll('.plan-button');
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
        selectedPlan.name = 'Premium';
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
      sessionStorage.setItem('returnTo', 'profile.html');
      
      button.disabled = true;
      button.textContent = 'Redirecting...';
      
      setTimeout(() => {
        window.location.href = 'payment.html';
      }, 500);
    });
  });

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close pricing modal
function closePricingModal() {
  const modal = document.getElementById('pricingModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Update limits display
function updateLimitsDisplay() {
  const userPlan = userData?.plan || 'freemium';
  const planConfig = PLAN_CONFIG[userPlan];

  // Properties limit
  const propertiesValue = document.querySelector('.limit-item:nth-child(1) .limit-value');
  const propertiesFill = document.querySelector('.limit-item:nth-child(1) .progress-fill');
  
  if (propertiesValue && propertiesFill) {
    if (planConfig.maxProperties === Infinity) {
      propertiesValue.textContent = `${propertiesCount} / Unlimited`;
      propertiesFill.style.width = '100%';
      propertiesFill.style.background = '#10b981';
    } else {
      propertiesValue.textContent = `${propertiesCount} / ${planConfig.maxProperties}`;
      const percentage = (propertiesCount / planConfig.maxProperties) * 100;
      propertiesFill.style.width = `${percentage}%`;
      
      if (percentage >= 90) {
        propertiesFill.style.background = '#ef4444';
      } else if (percentage >= 70) {
        propertiesFill.style.background = '#f59e0b';
      } else {
        propertiesFill.style.background = '#2fc4b2';
      }
    }
  }

  // Tenants limit
  const tenantsValue = document.querySelector('.limit-item:nth-child(2) .limit-value');
  const tenantsFill = document.querySelector('.limit-item:nth-child(2) .progress-fill');
  
  if (tenantsValue && tenantsFill) {
    if (planConfig.maxTenants === Infinity) {
      tenantsValue.textContent = `${tenantsCount} / Unlimited`;
      tenantsFill.style.width = '100%';
      tenantsFill.style.background = '#10b981';
    } else {
      tenantsValue.textContent = `${tenantsCount} / ${planConfig.maxTenants}`;
      const percentage = (tenantsCount / planConfig.maxTenants) * 100;
      tenantsFill.style.width = `${percentage}%`;
      
      if (percentage >= 90) {
        tenantsFill.style.background = '#ef4444';
      } else if (percentage >= 70) {
        tenantsFill.style.background = '#f59e0b';
      } else {
        tenantsFill.style.background = '#2fc4b2';
      }
    }
  }
}

// Update profile form with user data
function updateProfileForm(data) {
  const fullName = data.username || '';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Get all forms
  const forms = document.querySelectorAll('form');
  if (forms.length === 0) return;

  // Profile form is the first form
  const profileForm = forms[0];
  
  // Get form groups in order
  const formGroups = profileForm.querySelectorAll('.form-group');
  
  // Get inputs by their position in the form
  const firstNameInput = formGroups[0]?.querySelector('.form-input');
  const lastNameInput = formGroups[1]?.querySelector('.form-input');
  const emailInput = profileForm.querySelector('input[type="email"]');
  const phoneInput = profileForm.querySelector('input[type="tel"]');
  const addressInput = profileForm.querySelector('textarea');

  if (firstNameInput) firstNameInput.value = firstName;
  if (lastNameInput) lastNameInput.value = lastName;
  if (emailInput) emailInput.value = data.email || '';
  if (phoneInput) phoneInput.value = data.phone || '';
  if (addressInput) addressInput.value = data.address || '';
}

// Update notification settings
function updateNotificationSettings(data) {
  const settings = data.notificationSettings || {
    emailNotifications: true,
    paymentReminders: true,
    smsNotifications: false,
    weeklyReports: false,
    marketingEmails: false
  };

  const toggles = document.querySelectorAll('.toggle-switch');
  
  if (toggles[0] && settings.emailNotifications) toggles[0].classList.add('active');
  if (toggles[1] && settings.paymentReminders) toggles[1].classList.add('active');
  if (toggles[2] && settings.smsNotifications) toggles[2].classList.add('active');
  if (toggles[3] && settings.weeklyReports) toggles[3].classList.add('active');
  if (toggles[4] && settings.marketingEmails) toggles[4].classList.add('active');
}

// Save profile changes
async function saveProfileChanges(e) {
  e.preventDefault();
  
  if (!currentUser) return;

  // Get all forms
  const forms = document.querySelectorAll('form');
  if (forms.length === 0) return;

  // Profile form is the first form
  const profileForm = forms[0];
  
  // Get form groups in order
  const formGroups = profileForm.querySelectorAll('.form-group');
  
  // Get inputs by their position in the form
  const firstNameInput = formGroups[0]?.querySelector('.form-input');
  const lastNameInput = formGroups[1]?.querySelector('.form-input');
  const phoneInput = profileForm.querySelector('input[type="tel"]');
  const addressInput = profileForm.querySelector('textarea');

  const firstName = firstNameInput?.value.trim() || '';
  const lastName = lastNameInput?.value.trim() || '';
  const phone = phoneInput?.value.trim() || '';
  const address = addressInput?.value.trim() || '';

  const username = `${firstName} ${lastName}`.trim();

  if (!username) {
    showNotification("Please enter your name", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      username: username,
      phone: phone,
      address: address,
      updatedAt: new Date()
    });

    const sidebarName = document.querySelector('.user-name');
    if (sidebarName) sidebarName.textContent = username;

    showNotification("Profile updated successfully!", "success");
    await loadUserProfile(currentUser.uid);
  } catch (error) {
    console.error("Error updating profile:", error);
    showNotification("Failed to update profile. Please try again.", "error");
  }
}

// Change password
async function changePassword(e) {
  e.preventDefault();
  
  if (!currentUser) return;

  // Get all forms
  const forms = document.querySelectorAll('form');
  if (forms.length < 2) return;

  // Password form is the second form
  const passwordForm = forms[1];
  
  // Get form groups in order
  const formGroups = passwordForm.querySelectorAll('.form-group');
  
  const currentPasswordInput = formGroups[0]?.querySelector('.form-input');
  const newPasswordInput = formGroups[1]?.querySelector('.form-input');
  const confirmPasswordInput = formGroups[2]?.querySelector('.form-input');

  const currentPassword = currentPasswordInput?.value || '';
  const newPassword = newPasswordInput?.value || '';
  const confirmPassword = confirmPasswordInput?.value || '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    showNotification("Please fill in all password fields", "error");
    return;
  }

  if (newPassword.length < 6) {
    showNotification("New password must be at least 6 characters", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showNotification("New passwords do not match", "error");
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);
    
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    
    showNotification("Password updated successfully!", "success");
  } catch (error) {
    console.error("Error updating password:", error);
    
    if (error.code === 'auth/wrong-password') {
      showNotification("Current password is incorrect", "error");
    } else if (error.code === 'auth/requires-recent-login') {
      showNotification("Please logout and login again to change your password", "error");
    } else {
      showNotification("Failed to update password. Please try again.", "error");
    }
  }
}

// Save notification settings
async function saveNotificationSettings() {
  if (!currentUser) return;

  const toggles = document.querySelectorAll('.toggle-switch');
  
  const settings = {
    emailNotifications: toggles[0]?.classList.contains('active') || false,
    paymentReminders: toggles[1]?.classList.contains('active') || false,
    smsNotifications: toggles[2]?.classList.contains('active') || false,
    weeklyReports: toggles[3]?.classList.contains('active') || false,
    marketingEmails: toggles[4]?.classList.contains('active') || false
  };

  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      notificationSettings: settings,
      updatedAt: new Date()
    });

    showNotification("Notification settings updated!", "success");
  } catch (error) {
    console.error("Error updating notification settings:", error);
    showNotification("Failed to update settings", "error");
  }
}

// Export user data
async function exportUserData() {
  if (!currentUser) return;

  try {
    showNotification("Preparing your data export...", "info");

    const propertiesQuery = query(collection(db, "properties"), where("ownerId", "==", currentUser.uid));
    const propertiesSnapshot = await getDocs(propertiesQuery);
    
    const tenantsQuery = query(collection(db, "tenants"), where("landlordId", "==", currentUser.uid));
    const tenantsSnapshot = await getDocs(tenantsQuery);

    let csvContent = "data:text/csv;charset=utf-8,";
    
    csvContent += "PROPERTIES\n";
    csvContent += "Name,Type,Address,City,Province,Total Units,Occupied Units,Status\n";
    
    propertiesSnapshot.forEach(doc => {
      const prop = doc.data();
      csvContent += `"${prop.name}","${prop.type}","${prop.address}","${prop.city}","${prop.province}",${prop.totalUnits},${prop.occupiedUnits},"${prop.status}"\n`;
    });

    csvContent += "\n\nTENANTS\n";
    csvContent += "First Name,Last Name,Email,Phone,Unit,Monthly Rent,Security Deposit,Move In Date,Lease End Date,Status\n";
    
    tenantsSnapshot.forEach(doc => {
      const tenant = doc.data();
      const moveIn = tenant.moveInDate?.toDate ? tenant.moveInDate.toDate().toLocaleDateString() : '';
      const leaseEnd = tenant.leaseEndDate?.toDate ? tenant.leaseEndDate.toDate().toLocaleDateString() : '';
      
      csvContent += `"${tenant.firstName}","${tenant.lastName}","${tenant.email}","${tenant.phone}","${tenant.unitNumber}",${tenant.monthlyRent},${tenant.securityDeposit},"${moveIn}","${leaseEnd}","${tenant.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rentease_data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification("Data exported successfully!", "success");
  } catch (error) {
    console.error("Error exporting data:", error);
    showNotification("Failed to export data", "error");
  }
}

// Delete account
async function deleteAccount() {
  if (!currentUser) return;

  const confirmation1 = confirm('Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.');
  if (!confirmation1) return;

  const confirmation2 = confirm('This is your last chance. Are you absolutely sure? Type your email to confirm: ' + currentUser.email);
  if (!confirmation2) return;

  try {
    showNotification("Deleting your account...", "info");

    const batch = writeBatch(db);

    const propertiesQuery = query(collection(db, "properties"), where("ownerId", "==", currentUser.uid));
    const propertiesSnapshot = await getDocs(propertiesQuery);
    propertiesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    const tenantsQuery = query(collection(db, "tenants"), where("landlordId", "==", currentUser.uid));
    const tenantsSnapshot = await getDocs(tenantsQuery);
    tenantsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    const activitiesQuery = query(collection(db, "activities"), where("userId", "==", currentUser.uid));
    const activitiesSnapshot = await getDocs(activitiesQuery);
    activitiesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    batch.delete(doc(db, "users", currentUser.uid));

    await batch.commit();
    await currentUser.delete();

    showNotification("Account deleted successfully", "success");
    
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);

  } catch (error) {
    console.error("Error deleting account:", error);
    
    if (error.code === 'auth/requires-recent-login') {
      showNotification("Please logout and login again to delete your account", "error");
    } else {
      showNotification("Failed to delete account. Please try again.", "error");
    }
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Toggle switch functionality
window.toggleSwitch = function(element) {
  const userPlan = userData?.plan || 'freemium';
  const toggles = Array.from(document.querySelectorAll('.toggle-switch'));
  const toggleIndex = toggles.indexOf(element);
  
  if (toggleIndex === 2 && userPlan === 'freemium') {
    showUpgradeAlert();
    return;
  }
  
  element.classList.toggle('active');
  saveNotificationSettings();
};

// Show upgrade alert
window.showUpgradeAlert = function() {
  showNotification('This feature is available in the Pro plan. Upgrade now!', 'info');
  setTimeout(() => {
    if (confirm('Would you like to upgrade now?')) {
      const userPlan = userData?.plan || 'freemium';
      openPricingModal(userPlan);
    }
  }, 500);
};

// Confirm delete
window.confirmDelete = deleteAccount;

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  const forms = document.querySelectorAll('form');
  
  // Profile form (first form)
  if (forms[0]) {
    forms[0].addEventListener('submit', saveProfileChanges);
  }

  // Password form (second form)
  if (forms[1]) {
    forms[1].addEventListener('submit', changePassword);
  }

  // Export button
  const settingsItems = document.querySelectorAll('.setting-item');
  settingsItems.forEach(item => {
    const btn = item.querySelector('.btn-secondary');
    if (btn && btn.textContent.includes('Export')) {
      btn.addEventListener('click', exportUserData);
    }
  });

  // Logout button
  const logoutBtn = document.querySelector('.logout-button');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      if (confirm('Are you sure you want to logout?')) {
        try {
          await signOut(auth);
          window.location.href = 'index.html';
        } catch (error) {
          console.error("Error signing out:", error);
          showNotification("Error logging out", "error");
        }
      }
    });
  }

  // Modal close button
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closePricingModal);
  }

  // Modal overlay
  const modalOverlay = document.querySelector('.modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', closePricingModal);
  }

  // Escape key to close modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closePricingModal();
    }
  });
});

// Add CSS animations and modal styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }

  .plan-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 8px;
  }

  .plan-badge.plan-freemium {
    background: linear-gradient(135deg, #6B7280 0%, #4B5563 100%);
    color: white;
  }

  .plan-badge.plan-premium {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  .plan-badge.plan-platinum {
    background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
    color: #1a1a1a;
  }

  .modal {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal.active { display: flex; }

  .modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  .modal-content {
    position: relative;
    background: white;
    border-radius: 16px;
    padding: 40px;
    max-width: 1000px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: modalSlideIn 0.3s ease-out;
  }

  @keyframes modalSlideIn {
    from { opacity: 0; transform: translateY(-20px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .modal-close {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    font-size: 24px;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: #e5e7eb;
    color: #1f2937;
    transform: rotate(90deg);
  }

  .modal-header {
    text-align: center;
    margin-bottom: 40px;
  }

  .modal-header h2 {
    font-size: 32px;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 12px 0;
  }

  .modal-header p {
    font-size: 16px;
    color: #6b7280;
    margin: 0;
  }

  .pricing-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
    margin-top: 32px;
  }

  .pricing-card {
    position: relative;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 16px;
    padding: 32px;
    transition: all 0.3s;
  }

  .pricing-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
  }

  .pricing-card.featured {
    border-color: #2fc4b2;
    box-shadow: 0 8px 16px rgba(47, 196, 178, 0.2);
  }

  .popular-badge {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #2fc4b2 0%, #107266 100%);
    color: white;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .plan-header {
    text-align: center;
    margin-bottom: 24px;
  }

  .plan-header h3 {
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 16px 0;
  }

  .plan-price {
    display: flex;
    align-items: baseline;
    justify-content: center;
    margin-bottom: 12px;
  }

  .plan-price .currency {
    font-size: 24px;
    font-weight: 600;
    color: #6b7280;
  }

  .plan-price .amount {
    font-size: 48px;
    font-weight: 800;
    color: #1f2937;
    line-height: 1;
  }

  .plan-price .period {
    font-size: 16px;
    color: #6b7280;
    margin-left: 4px;
  }

  .plan-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 32px 0;
  }

  .plan-features li {
    display: flex;
    align-items: center;
    padding: 12px 0;
    font-size: 14px;
    color: #4b5563;
    border-bottom: 1px solid #f3f4f6;
  }

  .plan-features li:last-child {
    border-bottom: none;
  }

  .plan-features .check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: #d1fae5;
    color: #059669;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
    margin-right: 12px;
    flex-shrink: 0;
  }

  .plan-button {
    width: 100%;
    padding: 14px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .plan-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .pro-button {
    background: linear-gradient(135deg, #2fc4b2 0%, #107266 100%);
    color: white;
  }

  .pro-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(47, 196, 178, 0.3);
  }

  .enterprise-button {
    background: #f3f4f6;
    color: #1f2937;
  }

  .enterprise-button:hover:not(:disabled) {
    background: #e5e7eb;
  }

  @media (max-width: 768px) {
    .modal-content {
      padding: 24px;
    }

    .pricing-cards {
      grid-template-columns: 1fr;
    }

    .modal-header h2 {
      font-size: 24px;
    }
  }
`;
document.head.appendChild(style);