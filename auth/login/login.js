// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-analytics.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
    authDomain: "globetrail-clg-project.firebaseapp.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.appspot.com",  // Corrected here
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158",
    measurementId: "G-YRSKJYK6CL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);  // Corrected line
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// Function to validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Function to check and update user data if needed
async function checkAndUpdateUserData(userId, email, name = '', phone = '') {
    try {
        const userRef = ref(db, 'users/' + userId);
        const snapshot = await get(userRef);
        
        if (!snapshot.exists()) {
            // User doesn't exist in database, create new entry
            await set(userRef, {
                email: email,
                name: name || '',
                phone: phone || ''
            });
            console.log("New user data created");
        }
    } catch (error) {
        console.error("Error checking/updating user data:", error);
        // Don't throw error here as this is not critical for login
    }
}

// Function to create server session
async function createServerSession(email, firebaseUser) {
    try {
        if (!email || !firebaseUser || !firebaseUser.uid) {
            throw new Error('Invalid user data');
        }

        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                firebaseUid: firebaseUser.uid
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response:', errorText);
            throw new Error('Server error: ' + response.status);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to create session');
        }
        return true;
    } catch (error) {
        console.error('Session creation error:', error);
        throw new Error(`Session creation failed: ${error.message}`);
    }
}

// Google Sign In function
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        console.log("Google sign in successful!");
        
        // Check and update user data
        await checkAndUpdateUserData(user.uid, user.email, user.displayName);
        
        // Create server session
        await createServerSession(user.email, user);
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
    } catch (error) {
        console.error("Google sign in error:", error);
        alert("Failed to sign in with Google: " + error.message);
    }
}

// Submit button event listener
const submit = document.getElementById('submit');
submit.addEventListener("click", async function (event) {
    event.preventDefault();
    console.log("Submit button clicked");

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    console.log("Email:", email);
    console.log("Password:", password);

    // Check if email format is valid before attempting login
    if (!isValidEmail(email)) {
        alert("Invalid email format. Please enter a valid email.");
        return;
    }

    try {
        // Firebase authentication
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Firebase login successful!");

        // Check and update user data
        await checkAndUpdateUserData(userCredential.user.uid, email);
        
        // Create server session
        await createServerSession(email, userCredential.user);
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
    } catch (error) {
        console.error("Error occurred:", error);
        console.log("Error Code:", error.code);
        console.log("Error Message:", error.message);

        // Handle common Firebase authentication errors
        switch (error.code) {
            case 'auth/user-not-found':
                alert("You don't have an account, please create a new account.");
                break;
            case 'auth/wrong-password':
                alert("Incorrect password. Please try again.");
                break;
            default:
                alert("Login failed: " + error.message);
        }
    }
});

// Add Google Sign In button event listener
const googleSignInBtn = document.getElementById('google-signin');
if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", (e) => {
        e.preventDefault();
        signInWithGoogle();
    });
}
