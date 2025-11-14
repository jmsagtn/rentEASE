import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

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
const analytics = getAnalytics(app);
const auth = getAuth(app);

// DOM elements
const loginForm = document.getElementById("login-form");
const message = document.getElementById("message");
const loginButton = document.getElementById("login-btn");
const togglePassword = document.getElementById("toggle-password");
const passwordInput = document.getElementById("password");

// Check if user is already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is already logged in, redirect to dashboard
    window.location.href = "dashboard.html";
  }
});

// Password toggle functionality
togglePassword.addEventListener("click", function() {
  const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
  passwordInput.setAttribute("type", type);
  
  // Change icon
  this.textContent = type === "password" ? "👁️" : "🙈";
});

// Add input animation effects
const inputs = document.querySelectorAll('input');
inputs.forEach(input => {
  input.addEventListener('focus', function() {
    this.parentElement.style.transform = 'scale(1.02)';
  });
  
  input.addEventListener('blur', function() {
    this.parentElement.style.transform = 'scale(1)';
  });
});

// Login form submission
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // Frontend validation
  if (!email || !password) {
    showMessage("Please fill in all fields.", "error");
    return;
  }

  // Disable button and show loading state
  loginButton.disabled = true;
  loginButton.innerHTML = '<span class="loading-spinner"></span>Signing in...';

  try {
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    showMessage("🎉 Login successful! Redirecting...", "success");

    // Redirect to dashboard after short delay
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1000);

  } catch (error) {
    console.error("Login error:", error);

    // Friendly error messages
    let errorMsg = "";
    switch (error.code) {
      case "auth/user-not-found":
        errorMsg = "No account found with this email. Please sign up.";
        break;
      case "auth/wrong-password":
        errorMsg = "Incorrect password. Please try again.";
        break;
      case "auth/invalid-email":
        errorMsg = "Invalid email format.";
        break;
      case "auth/user-disabled":
        errorMsg = "This account has been disabled.";
        break;
      case "auth/too-many-requests":
        errorMsg = "Too many failed attempts. Please try again later.";
        break;
      case "auth/invalid-credential":
        errorMsg = "Invalid email or password. Please try again.";
        break;
      default:
        errorMsg = "Login failed. Please try again.";
    }

    showMessage("⚠️ " + errorMsg, "error");

    // Reset button
    loginButton.disabled = false;
    loginButton.innerHTML = 'Sign In';
  }
});

// Helper function to show messages
function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type} show`;
  
  // Auto-hide error messages after 5 seconds
  if (type === "error") {
    setTimeout(() => {
      message.classList.remove("show");
    }, 5000);
  }
}

// Add Enter key support for form
document.getElementById("email").addEventListener("keypress", function(e) {
  if (e.key === "Enter") {
    document.getElementById("password").focus();
  }
});

// Add shake animation on error
function shakeForm() {
  const container = document.querySelector('.login-container');
  container.style.animation = 'none';
  setTimeout(() => {
    container.style.animation = 'shake 0.5s ease';
  }, 10);
}

// Add shake keyframes dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
    20%, 40%, 60%, 80% { transform: translateX(10px); }
  }
`;
document.head.appendChild(style);