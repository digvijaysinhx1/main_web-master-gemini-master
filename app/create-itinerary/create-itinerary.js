document.addEventListener('DOMContentLoaded', function() {
    // Add this at the top of your DOMContentLoaded function
    let currentUserId = null;
    let isAnonymous = true;

    // Function to get current user ID
    function getUserId() {
        if (!currentUserId) {
            // Generate a temporary ID for anonymous users
            const tempId = 'anon_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('tempUserId', tempId);
            return tempId;
        }
        return currentUserId;
    }

    // Function to update login status UI
    function updateLoginStatus(isLoggedIn, userName = '') {
        const container = document.querySelector('.container');
        let statusDiv = document.getElementById('loginStatus');
        
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'loginStatus';
            statusDiv.className = 'login-status';
            container.insertBefore(statusDiv, container.firstChild);
        }

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
                    <span>You're browsing as a guest. </span>
                    <a href="/login" class="login-link">Login</a> to save itineraries to your account.
                </div>
            `;
        }
    }

    // Add logout handler
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

    // Check if user is logged in
    fetch('/api/check-session')
        .then(response => response.json())
        .then(data => {
            console.log('Session data:', data); // Debug log
            if (data.authenticated && data.userId) {
                currentUserId = data.userId;
                isAnonymous = false;
                updateLoginStatus(true, data.name || 'User');
            } else {
                // Check for existing temporary ID
                const tempId = localStorage.getItem('tempUserId');
                if (tempId) {
                    currentUserId = tempId;
                }
                updateLoginStatus(false);
            }
        })
        .catch(error => {
            console.error('Error checking session:', error);
            updateLoginStatus(false);
        });

    // Load Google Maps API and initialize functionality
    fetch('/api/config')
        .then(response => response.json())
        .then(config => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsApiKey}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = initializeApp;
            document.head.appendChild(script);
        })
        .catch(error => console.error('Error loading Google Maps:', error));

    function initializeApp() {
        // Initialize Google Places Autocomplete with enhanced options
        const destinationInput = document.getElementById('destination');
        const autocomplete = new google.maps.places.Autocomplete(destinationInput, {
            types: ['(cities)'],
            fields: ['place_id', 'geometry', 'name']
        });

        // Store place data when a suggestion is selected originalText
        autocomplete.addListener('place_changed', function() {
            const place = autocomplete.getPlace();
            if (!place.geometry) {
                console.error('No details available for place');
                return;
            }

            destinationInput.dataset.placeId = place.place_id;
            destinationInput.dataset.lat = place.geometry.location.lat();
            destinationInput.dataset.lng = place.geometry.location.lng();
        });

        // Initialize Flatpickr date pickers
        const commonOptions = {
            minDate: "today",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "F j, Y",
            monthSelectorType: "static"
        };

        // Start date picker
        const startDatePicker = flatpickr("#startDate", {
            ...commonOptions,
            onChange: function(selectedDates) {
                // Update end date min date
                endDatePicker.set('minDate', selectedDates[0]);
            }
        });

        // End date picker
        const endDatePicker = flatpickr("#endDate", {
            ...commonOptions
        });

        // Form submission handler
        const generateBtn = document.getElementById('generateBtn');
        console.log('Generate button found:', generateBtn);

        generateBtn.addEventListener('click', async function() {
            console.log('Generate button clicked');
            try {
                // Get form values
                const destination = destinationInput.value;
                const placeId = destinationInput.dataset.placeId;
                const lat = destinationInput.dataset.lat;
                const lng = destinationInput.dataset.lng;
                const startDate = document.getElementById('startDate').value;
                const endDate = document.getElementById('endDate').value;
                const budget = document.querySelector('input[name="budget"]:checked')?.value;
                const travelers = document.querySelector('input[name="travelers"]:checked')?.value;

                console.log('Form values:', {
                    destination,
                    placeId,
                    startDate,
                    endDate,
                    budget,
                    travelers
                });

                // Validate all required fields
                if (!destination || !placeId) {
                    throw new Error('Please select a destination from the suggestions');
                }
                if (!startDate || !endDate) {
                    throw new Error('Please select both start and end dates');
                }
                if (!budget) {
                    throw new Error('Please select a budget range');
                }
                if (!travelers) {
                    throw new Error('Please select number of travelers');
                }

                // Calculate number of days
                const start = new Date(startDate);
                const end = new Date(endDate);
                const numberOfDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

                // Validate dates
                if (new Date(startDate) > new Date(endDate)) {
                    throw new Error('End date must be after start date');
                }

                // Show loading state
                console.log('Generating itinerary...');
                const originalText = this.textContent;
                this.disabled = true;
                this.textContent = 'Generating your perfect itinerary...';

                // Call the API to generate itinerary
                const response = await fetch('/api/generate-itinerary', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        destination,
                        placeId,
                        location: { lat, lng },
                        startDate,
                        endDate,
                        budget,
                        travelers
                    })
                });

                console.log('API response received:', response.status);
                const data = await response.json();
                console.log('API data:', data);

                if (!response.ok) {
                    throw new Error(data.details || data.error || 'Failed to generate itinerary');
                }

                if (!data.success || !data.itinerary) {
                    throw new Error('No itinerary was generated');
                }

                // Log the generated itinerary to console
                console.log('Generated Itinerary:', {
                    metadata: data.metadata,
                    itinerary: data.itinerary
                });

                // Display the itinerary
                const itineraryId = await displayItinerary(data.itinerary, data.metadata);

                // Save the data for later use
                window.currentItinerary = {
                    itineraryData: data.itinerary,
                    metadata: data.metadata
                };

            } catch (error) {
                console.error('❌ Error:', error.message);
            } finally {
                // Reset button state
                this.disabled = false;
                this.textContent = originalText;
            }
        });

        function displayItinerary(itineraryData, metadata) {
            // Create itinerary container if it doesn't exist
            let itineraryContainer = document.getElementById('itineraryContainer');
            if (!itineraryContainer) {
                itineraryContainer = document.createElement('div');
                itineraryContainer.id = 'itineraryContainer';
                document.querySelector('.container').appendChild(itineraryContainer);
            }

            // Clear previous itinerary
            itineraryContainer.innerHTML = '';

            // Add metadata section with save button
            const metadataHtml = `
                <div class="itinerary-metadata">
                    <div class="metadata-header">
                        <h2>Trip Details</h2>
                        <button id="saveItineraryBtn" class="save-btn">
                            <span class="save-icon">💾</span> Save Itinerary
                        </button>
                    </div>
                    <p><strong>Destination:</strong> ${metadata.destination}</p>
                    <p><strong>Dates:</strong> ${metadata.dates.startDate} to ${metadata.dates.endDate}</p>
                    <p><strong>Duration:</strong> ${metadata.numberOfDays} days</p>
                    <p><strong>Budget:</strong> ${metadata.budget}</p>
                    <p><strong>Travelers:</strong> ${metadata.travelers}</p>
                </div>
            `;
            itineraryContainer.innerHTML = metadataHtml;

            // Add save button event listener
            const saveBtn = document.getElementById('saveItineraryBtn');
            saveBtn.addEventListener('click', async () => {
                try {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="save-icon">⏳</span> Saving...';

                    const userId = getUserId();
                    const isTemp = userId.startsWith('anon_');

                    const response = await fetch('/api/save-itinerary', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            itineraryData,
                            metadata,
                            userId,
                            isTemporary: isTemp
                        })
                    });

                    const data = await response.json();
                    if (!data.success) {
                        throw new Error(data.error || 'Failed to save itinerary');
                    }

                    // Show appropriate success message
                    if (isTemp) {
                        saveBtn.innerHTML = '<span class="save-icon">✅</span> Saved (Guest Mode)';
                    } else {
                        saveBtn.innerHTML = '<span class="save-icon">✅</span> Saved!';
                    }

                    setTimeout(() => {
                        saveBtn.innerHTML = '<span class="save-icon">💾</span> Save Itinerary';
                        saveBtn.disabled = false;
                    }, 2000);

                } catch (error) {
                    console.error('Error saving itinerary:', error);
                    alert('Failed to save itinerary: ' + error.message);
                    saveBtn.innerHTML = '<span class="save-icon">❌</span> Save Failed';
                    setTimeout(() => {
                        saveBtn.innerHTML = '<span class="save-icon">💾</span> Save Itinerary';
                        saveBtn.disabled = false;
                    }, 2000);
                }
            });

            // Rest of your existing displayItinerary code...
            console.log(`✅ Success! Generated a ${metadata.numberOfDays} day ${metadata.travelers} trip to ${metadata.destination}`);
            console.log('Itinerary:', itineraryData);
        }
    }
});