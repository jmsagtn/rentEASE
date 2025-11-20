import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

// ------------------------
// Firebase configuration
// ------------------------
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
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------
// State management
// ------------------------
let verificationCode = '';
let userDetails = {};
let resendTimeout = null;

// ------------------------
// DOM elements
// ------------------------
const signupForm = document.getElementById('signup-form');
const verifyForm = document.getElementById('verify-form');
const sendCodeBtn = document.getElementById('send-code-btn');
const verifyBtn = document.getElementById('verify-btn');
const backBtn = document.getElementById('back-btn');
const resendLink = document.getElementById('resend-link');
const messageStep1 = document.getElementById('message-step1');
const messageStep2 = document.getElementById('message-step2');

// Code inputs
const codeInputs = [
  document.getElementById('code1'),
  document.getElementById('code2'),
  document.getElementById('code3'),
  document.getElementById('code4')
];

// ------------------------
// Auto-focus code inputs
// ------------------------
codeInputs.forEach((input, index) => {
  input.addEventListener('input', (e) => {
    if (e.target.value.length === 1 && index < 3) {
      codeInputs[index + 1].focus();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
      codeInputs[index - 1].focus();
    }
  });

  // Only allow numbers
  input.addEventListener('keypress', (e) => {
    if (!/[0-9]/.test(e.key)) {
      e.preventDefault();
    }
  });
});

// ------------------------
// Generate 4-digit code
// ------------------------
function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ------------------------
// Send verification email
// ------------------------
async function sendVerificationEmail(email, code) {
  try {
    console.log("🔄 Attempting to send verification email to:", email);
    console.log("🔑 Verification code:", code);
    
    const response = await fetch("/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "RentEase - Verification Code",
        message: `Your RentEase verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.\n\nBest regards,\nRentEase Team`
      })
    });

    console.log("📡 Response status:", response.status);
    
    if (!response.ok) {
      console.error("❌ Server responded with error:", response.status);
      const errorText = await response.text();
      console.error("Error details:", errorText);
      return false;
    }

    const result = await response.json();
    console.log("✅ Verification email API response:", result);
    return result.success;
  } catch (error) {
    console.error("❌ Error sending verification email:", error);
    console.error("Error type:", error.name);
    console.error("Error message:", error.message);
    return false;
  }
}

// ------------------------
// Send confirmation email
// ------------------------
async function sendConfirmationEmail(email, username) {
  try {
    console.log("🔄 Sending confirmation email to:", email);
    
    const response = await fetch("/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "Welcome to RentEase!",
        message: `Hello ${username},\n\nYour RentEase account has been successfully created!\n\nWe're excited to have you onboard.\n\nBest regards,\nRentEase Team`
      })
    });

    console.log("📡 Confirmation email response status:", response.status);
    
    if (!response.ok) {
      console.error("❌ Server error sending confirmation");
      return false;
    }

    const result = await response.json();
    console.log("✅ Confirmation email sent:", result);
    return result.success;
  } catch (error) {
    console.error("❌ Error sending confirmation email:", error);
    return false;
  }
}

// ------------------------
// Show message helper
// ------------------------
function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type}`;
  element.style.display = 'block';
}

// ------------------------
// Navigation functions
// ------------------------
function goToStep2() {
  document.getElementById('form-step-1').classList.remove('active');
  document.getElementById('form-step-2').classList.add('active');
  document.getElementById('step1').classList.remove('active');
  document.getElementById('step1').classList.add('completed');
  document.getElementById('line1').classList.add('active');
  document.getElementById('step2').classList.add('active');
  document.getElementById('subtitle').textContent = 'Verify your email address';
  codeInputs[0].focus();
}

function goToStep1() {
  document.getElementById('form-step-2').classList.remove('active');
  document.getElementById('form-step-1').classList.add('active');
  document.getElementById('step2').classList.remove('active');
  document.getElementById('step1').classList.remove('completed');
  document.getElementById('step1').classList.add('active');
  document.getElementById('line1').classList.remove('active');
  document.getElementById('subtitle').textContent = 'Join RentEase and start your journey';
  messageStep2.style.display = 'none';
  codeInputs.forEach(input => input.value = '');
}

// ------------------------
// Resend timer
// ------------------------
function startResendTimer() {
  let seconds = 60;
  resendLink.classList.add('disabled');
  const timerElement = document.getElementById('resend-timer');
  
  resendTimeout = setInterval(() => {
    seconds--;
    timerElement.textContent = `(${seconds}s)`;
    
    if (seconds <= 0) {
      clearInterval(resendTimeout);
      resendLink.classList.remove('disabled');
      timerElement.textContent = '';
    }
  }, 1000);
}

// ------------------------
// Step 1: Send verification code
// ------------------------
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  // Frontend validation
  if (password.length < 6) {
    showMessage(messageStep1, "⚠️ Password must be at least 6 characters.", "error");
    return;
  }

  sendCodeBtn.disabled = true;
  sendCodeBtn.textContent = "Sending code...";

  try {
    // Generate and send code
    verificationCode = generateCode();
    console.log("🔑 Generated verification code:", verificationCode);
    
    const emailSent = await sendVerificationEmail(email, verificationCode);

    if (emailSent) {
      userDetails = { username, email, password };
      document.getElementById('email-display').textContent = email;
      showMessage(messageStep1, "✅ Verification code sent! Check your email.", "success");
      
      setTimeout(() => {
        goToStep2();
        startResendTimer();
      }, 1000);
    } else {
      showMessage(messageStep1, "⚠️ Failed to send verification code. Please check console for details.", "error");
      console.error("❌ Email sending failed. Check if:");
      console.error("1. Server is running on http://localhost:3000");
      console.error("2. Gmail credentials are correct");
      console.error("3. Check server console for errors");
    }
  } catch (error) {
    console.error("Error:", error);
    showMessage(messageStep1, "⚠️ " + error.message, "error");
  } finally {
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = "Send Verification Code";
  }
});

// ------------------------
// Step 2: Verify code and create account
// ------------------------
verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const enteredCode = codeInputs.map(input => input.value).join('');

  if (enteredCode.length !== 4) {
    showMessage(messageStep2, "⚠️ Please enter the complete 4-digit code.", "error");
    return;
  }

  if (enteredCode !== verificationCode) {
    showMessage(messageStep2, "⚠️ Incorrect verification code. Please try again.", "error");
    codeInputs.forEach(input => input.value = '');
    codeInputs[0].focus();
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = "Creating account...";

  try {
    // Create Firebase user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      userDetails.email,
      userDetails.password
    );
    const user = userCredential.user;

    // Store user data in Firestore
    await setDoc(doc(db, "users", user.uid), {
      username: userDetails.username,
      email: userDetails.email,
      plan: "freemium",
      planStartDate: new Date(),
      createdAt: new Date(),
      propertiesCount: 0,
      unitsCount: 0
    });

    // Send confirmation email
    await sendConfirmationEmail(userDetails.email, userDetails.username);

    showMessage(messageStep2, "🎉 Account created successfully! Redirecting...", "success");

    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);

  } catch (error) {
    console.error("Error:", error);

    let errorMsg = "";
    switch (error.code) {
      case "auth/email-already-in-use":
        errorMsg = "This email is already registered. Please log in.";
        break;
      case "auth/weak-password":
        errorMsg = "Password should be at least 6 characters.";
        break;
      case "auth/invalid-email":
        errorMsg = "Invalid email format.";
        break;
      default:
        errorMsg = error.message;
    }

    showMessage(messageStep2, "⚠️ " + errorMsg, "error");
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify & Create Account";
  }
});

// ------------------------
// Back button handler
// ------------------------
backBtn.addEventListener('click', goToStep1);

// ------------------------
// Resend code handler
// ------------------------
resendLink.addEventListener('click', async () => {
  if (resendLink.classList.contains('disabled')) return;

  verificationCode = generateCode();
  console.log("🔄 Resending code:", verificationCode);
  
  const emailSent = await sendVerificationEmail(userDetails.email, verificationCode);

  if (emailSent) {
    showMessage(messageStep2, "✅ New verification code sent!", "info");
    startResendTimer();
    codeInputs.forEach(input => input.value = '');
    codeInputs[0].focus();
  } else {
    showMessage(messageStep2, "⚠️ Failed to resend code. Please try again.", "error");
  }
});