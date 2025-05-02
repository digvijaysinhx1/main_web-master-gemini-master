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
            // Store the original button text
            const originalText = this.textContent;
            
            try {
                console.log('Generate button clicked');
                // Get form values
                const destination = destinationInput.value;
                const placeId = destinationInput.dataset.placeId;
                const lat = destinationInput.dataset.lat;
                const lng = destinationInput.dataset.lng;
                const originalText = this.textContent;
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
                    alert('Please select a destination from the suggestions');
                    return;
                }
                if (!startDate || !endDate) {
                    alert('Please select both start and end dates');
                    return;
                }
                if (!budget) {
                    alert('Please select a budget range');
                    return;
                }
                if (!travelers) {
                    throw new Error('Please select number of travelers');
                    return;
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
                console.log('Generated Itinerary:', data);

                // Auto-save to Firebase and redirect
                try {
                    const userId = document.getElementById('userId');
                    
                    const saveResponse = await fetch('/api/save-itinerary', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include',
                        body: JSON.stringify({
                            itineraryData: data.itinerary, // This is already parsed JSON from the server
                            metadata: {
                                destination: destination,
                                startDate: startDate,
                                endDate: endDate,
                                budget: budget,
                                travelers: travelers,
                                userId: userId,
                                numberOfDays: Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
                            }
                        })
                    });

                    if (!saveResponse.ok) {
                        const errorData = await saveResponse.json();
                        throw new Error(errorData.error || errorData.details || 'Failed to save itinerary');
                    }

                    const saveResult = await saveResponse.json();
                    if (saveResult.success) {
                        // Show success message
                        const successMessage = document.createElement('div');
                        successMessage.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded shadow-lg z-50';
                        successMessage.textContent = 'Itinerary saved successfully! Redirecting...';
                        document.body.appendChild(successMessage);

                        // Get authenticated user ID from session
                        const userResponse = await fetch('/api/check-session', {
                            credentials: 'include'
                        });
                        const userData = await userResponse.json();
                        
                        if (!userData.authenticated) {
                            throw new Error('User not authenticated');
                        }

                        // Redirect to view-trip page after a short delay
                        setTimeout(() => {
                            window.location.href = `/view-trip?id=${saveResult.itineraryId}&userId=${userData.userId}`;
                        }, 1500);
                    } else {
                        throw new Error(saveResult.error || 'Failed to save itinerary');
                    }
                } catch (error) {
                    console.error('Error saving itinerary:', error);
                    alert(error.message || 'Failed to save itinerary. Please try again.');
                }

                // Display success message
                console.log(`✅ Success! Generated a ${numberOfDays} day ${travelers} trip to ${destination}`);
                console.log('Itinerary:', data.itinerary);

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

            // Add metadata section
            const metadataHtml = `
                <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">Your Travel Plan</h2>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                            </svg>
                            <span class="text-gray-600">${metadata.destination}</span>
                        </div>
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                            <span class="text-gray-600">${metadata.numberOfDays} days</span>
                        </div>
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                            </svg>
                            <span class="text-gray-600">${metadata.travelers} travelers</span>
                        </div>
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <span class="text-gray-600">${metadata.budget}</span>
                        </div>
                    </div>
                </div>
            `;
            itineraryContainer.innerHTML = metadataHtml;

            // Add loading indicator while saving
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'text-center py-4';
            loadingIndicator.innerHTML = `
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                <p class="mt-2 text-gray-600">Saving your itinerary...</p>
            `;
            itineraryContainer.appendChild(loadingIndicator);
        }

        function parseItineraryData(itineraryText) {
            if (!itineraryText) return [];
            
            const days = [];
            let currentDay = null;
            
            // Split the text into lines and process each line
            const lines = itineraryText.toString().split('\n');
            
            for (const line of lines) {
                // Check if this line starts a new day
                const dayMatch = line.match(/^Day (\d+):/i);
                if (dayMatch) {
                    if (currentDay) {
                        days.push(currentDay);
                    }
                    currentDay = {
                        dayNumber: parseInt(dayMatch[1]),
                        activities: []
                    };
                    continue;
                }

                // If we have a current day and the line isn't empty, process it as an activity
                if (currentDay && line.trim()) {
                    // Try to extract activity details
                    const activity = {
                        name: '',
                        time: '',
                        description: '',
                        location: '',
                        cost: '',
                        image: getRandomPlaceholderImage() // You can replace this with actual images
                    };

                    // Extract time if present (e.g., "10:00 AM - Visit...")
                    const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                    if (timeMatch) {
                        activity.time = timeMatch[1];
                        activity.name = line.substring(timeMatch[0].length).trim();
                    } else {
                        activity.name = line.trim();
                    }

                    // Look for location in parentheses
                    const locationMatch = line.match(/\((.*?)\)/);
                    if (locationMatch) {
                        activity.location = locationMatch[1];
                        activity.name = activity.name.replace(`(${locationMatch[1]})`, '').trim();
                    }

                    // Look for cost information
                    const costMatch = line.match(/(\$[\d,]+)/);
                    if (costMatch) {
                        activity.cost = costMatch[1];
                        activity.name = activity.name.replace(costMatch[1], '').trim();
                    }

                    // Add the activity to the current day
                    currentDay.activities.push(activity);
                }
            }

            // Don't forget to add the last day
            if (currentDay) {
                days.push(currentDay);
            }

            return days;
        }

        function getRandomPlaceholderImage() {
            const images = [
                'https://source.unsplash.com/400x300/?travel,landmark',
                'https://source.unsplash.com/400x300/?tourism',
                'https://source.unsplash.com/400x300/?architecture',
                'https://source.unsplash.com/400x300/?city',
                'https://source.unsplash.com/400x300/?nature'
            ];
            return images[Math.floor(Math.random() * images.length)];
        }
    }
});