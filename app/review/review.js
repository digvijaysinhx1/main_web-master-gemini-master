// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
    authDomain: "globetrail-clg-project.firebaseapp.com",
    databaseURL: "https://globetrail-clg-project-default-rtdb.firebaseio.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.appspot.com",
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const reviewsRef = database.ref("reviews");

// Submit a new review
function submitReview() {
  const user = firebase.auth().currentUser;

  // Ensure the user is logged in
  if (!user) {
    alert("You must be logged in to submit a review.");
    return;
  }

  const name = document.getElementById("name").value.trim();
  const message = document.getElementById("message").value.trim();

  if (!name || !message) {
    alert("Please fill in both fields.");
    return;
  }

  // Review object including userId for tracking
  const review = {
    name,
    message,
    timestamp: new Date().toLocaleString(),
    userId: user.uid
  };

  // Save review to Firebase Realtime Database
  reviewsRef.push(review);

  // Clear form inputs
  document.getElementById("name").value = "";
  document.getElementById("message").value = "";
}

// Show all reviews from Firebase
reviewsRef.on("value", (snapshot) => {
  const reviewsList = document.getElementById("reviewsList");
  reviewsList.innerHTML = "";  // Clear the reviews list

  const data = snapshot.val();
  if (data) {
    const keys = Object.keys(data).reverse(); // Show latest first
    keys.forEach((key) => {
      const review = data[key];
      addReviewToPage(review);
    });
  }
});

// Function to add review to the page
function addReviewToPage(review) {
  const reviewsList = document.getElementById("reviewsList");

  const reviewDiv = document.createElement("div");
  reviewDiv.classList.add("review");

  reviewDiv.innerHTML = `
    <h3>${review.name}</h3>
    <p>${review.message}</p>
    <small>${review.timestamp}</small>
  `;

  reviewsList.prepend(reviewDiv);
}

// Make submitReview available globally
window.submitReview = submitReview;
