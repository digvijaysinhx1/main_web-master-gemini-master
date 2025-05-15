import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js';
import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB_dyM2dfau2b6vXtoWtR04mlNbTD38cso",
    authDomain: "globetrail-ebe2c.firebaseapp.com",
    databaseURL: "https://globetrail-clg-project-default-rtdb.firebaseio.com/",
    projectId: "globetrail-ebe2c",
    storageBucket: "globetrail-ebe2c.appspot.com",
    messagingSenderId: "1015545811639",
    appId: "1:1015545811639:web:c05203031e9a81c5e2524c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const loadingSpinner = document.getElementById('loadingSpinner');
const bookingsContainer = document.getElementById('bookingsContainer');
const bookingsList = document.getElementById('bookingsList');
const noBookingsMessage = document.getElementById('noBookingsMessage');
const errorContainer = document.getElementById('errorContainer');
const errorMessage = document.getElementById('errorMessage');

// Booking template
const bookingTemplate = document.getElementById('bookingCardTemplate');

let allBookings = [];

document.addEventListener('DOMContentLoaded', () => {
    loadHotelBookings();
});

// Load hotel bookings from Firebase
async function loadHotelBookings() {
    try {
        showLoading(true);

        const bookingsRef = ref(db, 'hotel_bookings'); // ✅ Corrected path
        const snapshot = await get(bookingsRef);

        if (snapshot.exists()) {
            allBookings = Object.entries(snapshot.val()).map(([id, booking]) => ({
                id,
                ...booking
            }));

            // ✅ Use correct check-in date field
            allBookings.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

            displayBookings(allBookings);
        } else {
            showNoBookings();
        }
    } catch (error) {
        console.error('Error loading hotel bookings:', error);
        showError('Failed to load hotel bookings. Please try again later.');
    } finally {
        showLoading(false);
    }
}

// Display bookings
function displayBookings(bookings) {
    bookingsList.innerHTML = '';

    if (bookings.length === 0) {
        showNoBookings();
        return;
    }

    bookings.forEach(booking => {
        const card = bookingTemplate.content.cloneNode(true);

        card.querySelector('.booking-reference').textContent = `Booking #${booking.bookingId?.slice(-6) || booking.id.slice(-6)}`;

        card.querySelector('.booking-date').textContent = `Booked for: ${new Date(booking.checkInDate).toLocaleDateString()} - ${new Date(booking.checkOutDate).toLocaleDateString()}`;
        card.querySelector('.booking-hotel').textContent = booking.hotelName || 'N/A';
        card.querySelector('.booking-room').textContent = `Room Type: ${booking.roomType || 'N/A'}`;
        card.querySelector('.booking-guests').textContent = `${booking.adults} adult(s), ${booking.children || 0} child(ren), ${booking.rooms} room(s)`;
        card.querySelector('.booking-price').textContent = `₹${booking.pricePerNight}/night × ${booking.nights} night(s) = ₹${booking.totalPrice}`;

        // ✅ Use nested guest fields
        const guest = booking.guest || {};
        guest.guestName
        guest.guestPhone
        card.querySelector('.booking-guest').textContent = `Guest: ${booking.guestName || 'N/A'} (${booking.guestEmail || 'N/A'}, ${booking.guestPhone || 'N/A'})`;

        // Optional: Show booking status and payment info
        const specialRequests = booking.specialRequests || 'None';
        console.log('Booking:', booking);

        const status = booking.bookingStatus || 'N/A';

        const statusEl = card.querySelector('.booking-status');
        if (statusEl) {
            statusEl.textContent = `Payment Status: ${status}`;
        }
        if (card.querySelector('.booking-requests')) {
            card.querySelector('.booking-requests').textContent = `Requests: ${specialRequests}`;
        }

        const downloadBtn = card.querySelector('.download-ticket');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => downloadTicket(booking));
        }

        bookingsList.appendChild(card);
    });

    showBookings();
}

// Dummy download function
function downloadTicket(booking) {
    console.log('Downloading hotel ticket for:', booking.id);
    alert('Hotel ticket download feature coming soon!');
}

// UI state management
function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

function showBookings() {
    bookingsContainer.classList.remove('hidden');
    noBookingsMessage.classList.add('hidden');
    errorContainer.classList.add('hidden');
}

function showNoBookings() {
    bookingsContainer.classList.remove('hidden');
    noBookingsMessage.classList.remove('hidden');
    bookingsList.innerHTML = '';
    errorContainer.classList.add('hidden');
}

function showError(message) {
    errorContainer.classList.remove('hidden');
    errorMessage.textContent = message;
    bookingsContainer.classList.add('hidden');
}
