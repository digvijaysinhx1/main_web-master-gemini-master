// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
    authDomain: "globetrail-clg-project.firebaseapp.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.firebasestorage.app",
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158",
    measurementId: "G-YRSKJYK6CL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// Function to save user data to Firebase Realtime Database
async function saveUserData(userId, email, name, phone = '') {
    try {
        await set(ref(db, 'users/' + userId), {
            email: email,
            name: name,
            phone: phone
        });
        console.log("User data saved successfully");
    } catch (error) {
        console.error("Error saving user data:", error);
        throw error;
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
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create session');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error('Failed to create session');
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
        
        // Save user data
        await saveUserData(user.uid, user.email, user.displayName || '');
        
        // Create server session
        await createServerSession(user.email, user);
        
        // Redirect to create-itinerary page
        window.location.href = '/create-itinerary';
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
    const name = document.getElementById('name').value; 
    const phone = document.getElementById('phone').value; 
    
    try {
        // Create Firebase account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("Account created successfully!");
        
        // Save additional user data
        await saveUserData(userCredential.user.uid, email, name, phone);
        
        // Create server session
        await createServerSession(email, userCredential.user);
        
        // Redirect to create-itinerary page
        window.location.href = '/create-itinerary';
    } catch (error) {
        console.error("Error occurred:", error);
        alert(`Registration failed: ${error.message}`);
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
