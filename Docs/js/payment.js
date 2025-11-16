import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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

// DOM Elements
const cardNumber = document.getElementById('cardNumber');
const cardName = document.getElementById('cardName');
const expiry = document.getElementById('expiry');
const cvv = document.getElementById('cvv');
const displayNumber = document.getElementById('displayNumber');
const displayName = document.getElementById('displayName');
const displayExpiry = document.getElementById('displayExpiry');
const displayCVV = document.getElementById('displayCVV');
const creditCard = document.getElementById('creditCard');
const cardType = document.getElementById('cardType');
const paymentForm = document.getElementById('paymentForm');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');

// Plan Invoice Elements
const planInvoice = document.getElementById('planInvoice');
const planBadge = document.getElementById('planBadge');
const invoicePlanName = document.getElementById('invoicePlanName');
const invoiceFeatures = document.getElementById('invoiceFeatures');
const invoiceTotal = document.getElementById('invoiceTotal');

let currentUser = null;
let selectedPlan = null;
let existingCardData = null; // Store existing card info

// Check authentication and load plan
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadUserCardData();
    loadSelectedPlan();
  } else {
    window.location.href = 'index.html';
  }
});

// Load existing card data from Firebase
async function loadUserCardData() {
  try {
    const userRef = doc(db, "users", currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists() && userDoc.data().paymentInfo) {
      existingCardData = userDoc.data().paymentInfo;
      console.log("Existing card found - verification required");
      
      // Show a message to user that they need to verify their existing card
      const formSubtitle = document.querySelector('.form-subtitle');
      formSubtitle.textContent = 'Verify your registered card to complete the upgrade';
      formSubtitle.style.color = '#f59e0b';
    } else {
      console.log("No existing card - new card will be registered");
      existingCardData = null;
    }
  } catch (error) {
    console.error("Error loading card data:", error);
  }
}

// Load selected plan from sessionStorage
function loadSelectedPlan() {
  const planData = sessionStorage.getItem('selectedPlan');
  
  if (!planData) {
    alert('No plan selected. Please select a plan first.');
    window.location.href = 'dashboard.html';
    return;
  }
  
  selectedPlan = JSON.parse(planData);
  displayPlanInvoice(selectedPlan);
}

// Display plan details in invoice
function displayPlanInvoice(plan) {
  planBadge.textContent = plan.displayName;
  invoicePlanName.textContent = `${plan.displayName} Plan`;
  invoiceTotal.textContent = `${plan.currency}${plan.price}/month`;
  
  if (plan.features && plan.features.length > 0) {
    invoiceFeatures.innerHTML = '';
    plan.features.forEach(feature => {
      const li = document.createElement('li');
      li.textContent = feature;
      invoiceFeatures.appendChild(li);
    });
  }
}

// Format card number - ONLY NUMBERS
cardNumber.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
    e.target.value = formattedValue;
    displayNumber.textContent = formattedValue || '#### #### #### ####';
    
    if (value.startsWith('4')) {
        cardType.textContent = 'VISA';
    } else if (value.startsWith('5')) {
        cardType.textContent = 'MC';
    } else if (value.startsWith('3')) {
        cardType.textContent = 'AMEX';
    } else {
        cardType.textContent = 'CARD';
    }
});

// Format card name - AUTO UPPERCASE
cardName.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
    displayName.textContent = e.target.value || 'YOUR NAME';
});

// Format expiry date
expiry.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    e.target.value = value;
    displayExpiry.textContent = value || 'MM/YY';
});

// CVV input - flip card
cvv.addEventListener('focus', () => {
    creditCard.classList.add('flipped');
});

cvv.addEventListener('blur', () => {
    creditCard.classList.remove('flipped');
});

cvv.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    displayCVV.textContent = e.target.value || '***';
});

// Verify if entered card matches existing registered card
function verifyExistingCard(enteredCardData) {
  const enteredLast4 = enteredCardData.cardLastFour;
  const enteredName = enteredCardData.cardHolderName.toUpperCase().trim();
  const enteredExpiry = enteredCardData.expiryDate;
  
  const existingLast4 = existingCardData.cardLastFour;
  const existingName = existingCardData.cardHolderName.toUpperCase().trim();
  const existingExpiry = existingCardData.expiryDate;
  
  // All three must match: last 4 digits, cardholder name, and expiry date
  const isMatch = (
    enteredLast4 === existingLast4 &&
    enteredName === existingName &&
    enteredExpiry === existingExpiry
  );
  
  return isMatch;
}

// Form validation and submission
paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let isValid = true;
    const inputs = [cardNumber, cardName, expiry, cvv];
    
    inputs.forEach(input => {
        input.classList.remove('input-error');
    });
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('input-error');
            isValid = false;
        }
    });

    const cardNumberValue = cardNumber.value.replace(/\s/g, '');
    if (cardNumberValue.length < 15) {
        cardNumber.classList.add('input-error');
        isValid = false;
    }

    if (!expiry.value.match(/^\d{2}\/\d{2}$/)) {
        expiry.classList.add('input-error');
        isValid = false;
    } else {
        const [month, year] = expiry.value.split('/');
        const currentYear = new Date().getFullYear() % 100;
        const currentMonth = new Date().getMonth() + 1;
        
        if (parseInt(month) < 1 || parseInt(month) > 12 || 
            (parseInt(year) < currentYear) || 
            (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
            expiry.classList.add('input-error');
            isValid = false;
        }
    }

    if (cvv.value.length < 3) {
        cvv.classList.add('input-error');
        isValid = false;
    }

    if (!isValid) {
        errorMessage.textContent = '✗ Please fill in all fields correctly.';
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 3000);
        return;
    }

    await processPayment();
});

// Process payment with card verification
async function processPayment() {
    try {
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
        
        const cardNumberValue = cardNumber.value.replace(/\s/g, '');
        const last4Digits = cardNumberValue.slice(-4);
        
        // Prepare entered card data
        const enteredCardData = {
            cardLastFour: last4Digits,
            cardHolderName: cardName.value,
            cardType: cardType.textContent,
            expiryDate: expiry.value
        };
        
        // Check if user has existing card
        if (existingCardData) {
            // Verify if entered card matches existing card
            const isCardValid = verifyExistingCard(enteredCardData);
            
            if (!isCardValid) {
                // Card doesn't match - reject payment
                errorMessage.textContent = '✗ Card verification failed. The entered card does not match your registered card.';
                errorMessage.style.display = 'block';
                successMessage.style.display = 'none';
                
                submitBtn.disabled = false;
                btnText.style.display = 'inline-block';
                btnLoader.style.display = 'none';
                
                setTimeout(() => {
                    errorMessage.style.display = 'none';
                }, 5000);
                
                return; // Stop processing
            }
            
            // Card matches - proceed with plan upgrade only (don't update card info)
            console.log("Card verified successfully - updating plan only");
        } else {
            // No existing card - this is a new card registration
            console.log("Registering new card");
        }
        
        // Payment info to store (only if new card, or to keep existing)
        const paymentInfo = {
            cardLastFour: last4Digits,
            cardHolderName: cardName.value,
            cardType: cardType.textContent,
            expiryDate: expiry.value,
            cvv: cvv.value, // Store CVV for verification
            paymentDate: new Date(),
            amount: selectedPlan.price,
            currency: selectedPlan.currency
        };
        
        const userRef = doc(db, "users", currentUser.uid);
        
        // Update data based on whether card exists
        let updateData = {
            plan: selectedPlan.name,
            planUpgradedAt: new Date()
        };
        
        // Only update payment info if it's a new card (no existing card)
        if (!existingCardData) {
            updateData.paymentInfo = paymentInfo;
        } else {
            // Update payment date and amount for existing card
            updateData['paymentInfo.paymentDate'] = new Date();
            updateData['paymentInfo.amount'] = selectedPlan.price;
            updateData['paymentInfo.currency'] = selectedPlan.currency;
        }
        
        await setDoc(userRef, updateData, { merge: true });
        
        successMessage.textContent = existingCardData 
            ? '✓ Card verified! Payment processed successfully. Redirecting...'
            : '✓ Card registered! Payment processed successfully. Redirecting...';
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        
        sessionStorage.removeItem('selectedPlan');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
        
    } catch (error) {
        console.error("Payment processing error:", error);
        
        errorMessage.textContent = `✗ Payment processing failed: ${error.message}`;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
        
        submitBtn.disabled = false;
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 4000);
    }
}

// Remove error class on input
[cardNumber, cardName, expiry, cvv].forEach(input => {
    input.addEventListener('input', () => {
        input.classList.remove('input-error');
        errorMessage.style.display = 'none';
    });
});