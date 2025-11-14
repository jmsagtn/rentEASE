import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
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
const db = getFirestore(app);

// Plan limits configuration
const PLAN_LIMITS = {
  freemium: {
    maxProperties: 2,
    maxUnitsPerProperty: 4
  },
  premium: {
    maxProperties: 10,
    maxUnitsPerProperty: Infinity // unlimited
  },
  platinum: {
    maxProperties: Infinity, // unlimited
    maxUnitsPerProperty: Infinity // unlimited
  }
};

const signupForm = document.getElementById("signup-form");
const message = document.getElementById("message");
const submitButton = signupForm.querySelector("button[type='submit']");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // Frontend validation
  if (password.length < 6) {
    message.textContent = "⚠️ Password must be at least 6 characters.";
    message.className = "message error";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Creating account...";

  try {
    // Create user with Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Store user data with freemium plan in Firestore
    await setDoc(doc(db, "users", user.uid), {
      username: username,
      email: email,
      plan: "freemium", // Default plan
      planStartDate: new Date(),
      createdAt: new Date(),
      // Usage tracking
      propertiesCount: 0,
      unitsCount: 0
    });

    message.textContent = "🎉 Account created successfully! Starting with Freemium plan.";
    message.className = "message success";
    signupForm.reset();

    // Redirect after successful signup
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1500);
  } catch (error) {
    console.error("Error:", error);

    // Friendly error messages
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
      case "permission-denied":
        errorMsg = "Firestore permissions issue. Check your rules.";
        break;
      default:
        errorMsg = error.message;
    }

    message.textContent = "⚠️ " + errorMsg;
    message.className = "message error";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Sign Up";
  }
});