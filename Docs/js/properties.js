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

// ✅ FIXED: Plan limits using correct naming (matches dashboard)
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
let currentPropertiesCount = 0;
let editingPropertyId = null;
let propertiesUnsubscribe = null;

// DOM Elements - UPDATED SELECTORS
const modal = document.getElementById('property-modal');
const closeModalBtn = document.getElementById('close-modal');
const addPropertyBtn = document.getElementById('add-property-btn');
const propertyForm = document.getElementById('property-form');
const message = document.getElementById('message');
const propertiesContainer = document.getElementById('properties-container');
const modalTitle = document.getElementById('modal-title');
const submitBtn = document.getElementById('submit-property-btn');

// Check authentication
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData(user.uid);
    setupRealtimeProperties(user.uid);
    checkURLParams();
  } else {
    if (propertiesUnsubscribe) propertiesUnsubscribe();
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
      currentPropertiesCount = userData.propertiesCount || 0;

      // Update UI
      document.getElementById('user-name').textContent = userData.username || 'User';
      document.getElementById('user-email').textContent = userData.email || '';
      
      const planBadge = document.getElementById('plan-badge');
      planBadge.textContent = userLimits.displayName;
      planBadge.className = `plan-badge plan-${userPlan}`;

      // Check property limit
      checkPropertyLimit();
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    showMessage('Error loading user data. Please refresh the page.', 'error');
  }
}

// ✅ Check if user can add more properties
function checkPropertyLimit() {
  const limitText = userLimits.maxProperties !== Infinity 
    ? `${currentPropertiesCount}/${userLimits.maxProperties}` 
    : 'Unlimited';
  
  if (currentPropertiesCount >= userLimits.maxProperties && userLimits.maxProperties !== Infinity) {
    addPropertyBtn.disabled = true;
    addPropertyBtn.style.opacity = '0.5';
    addPropertyBtn.title = `You've reached the limit of ${userLimits.maxProperties} properties for your ${userLimits.displayName} plan`;
    
    showMessage(
      `⚠️ Property limit reached (${limitText})! <a href="dashboard.html" style="color: #721c24; text-decoration: underline; margin-left: 8px;">Upgrade your plan</a> to add more properties.`, 
      'error'
    );
  } else {
    addPropertyBtn.disabled = false;
    addPropertyBtn.style.opacity = '1';
    addPropertyBtn.title = 'Add a new property';
  }
}

// ✅ FIXED: Real-time properties listener
function setupRealtimeProperties(uid) {
  const propertiesQuery = query(
    collection(db, "properties"),
    where("ownerId", "==", uid)
  );
  
  propertiesUnsubscribe = onSnapshot(
    propertiesQuery,
    async (snapshot) => {
      currentPropertiesCount = snapshot.size;
      
      document.getElementById('property-count-text').textContent = 
        `(${currentPropertiesCount} ${currentPropertiesCount === 1 ? 'property' : 'properties'})`;

      // ✅ Update user's property count in Firestore
      try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, {
          propertiesCount: currentPropertiesCount
        });
      } catch (error) {
        console.error("Error updating property count:", error);
      }

      checkPropertyLimit();

      if (snapshot.empty) {
        propertiesContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1;">
            <div class="empty-state-icon">🏠</div>
            <h3>No properties yet</h3>
            <p>Start by adding your first property to manage</p>
          </div>
        `;
        return;
      }

      propertiesContainer.innerHTML = '';
      
      snapshot.forEach((doc) => {
        const property = doc.data();
        const propertyCard = createPropertyCard(doc.id, property);
        propertiesContainer.appendChild(propertyCard);
      });
    },
    (error) => {
      console.error("Error loading properties:", error);
      showMessage('Error loading properties. Please refresh the page.', 'error');
    }
  );
}

// Create property card
function createPropertyCard(id, property) {
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

  card.innerHTML = `
    <div class="property-icon">${typeIcons[property.type] || '🏢'}</div>
    <div class="property-name">${escapeHtml(property.name)}</div>
    <div class="property-location">📍 ${escapeHtml(property.city)}, ${escapeHtml(property.province)}</div>
    
    <div class="property-stats">
      <div class="stat-item">
        <div class="stat-label">Total Units</div>
        <div class="stat-value">${property.totalUnits || 0}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Occupied</div>
        <div class="stat-value">${property.occupiedUnits || 0} (${occupancyRate}%)</div>
      </div>
    </div>
    
    <div class="property-actions">
      <button class="btn-edit" onclick="editProperty('${id}')">✏️ Edit</button>
      <button class="btn-delete" onclick="deleteProperty('${id}', '${escapeHtml(property.name)}')">🗑️ Delete</button>
    </div>
  `;
  
  return card;
}

// Open modal
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

// Close modal
function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
  propertyForm.reset();
  editingPropertyId = null;
}

// Edit property
window.editProperty = async function(propertyId) {
  try {
    const propertyDoc = await getDoc(doc(db, "properties", propertyId));
    
    if (propertyDoc.exists()) {
      const property = propertyDoc.data();
      editingPropertyId = propertyId;
      
      // Fill form with property data
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
  if (!confirm(`Are you sure you want to delete "${propertyName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "properties", propertyId));

    // Log activity
    await addDoc(collection(db, "activities"), {
      userId: currentUser.uid,
      type: "property_deleted",
      title: "Property Deleted",
      details: `${propertyName} was removed`,
      icon: "🗑️",
      timestamp: serverTimestamp()
    });

    showMessage(`✅ Property "${propertyName}" deleted successfully!`, 'success');
    
    // Real-time listener will handle count update automatically
  } catch (error) {
    console.error("Error deleting property:", error);
    showMessage('Error deleting property. Please try again.', 'error');
  }
};

// ✅ FIXED: Submit property form with validation
propertyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // ✅ Check limit before adding new property
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
    occupiedUnits: 0,
    status: 'active'
  };

  submitBtn.disabled = true;
  submitBtn.textContent = editingPropertyId ? 'Updating...' : 'Adding...';

  try {
    if (editingPropertyId) {
      // Update existing property
      const propertyRef = doc(db, "properties", editingPropertyId);
      await updateDoc(propertyRef, {
        ...propertyData,
        updatedAt: serverTimestamp()
      });

      showMessage('✅ Property updated successfully!', 'success');
    } else {
      // Add new property
      propertyData.ownerId = currentUser.uid;
      propertyData.createdAt = serverTimestamp();

      await addDoc(collection(db, "properties"), propertyData);

      // Log activity
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
    // Real-time listener will handle the update automatically
    
  } catch (error) {
    console.error("Error saving property:", error);
    showMessage('Error saving property. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingPropertyId ? 'Update Property' : 'Add Property';
  }
});

// Event listeners
addPropertyBtn.addEventListener('click', () => {
  if (!addPropertyBtn.disabled) {
    openModal(false);
  }
});

closeModalBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to logout?')) {
    if (propertiesUnsubscribe) propertiesUnsubscribe();
    await signOut(auth);
    window.location.href = 'index.html';
  }
});

// Check URL params for action=add
function checkURLParams() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'add' && !addPropertyBtn.disabled) {
    openModal(false);
  }
}

// Helper: escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper: show messages with HTML support
function showMessage(text, type) {
  message.innerHTML = text;
  message.className = `message ${type} show`;
  
  setTimeout(() => {
    message.classList.remove('show');
  }, 6000);
}

// Clean up listeners on page unload
window.addEventListener('beforeunload', () => {
  if (propertiesUnsubscribe) propertiesUnsubscribe();
});