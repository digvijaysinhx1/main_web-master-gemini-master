class FlightSearch {
    constructor() {
        this.form = document.getElementById('flightSearchForm');
        this.originInput = document.getElementById('origin');
        this.destinationInput = document.getElementById('destination');
        this.originSuggestions = document.getElementById('originSuggestions');
        this.destinationSuggestions = document.getElementById('destinationSuggestions');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.searchResults = document.getElementById('searchResults');
        this.currentBooking = null;
        this.selectedOrigin = null;
        this.selectedDestination = null;
        this.currentDate = {
            departure: new Date(),
            return: new Date()
        };
        
        this.setupEventListeners();
        this.initializeAirportAutocomplete();
        this.initializeCalendars();
        this.initializeBookingProcess();
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        
        // Clear selection when input changes
        this.originInput.addEventListener('input', () => {
            this.selectedOrigin = null;
            this.showSuggestions(this.originSuggestions);
        });
        
        this.destinationInput.addEventListener('input', () => {
            this.selectedDestination = null;
            this.showSuggestions(this.destinationSuggestions);
        });
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.airport-input-container')) {
                this.hideSuggestions(this.originSuggestions);
                this.hideSuggestions(this.destinationSuggestions);
            }
        });
        
        // Add date validation listener
        document.getElementById('departureDate').addEventListener('change', () => this.validateDate());
    }

    initializeAirportAutocomplete() {
        // Setup origin input
        this.setupAirportInput(this.originInput, this.originSuggestions, (airport) => {
            this.selectedOrigin = airport;
        });

        // Setup destination input
        this.setupAirportInput(this.destinationInput, this.destinationSuggestions, (airport) => {
            this.selectedDestination = airport;
        });
    }

    setupAirportInput(input, suggestionsContainer, onSelect) {
        let debounceTimer;

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const keyword = input.value.trim();

            if (keyword.length < 2) {
                this.hideSuggestions(suggestionsContainer);
                return;
            }

            debounceTimer = setTimeout(() => {
                this.fetchAndDisplayAirports(keyword, suggestionsContainer, input, onSelect);
            }, 300); // Debounce for 300ms
        });

        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 2) {
                this.showSuggestions(suggestionsContainer);
            }
        });
    }

    async fetchAndDisplayAirports(keyword, suggestionsContainer, input, onSelect) {
        try {
            // Show loading state
            suggestionsContainer.innerHTML = '<div class="text-center py-2">Searching...</div>';
            this.showSuggestions(suggestionsContainer);

            // Don't search if keyword is too short
            if (keyword.length < 2) {
                suggestionsContainer.innerHTML = '<div class="p-2 text-gray-500">Please enter at least 2 characters</div>';
                return;
            }

            const response = await fetch(`/api/airports/search?keyword=${encodeURIComponent(keyword)}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.details || 'Failed to fetch airports');
            }

            if (!data.airports || data.airports.length === 0) {
                suggestionsContainer.innerHTML = '<div class="p-2 text-gray-500">No airports found</div>';
                return;
            }

            this.displaySuggestions(data.airports, suggestionsContainer, input, onSelect);
        } catch (error) {
            console.error('Airport search error:', error);
            suggestionsContainer.innerHTML = '<div class="p-2 text-red-500">Failed to search airports</div>';
        }
    }

    displaySuggestions(airports, suggestionsContainer, input, onSelect) {
        suggestionsContainer.innerHTML = airports.map(airport => `
            <div class="suggestion-item" data-iata="${airport.iata}">
                <span class="airport-code">${airport.iata}</span>
                <div class="airport-details">
                    <div class="airport-name">${airport.name}</div>
                    <div class="airport-location">${airport.city}, ${airport.country}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers to suggestions
        suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const airport = airports.find(a => a.iata === item.dataset.iata);
                input.value = `${airport.name} (${airport.iata})`;
                onSelect(airport);
                this.hideSuggestions(suggestionsContainer);
            });
        });
    }

    showSuggestions(container) {
        if (container.children.length > 0) {
            container.classList.remove('hidden');
        }
    }

    hideSuggestions(container) {
        container.classList.add('hidden');
    }

    validateDate() {
        const departureDateInput = document.getElementById('departureDate');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const selectedDate = new Date(departureDateInput.value);
        if (selectedDate < today) {
            this.showError('Departure date cannot be in the past');
            departureDateInput.value = '';
            return false;
        }
        
        return true;
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        if (!this.selectedOrigin || !this.selectedDestination) {
            this.showError('Please select airports from the suggestions');
            return;
        }

        if (this.selectedOrigin.iata === this.selectedDestination.iata) {
            this.showError('Origin and destination cannot be the same');
            return;
        }

        const departureDate = document.getElementById('departureDate').value;
        if (!departureDate || !this.validateDate()) {
            this.showError('Please select a valid departure date');
            return;
        }

        const adults = parseInt(document.getElementById('adults').value);
        if (isNaN(adults) || adults < 1) {
            this.showError('Please enter a valid number of passengers');
            return;
        }

        this.hideError();
        this.showLoading(true);

        try {
            console.log('Searching flights with params:', {
                origin: this.selectedOrigin.iata,
                destination: this.selectedDestination.iata,
                departureDate,
                adults
            });

            const response = await fetch('/api/flights/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    origin: this.selectedOrigin.iata,
                    destination: this.selectedDestination.iata,
                    departureDate,
                    adults
                })
            });

            const data = await response.json();
            console.log('Flight search response:', data);

            if (!response.ok) {
                throw new Error(data.error || data.details || 'Failed to search flights');
            }

            if (!data.flights || !Array.isArray(data.flights)) {
                throw new Error('Invalid flight data received from server');
            }

            this.displayFlightResults(data.flights);
        } catch (error) {
            console.error('Flight search error:', error);
            this.showError(error.message || 'Failed to search flights. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    displayFlightResults(flights) {
        if (!flights || flights.length === 0) {
            this.searchResults.innerHTML = `
                <div class="bg-white rounded-lg shadow-lg p-6 text-center">
                    <p class="text-gray-600">No flights found for your search criteria.</p>
                </div>
            `;
            return;
        }

        console.log('Displaying flights:', flights);

        // Map of Indian airlines to their names and SVG icons
        const airlines = {
            'AI': { 
                name: 'Air India',
                icon: `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#e31837">
                    <path d="M12,2L4,12h2l6-8l6,8h2L12,2z M12,22l8-10h-2l-6,8l-6-8H4L12,22z"/>
                </svg>`
            },
            'UK': { 
                name: 'Vistara',
                icon: `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#4b286d">
                    <path d="M21,16V8a2,2,0,0,0-2-2H5A2,2,0,0,0,3,8v8a2,2,0,0,0,2,2H19A2,2,0,0,0,21,16z"/>
                </svg>`
            },
            '6E': { 
                name: 'IndiGo',
                icon: `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#0B2343">
                    <path d="M3,3H21V21H3V3M12,7A5,5,0,1,1,7,12,5,5,0,0,1,12,7Z"/>
                </svg>`
            },
            'SG': { 
                name: 'SpiceJet',
                icon: `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#CC0000">
                    <path d="M12,2L4,12h2l6-8l6,8h2L12,2z M4,12h16v2H4V12z"/>
                </svg>`
            },
            'G8': { 
                name: 'GoAir',
                icon: `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#0B5BAA">
                    <path d="M21,16V8a2,2,0,0,0-2-2H5A2,2,0,0,0,3,8v8a2,2,0,0,0,2,2H19A2,2,0,0,0,21,16z"/>
                </svg>`
            },
            'I5': { 
                name: 'AirAsia India',
                icon: `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#FF0000">
                    <path d="M12,2L4,12h2l6-8l6,8h2L12,2z M12,22l8-10h-2l-6,8l-6-8H4L12,22z"/>
                </svg>`
            }
        };

        // Default airline icon
        const defaultAirlineIcon = `<svg class="h-8 w-8" viewBox="0 0 24 24" fill="#718096">
            <path d="M21,16V8a2,2,0,0,0-2-2H5A2,2,0,0,0,3,8v8a2,2,0,0,0,2,2H19A2,2,0,0,0,21,16z"/>
        </svg>`;

        // USD to INR conversion rate (you should ideally fetch this from an API)
        const USD_TO_INR = 83.5;

        this.searchResults.innerHTML = flights.map(flight => {
            try {
                console.log('Processing flight:', {
                    airline: flight.airline,
                    airlineName: flight.airlineName,
                    flightNumber: flight.flightNumber,
                    rawFlight: flight
                });

                // Format the date and time
                const departureTime = new Date(flight.departureTime).toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                const arrivalTime = new Date(flight.arrivalTime).toLocaleString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                // Get airline info
                let airlineCode = '';
                let airlineName = '';

                // Try to extract airline code and name
                if (typeof flight.airline === 'string') {
                    airlineCode = flight.airline;
                } else if (typeof flight.airline === 'object' && flight.airline !== null) {
                    airlineCode = flight.airline.code || flight.airline.iata || '';
                    airlineName = flight.airline.name || '';
                }

                const airlineInfo = airlines[airlineCode] || { 
                    name: airlineName || flight.airlineName || airlineCode || 'Unknown Airline',
                    icon: defaultAirlineIcon
                };

                // Convert and format the price
                let priceInINR = 0;
                if (typeof flight.price === 'object') {
                    if (flight.price.currency === 'USD') {
                        priceInINR = flight.price.amount * USD_TO_INR;
                    } else if (flight.price.currency === 'INR') {
                        priceInINR = flight.price.amount;
                    } else {
                        priceInINR = (flight.price.amount || 0) * USD_TO_INR;
                    }
                } else {
                    priceInINR = (flight.price || 0) * USD_TO_INR;
                }

                // Format the duration in hours and minutes
                let duration = 'N/A';
                if (flight.duration) {
                    const durationMatch = flight.duration.match(/PT(\d+H)?(\d+M)?/);
                    if (durationMatch) {
                        const hours = durationMatch[1] ? parseInt(durationMatch[1]) : 0;
                        const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
                        duration = `${hours}h ${minutes}m`;
                    }
                }

                return `
                <div class="bg-white rounded-lg shadow-lg p-6 mb-4">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center">
                        <div class="flex-1">
                            <div class="flex items-center mb-4">
                                <div class="mr-3 text-gray-700">
                                    ${airlineInfo.icon}
                                </div>
                                <div>
                                    <span class="text-lg font-bold">${airlineInfo.name}</span>
                                    <span class="text-gray-600 ml-2">Flight ${flight.flightNumber || 'N/A'}</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p class="text-sm text-gray-600">Departure</p>
                                    <p class="font-bold">${departureTime}</p>
                                    <p class="text-sm">${flight.origin || 'N/A'}</p>
                                </div>
                                <div class="text-center">
                                    <p class="text-sm text-gray-600">Duration</p>
                                    <p class="font-bold">${duration}</p>
                                    <div class="flex items-center justify-center">
                                        <div class="h-0.5 w-full bg-gray-300"></div>
                                        <div class="mx-2">✈️</div>
                                        <div class="h-0.5 w-full bg-gray-300"></div>
                                    </div>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-600">Arrival</p>
                                    <p class="font-bold">${arrivalTime}</p>
                                    <p class="text-sm">${flight.destination || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                        <div class="mt-4 md:mt-0 md:ml-6 text-right">
                            <p class="text-2xl font-bold text-blue-600">₹${Math.round(priceInINR).toLocaleString('en-IN')}</p>
                            <p class="text-sm text-gray-600 mb-4">per person</p>
                            <button onclick="handleFlightBooking(event, {
                                flightNumber: '${flight.flightNumber || ''}',
                                airline: '${airlineCode || ''}',
                                departure: '${flight.departureTime || ''}',
                                price: ${priceInINR},
                                from: '${flight.from || ''}',
                                to: '${flight.to || ''}',
                                isReturn: ${flight.isReturn || false}
                            })" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition duration-150 ease-in-out transform hover:scale-105">
                                Book Now
                            </button>
                        </div>
                    </div>
                </div>
                `;
            } catch (error) {
                console.error('Error formatting flight:', flight, error);
                return `
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <p class="text-red-500">Error displaying flight information</p>
                </div>
                `;
            }
        }).join('');
    }

    showLoading(show = true) {
        this.loadingIndicator.classList.toggle('hidden', !show);
    }

    showError(message) {
        // Remove any existing error messages
        const existingError = document.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Create and insert new error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4';
        errorDiv.innerHTML = message;
        
        this.form.insertAdjacentElement('beforebegin', errorDiv);

        // Auto-hide after 5 seconds
        setTimeout(() => this.hideError(), 5000);
    }

    hideError() {
        const errorMessage = document.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    handleBooking(flightDetails) {
        this.currentBooking = {
            ...flightDetails,
            passengerDetails: null,
            selectedSeat: null,
            isReturn: !!flightDetails.isReturn
        };

        // Show booking process
        document.getElementById('searchResults').classList.add('hidden');
        document.getElementById('bookingProcess').classList.remove('hidden');
        this.showBookingStep('personalInfo');

        // Update booking summary
        const summaryHTML = `
            <div class="mb-4 p-4 bg-gray-50 rounded-lg">
                <h3 class="font-bold mb-2">${flightDetails.isReturn ? 'Return ' : ''}Flight Details</h3>
                <p><strong>Flight:</strong> ${flightDetails.airline} ${flightDetails.flightNumber}</p>
                <p><strong>${flightDetails.isReturn ? 'Return ' : ''}Date:</strong> ${new Date(flightDetails.departure).toLocaleDateString()}</p>
                <p><strong>Route:</strong> ${flightDetails.from} → ${flightDetails.to}</p>
                <p><strong>Price:</strong> ₹${Math.round(flightDetails.price).toLocaleString('en-IN')}</p>
            </div>
        `;
        document.getElementById('bookingDetails').innerHTML = summaryHTML;
    }

    showBookingStep(step) {
        // Hide all steps
        document.querySelectorAll('.booking-step').forEach(el => el.classList.add('hidden'));
        // Show requested step
        document.getElementById(step).classList.remove('hidden');
    }

    initializeBookingProcess() {
        // Initialize seat map
        this.initializeSeatMap();

        // Personal Information Form
        document.getElementById('personalInfoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.currentBooking.passengerDetails = {
                firstName: document.getElementById('firstName').value,
                lastName: document.getElementById('lastName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value
            };
            this.showBookingStep('seatSelection');
        });

        // Payment Form Validation
        const cardNumber = document.getElementById('cardNumber');
        const expiryDate = document.getElementById('expiryDate');
        const cvv = document.getElementById('cvv');

        // Format card number with spaces
        cardNumber.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (value.length > 16) value = value.slice(0, 16); // Keep only first 16 digits
            
            // Add space after every 4 digits
            const parts = [];
            for (let i = 0; i < value.length; i += 4) {
                parts.push(value.slice(i, i + 4));
            }
            e.target.value = parts.join(' ');
        });

        // Format expiry date (MM/YY)
        expiryDate.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 4) value = value.slice(0, 4);
            if (value.length > 2) {
                value = value.slice(0, 2) + '/' + value.slice(2);
            }
            e.target.value = value;
        });

        // Validate expiry date
        expiryDate.addEventListener('blur', (e) => {
            const value = e.target.value;
            const [month, year] = value.split('/');
            const now = new Date();
            const currentYear = now.getFullYear() % 100;
            const currentMonth = now.getMonth() + 1;

            if (month > 12 || month < 1) {
                alert('Invalid month');
                e.target.value = '';
                return;
            }

            if (year < currentYear || (year == currentYear && month < currentMonth)) {
                alert('Card has expired');
                e.target.value = '';
                return;
            }
        });

        // Format CVV
        cvv.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 4) value = value.slice(0, 4);
            e.target.value = value;
        });

        // Payment Form Submission
        document.getElementById('paymentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Validate all fields are filled
            const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
            const expiryDate = document.getElementById('expiryDate').value;
            const cvv = document.getElementById('cvv').value;
            const cardName = document.getElementById('cardName').value;

            if (cardNumber.length !== 16) {
                alert('Please enter a valid 16-digit card number');
                return;
            }

            if (!expiryDate.match(/^\d{2}\/\d{2}$/)) {
                alert('Please enter a valid expiry date (MM/YY)');
                return;
            }

            if (cvv.length < 3) {
                alert('Please enter a valid CVV');
                return;
            }

            if (cardName.trim().length < 3) {
                alert('Please enter the cardholder name');
                return;
            }

            this.processPayment({
                cardNumber: cardNumber,
                expiryDate: expiryDate,
                cvv: cvv,
                cardName: cardName
            });
        });

        // Initialize seat selection handlers
        document.querySelectorAll('input[name="class"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateSeatMap(e.target.value);
            });
        });
    }

    initializeSeatMap() {
        const seatMap = document.getElementById('seatMap');
        const rows = 10;
        const seatsPerRow = 6;
        
        // Generate seat grid
        for (let row = 0; row < rows; row++) {
            for (let seat = 0; seat < seatsPerRow; seat++) {
                const seatNumber = `${String.fromCharCode(65 + row)}${seat + 1}`;
                const seatButton = document.createElement('button');
                seatButton.className = 'seat p-2 border rounded hover:bg-blue-100';
                seatButton.textContent = seatNumber;
                seatButton.onclick = () => this.selectSeat(seatNumber);
                seatMap.appendChild(seatButton);
            }
        }
    }

    selectSeat(seatNumber) {
        // Remove previous selection
        document.querySelectorAll('.seat.selected').forEach(seat => {
            seat.classList.remove('selected', 'bg-blue-500', 'text-white');
        });

        // Select new seat
        const seatElement = Array.from(document.querySelectorAll('.seat')).find(el => el.textContent === seatNumber);
        if (seatElement) {
            seatElement.classList.add('selected', 'bg-blue-500', 'text-white');
            this.currentBooking.selectedSeat = seatNumber;
        }
    }

    updateSeatMap(classType) {
        const seatMap = document.getElementById('seatMap');
        const seats = seatMap.querySelectorAll('.seat');
        
        if (classType === 'business') {
            // First 2 rows are business class
            seats.forEach((seat, index) => {
                if (index < 12) {
                    seat.classList.add('business');
                    seat.classList.remove('economy');
                } else {
                    seat.classList.add('disabled');
                }
            });
        } else {
            // Economy class
            seats.forEach((seat, index) => {
                if (index >= 12) {
                    seat.classList.remove('disabled');
                    seat.classList.add('economy');
                    seat.classList.remove('business');
                } else {
                    seat.classList.add('disabled');
                }
            });
        }
    }

    async processPayment(paymentDetails) {
        // Simulate payment processing
        setTimeout(() => {
            // Generate booking reference
            const bookingReference = 'BK' + Date.now();
            
            // Create booking data
            const bookingData = {
                reference: bookingReference,
                timestamp: new Date().toISOString(),
                flightDetails: {
                    airline: this.currentBooking.airline,
                    flightNumber: this.currentBooking.flightNumber,
                    from: this.currentBooking.from,
                    to: this.currentBooking.to,
                    departure: this.currentBooking.departure,
                    isReturn: this.currentBooking.isReturn
                },
                passengerDetails: this.currentBooking.passengerDetails,
                seatDetails: {
                    seatNumber: this.currentBooking.selectedSeat,
                    class: document.querySelector('input[name="class"]:checked').value
                },
                paymentDetails: {
                    amount: this.currentBooking.price,
                    currency: 'INR',
                    cardLastFour: paymentDetails.cardNumber.slice(-4),
                    cardType: this.getCardType(paymentDetails.cardNumber)
                },
                status: 'confirmed'
            };

            // Save to Firebase
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    this.saveBookingToFirebase(bookingData);
                } else {
                    // Optional: Show a login popup or go to login page
                    window.location.href = '/app/login.html?redirect=flight';
                }
            });
        }, 2000);
    }

    getCardType(cardNumber) {
        // Basic card type detection
        const firstDigit = cardNumber.charAt(0);
        const firstTwoDigits = parseInt(cardNumber.substr(0, 2));

        if (firstDigit === '4') return 'Visa';
        if (firstTwoDigits >= 51 && firstTwoDigits <= 55) return 'MasterCard';
        if (firstTwoDigits === 34 || firstTwoDigits === 37) return 'American Express';
        return 'Unknown';
    }

    async saveBookingToFirebase(bookingData) {
        try {
            // Check if user is authenticated
            const user = firebase.auth().currentUser;
if (!user) {
    window.location.href = '/app/login/login.html?redirect=flight';
    return;
}

            // Get reference to the bookings collection
            const bookingsRef = firebase.database().ref('bookings');
            
            // Add user information to booking data
            bookingData.userId = user.uid;
            bookingData.userEmail = user.email;
            
            // Create a new booking entry
            await bookingsRef.child(bookingData.reference).set(bookingData);

            // Update user's bookings
            const userBookingsRef = firebase.database().ref(`users/${user.uid}/bookings`);
            await userBookingsRef.child(bookingData.reference).set(true);

            // Update flight availability in main-db
            const flightRef = firebase.database().ref(`flights/${bookingData.flightDetails.flightNumber}`);
            await flightRef.transaction(flight => {
                if (flight) {
                    flight.availableSeats = (flight.availableSeats || 0) - 1;
                }
                return flight;
            });

            return true;
        } catch (error) {
            console.error('Firebase save error:', error);
            throw error;
        }
    }

    showSuccessMessage() {
        this.showBookingStep('confirmation');
        document.getElementById('failureMessage').classList.add('hidden');
        document.getElementById('successMessage').classList.remove('hidden');
        
        // Set booking reference
        document.getElementById('bookingReference').textContent = this.currentBooking.bookingReference;
        
        // Show booking details
        const details = document.getElementById('bookingDetails');
        details.innerHTML = `
            <div class="space-y-2">
                <p><strong>Passenger:</strong> ${this.currentBooking.passengerDetails.firstName} ${this.currentBooking.passengerDetails.lastName}</p>
                <p><strong>Flight:</strong> ${this.currentBooking.airline} ${this.currentBooking.flightNumber}</p>
                <p><strong>From:</strong> ${this.currentBooking.from}</p>
                <p><strong>To:</strong> ${this.currentBooking.to}</p>
                <p><strong>Departure:</strong> ${new Date(this.currentBooking.departure).toLocaleString()}</p>
                <p><strong>Seat:</strong> ${this.currentBooking.selectedSeat}</p>
                <p><strong>Amount Paid:</strong> ₹${Math.round(this.currentBooking.price).toLocaleString('en-IN')}</p>
            </div>
        `;
    }

    showFailureMessage() {
        this.showBookingStep('confirmation');
        document.getElementById('successMessage').classList.add('hidden');
        document.getElementById('failureMessage').classList.remove('hidden');
    }

    initializeCalendars() {
        // Initialize departure calendar
        this.initializeCalendar('departure');
        
        // Initialize return calendar
        this.initializeCalendar('return');

        // Add click listeners to date inputs
        document.getElementById('departureDate').addEventListener('click', () => this.toggleCalendar('departure'));
        document.getElementById('returnDate').addEventListener('click', () => this.toggleCalendar('return'));

        // Close calendars when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.calendar-wrapper')) {
                document.querySelectorAll('.calendar').forEach(cal => cal.classList.remove('show'));
            }
        });
    }

    initializeCalendar(type) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        
        const today = new Date();
        const currentMonth = this.currentDate[type].getMonth();
        const currentYear = this.currentDate[type].getFullYear();

        // Update month display
        document.getElementById(`${type}DateMonth`).textContent = `${monthNames[currentMonth]} ${currentYear}`;

        // Generate calendar grid
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        let html = '<div class="calendar-grid">';
        
        // Add day headers
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
            html += `<div class="font-semibold text-gray-600">${day}</div>`;
        });

        // Add empty cells for days before start of month
        for (let i = 0; i < firstDay; i++) {
            html += '<div></div>';
        }

        // Add days of month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentYear, currentMonth, day);
            const isDisabled = date < today;
            const isSelected = this.formatDate(date) === document.getElementById(`${type}Date`).value;
            
            html += `
                <div class="calendar-day${isDisabled ? ' disabled' : ''}${isSelected ? ' selected' : ''}"
                     ${!isDisabled ? `onclick="flightSearchInstance.selectDate('${type}', ${day})"` : ''}>
                    ${day}
                </div>`;
        }

        html += '</div>';
        document.getElementById(`${type}DateGrid`).innerHTML = html;
    }

    toggleCalendar(type) {
        const calendar = document.getElementById(`${type}DateCalendar`);
        const otherType = type === 'departure' ? 'return' : 'departure';
        document.getElementById(`${otherType}DateCalendar`).classList.remove('show');
        calendar.classList.toggle('show');
    }

    selectDate(type, day) {
        const date = new Date(
            this.currentDate[type].getFullYear(),
            this.currentDate[type].getMonth(),
            day
        );

        // Update input field
        document.getElementById(`${type}Date`).value = this.formatDate(date);
        
        // Hide calendar
        document.getElementById(`${type}DateCalendar`).classList.remove('show');
        
        // Validate dates
        this.validateDate();
        
        // Update itinerary if both dates are selected
        this.updateItinerary();
    }

    prevMonth(type) {
        this.currentDate[type].setMonth(this.currentDate[type].getMonth() - 1);
        this.initializeCalendar(type);
    }

    nextMonth(type) {
        this.currentDate[type].setMonth(this.currentDate[type].getMonth() + 1);
        this.initializeCalendar(type);
    }

    formatDate(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${date.getFullYear()}-${month}-${day}`;
    }

    updateItinerary() {
        const departureDate = document.getElementById('departureDate').value;
        const returnDate = document.getElementById('returnDate').value;
        const from = this.selectedOrigin?.city || '';
        const to = this.selectedDestination?.city || '';

        if (departureDate && from && to) {
            document.getElementById('itinerary').classList.remove('hidden');
            
            // Update outbound details
            document.getElementById('outboundDetails').innerHTML = `
                <p class="mb-1"><i class="fas fa-plane-departure mr-2"></i> From ${from} to ${to}</p>
                <p class="mb-1"><i class="far fa-calendar mr-2"></i> ${new Date(departureDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })}</p>
            `;

            // Update return details if return date is selected
            const returnFlightItem = document.getElementById('returnFlightItem');
            if (returnDate) {
                returnFlightItem.classList.remove('hidden');
                document.getElementById('returnDetails').innerHTML = `
                    <p class="mb-1"><i class="fas fa-plane-arrival mr-2"></i> From ${to} to ${from}</p>
                    <p class="mb-1"><i class="far fa-calendar mr-2"></i> ${new Date(returnDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}</p>
                `;
            } else {
                returnFlightItem.classList.add('hidden');
            }
        }
    }
}

// Initialize the flight search when the page loads
let flightSearchInstance;

document.addEventListener('DOMContentLoaded', () => {
    flightSearchInstance = new FlightSearch();
});

// Global function to handle flight booking
function handleFlightBooking(event, flightDetails) {
    event.preventDefault();
    if (flightSearchInstance) {
        flightSearchInstance.handleBooking(flightDetails);
    } else {
        console.error('Flight search not initialized');
    }
}

// Make showBookingStep globally accessible for the HTML onclick handlers
function showBookingStep(step) {
    if (flightSearchInstance) {
        flightSearchInstance.showBookingStep(step);
    } else {
        console.error('Flight search not initialized');
    }
}

// Global calendar navigation functions
function prevMonth(type) {
    if (flightSearchInstance) {
        flightSearchInstance.prevMonth(type);
    }
}

function nextMonth(type) {
    if (flightSearchInstance) {
        flightSearchInstance.nextMonth(type);
    }
}