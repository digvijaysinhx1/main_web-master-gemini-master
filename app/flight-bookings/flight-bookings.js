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
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');

// Get booking template
const bookingTemplate = document.getElementById('bookingCardTemplate');

// Current filters
let currentFilters = {
    status: 'all',
    date: 'all'
};

// Store all bookings
let allBookings = [];

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    loadBookings();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    statusFilter.addEventListener('change', filterBookings);
    dateFilter.addEventListener('change', filterBookings);
}

// Load bookings from Firebase
async function loadBookings() {
    try {
        showLoading(true);
        
        // Get current user's bookings
        const bookingsRef = ref(db, 'bookings');
        const bookingsSnapshot = await get(bookingsRef);
        
        if (bookingsSnapshot.exists()) {
            allBookings = Object.entries(bookingsSnapshot.val()).map(([id, booking]) => ({
                id,
                ...booking
            }));
            
            // Sort bookings by date (newest first)
            allBookings.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Apply initial filters and display
            filterBookings();
        } else {
            showNoBookings();
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
        showError('Failed to load bookings. Please try again later.');
    } finally {
        showLoading(false);
    }
}

// Filter bookings based on current filters
function filterBookings() {
    currentFilters = {
        status: statusFilter.value,
        date: dateFilter.value
    };
    
    let filteredBookings = allBookings;
    
    // Apply status filter
    if (currentFilters.status !== 'all') {
        filteredBookings = filteredBookings.filter(booking => 
            booking.status.toLowerCase() === currentFilters.status
        );
    }
    
    // Apply date filter
    const now = new Date();
    switch (currentFilters.date) {
        case 'upcoming':
            filteredBookings = filteredBookings.filter(booking => 
                new Date(booking.departureDate) > now
            );
            break;
        case 'past':
            filteredBookings = filteredBookings.filter(booking => 
                new Date(booking.departureDate) < now
            );
            break;
        case 'thisMonth':
            filteredBookings = filteredBookings.filter(booking => {
                const bookingDate = new Date(booking.departureDate);
                return bookingDate.getMonth() === now.getMonth() &&
                       bookingDate.getFullYear() === now.getFullYear();
            });
            break;
        case 'lastMonth':
            filteredBookings = filteredBookings.filter(booking => {
                const bookingDate = new Date(booking.departureDate);
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
                return bookingDate.getMonth() === lastMonth.getMonth() &&
                       bookingDate.getFullYear() === lastMonth.getFullYear();
            });
            break;
    }
    
    displayBookings(filteredBookings);
}

// Display bookings in the UI
function displayBookings(bookings) {
    bookingsList.innerHTML = '';
    
    if (bookings.length === 0) {
        showNoBookings();
        return;
    }
    
    bookings.forEach(booking => {
        const bookingCard = bookingTemplate.content.cloneNode(true);
    
        // Safe destructuring
        const flight = booking.flightDetails || {};
        const payment = booking.paymentDetails || {};
    
        // Set booking details
        bookingCard.querySelector('.booking-reference').textContent = `Booking #${booking.id.slice(-6)}`;
        bookingCard.querySelector('.booking-date').textContent = booking.timestamp
            ? new Date(booking.timestamp).toLocaleDateString()
            : 'N/A';
        bookingCard.querySelector('.booking-from').textContent = flight.from || 'N/A';
        bookingCard.querySelector('.booking-to').textContent = flight.to || 'N/A';
        bookingCard.querySelector('.booking-departure').textContent = flight.departure
            ? new Date(flight.departure).toLocaleString()
            : 'N/A';
        bookingCard.querySelector('.booking-arrival').textContent = 'N/A'; // You can add this if you store arrival time
        bookingCard.querySelector('.booking-passengers').textContent = booking.passengerDetails
            ? `${booking.passengerDetails.length} passenger(s)`
            : 'N/A';
        bookingCard.querySelector('.booking-price').textContent = `₹${payment.amount ?? 'N/A'}`;
    
        // Set status with appropriate color
        const statusElement = bookingCard.querySelector('.booking-status');
        statusElement.textContent = booking.status;
        switch (booking.status.toLowerCase()) {
            case 'confirmed':
                statusElement.classList.add('bg-green-100', 'text-green-800');
                break;
            case 'pending':
                statusElement.classList.add('bg-yellow-100', 'text-yellow-800');
                break;
            case 'cancelled':
                statusElement.classList.add('bg-red-100', 'text-red-800');
                break;
        }
    
        // Event listeners
        const viewDetailsLink = bookingCard.querySelector('.view-details');
        viewDetailsLink.href = `/app/view-trip/view-trip.html?id=${booking.id}`;
    
        const downloadButton = bookingCard.querySelector('.download-ticket');
        downloadButton.addEventListener('click', () => downloadTicket(booking));
    
        bookingsList.appendChild(bookingCard);
    });    
    
    showBookings();
}

// Download ticket functionality
function downloadTicket(booking) {
    // Implement ticket download logic here
    console.log('Downloading ticket for booking:', booking.id);
    alert('Ticket download will be implemented soon!');
}

// UI State Management
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