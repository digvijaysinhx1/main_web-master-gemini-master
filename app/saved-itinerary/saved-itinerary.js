document.addEventListener('DOMContentLoaded', function() {
    let currentUserId = null;
    let isAnonymous = true;

    // Function to update login status UI
    function updateLoginStatus(isLoggedIn, userName = '') {
        const statusDiv = document.getElementById('loginStatus');
        
        if (isLoggedIn) {
            statusDiv.innerHTML = `
                <div class="user-info">
                    <span class="welcome-text">Welcome, ${userName}</span>
                    <button onclick="location.href='/dashboard'" class="dashboard-btn">Dashboard</button>
                    <button onclick="handleLogout()" class="logout-btn">Logout</button>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="login-prompt">
                    <span>Please <a href="/login" class="login-link">login</a> to view your saved itineraries.</span>
                </div>
            `;
        }
    }

    // Function to format date
    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    }

    // Function to create itinerary card
    function createItineraryCard(itinerary) {
        const card = document.createElement('div');
        card.className = 'itinerary-card';
        
        const destination = itinerary.metadata.destination;
        const startDate = formatDate(itinerary.metadata.startDate);
        const endDate = formatDate(itinerary.metadata.endDate);
        
        card.innerHTML = `
            <div class="itinerary-title">${destination}</div>
            <div class="itinerary-details">
                <p><strong>Dates:</strong> ${startDate} - ${endDate}</p>
                <p><strong>Budget:</strong> $${itinerary.metadata.budget}</p>
                <p><strong>Travelers:</strong> ${itinerary.metadata.travelers}</p>
            </div>
            <div class="itinerary-meta">
                <span class="itinerary-date">Saved on ${formatDate(itinerary.createdAt)}</span>
                <div class="action-buttons">
                    <button onclick="viewItinerary('${itinerary.id}')" class="view-btn">View</button>
                    <button onclick="deleteItinerary('${itinerary.id}')" class="delete-btn">Delete</button>
                </div>
            </div>
            ${itinerary.isTemporary ? '<div class="temporary-badge">Temporary Save</div>' : ''}
        `;
        
        return card;
    }

    // Function to load itineraries
    async function loadItineraries() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        const noItineraries = document.getElementById('noItineraries');
        const itinerariesList = document.getElementById('itinerariesList');
        
        loadingSpinner.classList.remove('hidden');
        noItineraries.classList.add('hidden');
        itinerariesList.innerHTML = '';

        try {
            console.log('Fetching itineraries for user:', currentUserId);
            const response = await fetch(`/api/itineraries/${currentUserId}`);
            const data = await response.json();
            console.log('Received itineraries:', data);

            loadingSpinner.classList.add('hidden');

            if (!data.itineraries || data.itineraries.length === 0) {
                console.log('No itineraries found');
                noItineraries.classList.remove('hidden');
                return;
            }

            console.log('Processing', data.itineraries.length, 'itineraries');
            data.itineraries.forEach(itinerary => {
                console.log('Creating card for itinerary:', itinerary.id);
                const card = createItineraryCard(itinerary);
                itinerariesList.appendChild(card);
            });

        } catch (error) {
            console.error('Error loading itineraries:', error);
            loadingSpinner.classList.add('hidden');
            noItineraries.classList.remove('hidden');
            noItineraries.innerHTML = '<p>Error loading itineraries. Please try again later.</p>';
        }
    }

    // Function to view itinerary details
    window.viewItinerary = function(itineraryId) {
        window.location.href = `/itinerary/${itineraryId}`;
    };

    // Function to delete itinerary
    window.deleteItinerary = async function(itineraryId) {
        if (!confirm('Are you sure you want to delete this itinerary?')) {
            return;
        }

        try {
            const response = await fetch(`/api/itineraries/${itineraryId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                loadItineraries(); // Reload the list
            } else {
                alert('Failed to delete itinerary. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting itinerary:', error);
            alert('Error deleting itinerary. Please try again.');
        }
    };

    // Function to handle logout
    window.handleLogout = async function() {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            if (data.success) {
                window.location.href = '/login';
            } else {
                throw new Error('Logout failed');
            }
        } catch (error) {
            console.error('Error during logout:', error);
            alert('Failed to logout. Please try again.');
        }
    };

    // Check session and load itineraries
    fetch('/api/check-session')
        .then(response => response.json())
        .then(data => {
            console.log('Session check response:', data);
            if (data.authenticated && data.userId) {
                currentUserId = data.userId;
                isAnonymous = false;
                console.log('User is authenticated:', currentUserId);
                updateLoginStatus(true, data.name || 'User');
                loadItineraries();
            } else {
                console.log('User is not authenticated');
                // Check for temporary ID
                const tempId = localStorage.getItem('tempUserId');
                if (tempId) {
                    console.log('Found temporary user ID:', tempId);
                    currentUserId = tempId;
                    loadItineraries();
                }
                updateLoginStatus(false);
            }
        })
        .catch(error => {
            console.error('Error checking session:', error);
            updateLoginStatus(false);
        });
});