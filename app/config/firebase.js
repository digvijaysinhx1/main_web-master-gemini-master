// Import Firebase dependencies
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
    authDomain: "globetrail-clg-project.firebaseapp.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.appspot.com",
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158",
    databaseURL: "https://globetrail-clg-project-default-rtdb.firebaseio.com"
};

// Initialize Firebase with error handling
let db;
try {
    console.log('Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    
    // Test the connection
    const testRef = ref(db, '/');
    get(testRef).then(() => {
        console.log('✅ Firebase connection test successful');
    }).catch(error => {
        console.error('❌ Firebase connection test failed:', error);
    });
    
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    console.error('Error details:', error.message);
    throw error;
}

module.exports = { db };