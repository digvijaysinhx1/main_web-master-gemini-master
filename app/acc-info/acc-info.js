import {
    initializeApp
  } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
  import {
    getAuth,
    onAuthStateChanged
  } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js";
  import {
    getDatabase,
    ref,
    get,
    update
  } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js";
  
  // Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
    authDomain: "globetrail-clg-project.firebaseapp.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.appspot.com",
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158",
    measurementId: "G-YRSKJYK6CL"
  };
  
  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  
  // DOM Elements
  const profileForm = document.getElementById('profileForm');
  const fullNameInput = document.getElementById('fullName');
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');
  const countryInput = document.getElementById('country');
  const stateInput = document.getElementById('state');
  const updateBtn = document.getElementById('updateBtn');
  
  // Store original values when data is loaded
  let originalValues = {};
  
  // Load user data
  onAuthStateChanged(auth, async (user) => {
      if (user) {
          // Get user profile data from Firebase
          const userRef = ref(db, `users/${user.uid}`);
          try {
              const snapshot = await get(userRef);
              if (snapshot.exists()) {
                  const userData = snapshot.val();
                  
                  // Populate form fields and store original values
                  originalValues = {
                      fullName: userData.fullName || '',
                      phone: userData.phone || '',
                      email: user.email || '',
                      country: userData.country || '',
                      state: userData.state || ''
                  };
                  
                  fullNameInput.value = originalValues.fullName;
                  phoneInput.value = originalValues.phone;
                  emailInput.value = originalValues.email;
                  countryInput.value = originalValues.country;
                  stateInput.value = originalValues.state;
              }
          } catch (error) {
              console.error('Error loading user data:', error);
              showAlert('Error loading user data. Please try again.');
          }
      } else {
          // Redirect to login if not authenticated
          window.location.href = '/login';
      }
  });
  
  // Handle update button click
  updateBtn.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) {
          showAlert('Please log in again to update your information.');
          return;
      }
  
      try {
          updateBtn.disabled = true;
          updateBtn.textContent = 'Updating...';
          
          // Only include changed fields in the update
          const userData = {};
          let hasUpdates = false;
  
          // Check if email or phone is already registered
          const newEmail = emailInput.value.trim();
          const newPhone = phoneInput.value.trim();
  
          if (newEmail !== originalValues.email || newPhone !== originalValues.phone) {
              const usersRef = ref(db, 'users');
              const snapshot = await get(usersRef);
  
              //check both email and phone in a single loop
              let emailExists = false;
              let phoneExists = false;
  
              snapshot.forEach((childSnapshot) => {
                  if (childSnapshot.key === user.uid) return; 
  
                  const childData = childSnapshot.val();
                  if (childData.email === newEmail) {
                      emailExists = true;
                  }
                  if (childData.phone === newPhone) {
                      phoneExists = true;
                  }
              });
  
              if (emailExists) {
                  showAlert('Email already registered with another account', 'error');
                  updateBtn.disabled = false; 
                  updateBtn.textContent = 'Update Info';
                  return;
              }
              
              if (phoneExists) {
                  showAlert('Phone number already registered with another account', 'error');
                  updateBtn.disabled = false;
                  updateBtn.textContent = 'Update Info';
                  return;
              }
              
              // Add email and phone to update if they've changed
              if (newEmail !== originalValues.email) {
                userData.email = newEmail;
                hasUpdates = true;
            }
            if (newPhone !== originalValues.phone) {
                userData.phone = newPhone;
                hasUpdates = true;
            }
        }
  
        // Check other fields
        const newFullName = fullNameInput.value.trim();
        const newCountry = countryInput.value.trim();
        const newState = stateInput.value.trim();
  
          if (newFullName !== originalValues.fullName) {
              userData.fullName = newFullName;
              hasUpdates = true;
          }
          if (newCountry !== originalValues.country) {
              userData.country = countryInput.value.trim();
              hasUpdates = true;
          }
          if (stateInput.value.trim() !== originalValues.state) {
              userData.state = stateInput.value.trim();
              hasUpdates = true;
          }
  
          // Only update database if there are changes
          if (hasUpdates) {
              userData.updatedAt = new Date().toISOString();
              await update(ref(db, `users/${user.uid}`), userData);
              
              // Update original values
              Object.assign(originalValues, userData);
              
              showAlert('Profile updated successfully!', 'success');
          } else {
              showAlert('No changes to update', 'info');
          }
      } catch (error) {
          console.error('Error updating profile:', error);
          showAlert('Error updating profile. Please try again.');
      } finally {
          updateBtn.disabled = false;
          updateBtn.textContent = 'Update Info';
      }
  });
  
  // Helper function to show alerts
  function showAlert(message, type = 'error') {
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert alert-${type}`;
      alertDiv.textContent = message;
      
      document.querySelector('.container').insertBefore(alertDiv, profileForm);
      
      setTimeout(() => {
          alertDiv.remove();
      }, 5000);
  }
  