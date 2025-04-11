// Initialize Firebase with your config
const firebaseConfig = {
    apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
    authDomain: "globetrail-clg-project.firebaseapp.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.appspot.com",
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158",
    measurementId: "G-YRSKJYK6CL"
};

firebase.initializeApp(firebaseConfig);

// Check session and display user email
async function checkSession() {
    try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        if (!data.authenticated) {
            window.location.href = '/login';
        } else if (data.user && data.user.email) {
            document.getElementById('userEmail').textContent = data.user.email;
        }
    } catch (error) {
        console.error('Session check failed:', error);
        window.location.href = '/login';
    }
}

// Handle logout
async function handleLogout() {
    try {
        // Sign out from Firebase
        await firebase.auth().signOut();
        
        // Clear server session
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            window.location.href = '/login';
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error logging out. Please try again.');
    }
}

// Initialize dashboard
function initDashboard() {
    // Add event listeners
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Check session on load
    checkSession();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);