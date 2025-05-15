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

        // Initialize booking data
        this.currentBooking = {
            departureDate: null,
            returnDate: null,
            selectedOrigin: null,
            selectedDestination: null,
            passengers: 1,
            class: 'economy'
        };

        // Initialize calendars
        this.currentMonth = new Date();
        this.returnMonth = new Date();

        // Make instance available globally for event handlers
        window.flightSearchInstance = this;

        // Bind calendar navigation methods to the instance
        this.nextMonth = this.nextMonth.bind(this);
        this.prevMonth = this.prevMonth.bind(this);

        // Make calendar navigation methods available globally
        window.nextMonth = this.nextMonth;
        window.prevMonth = this.prevMonth;

        this.setupEventListeners();
        this.initializeAirportAutocomplete();
        this.initializeCalendars();
        this.initializeBookingProcess();
        this.initializePaymentForm();
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
        // Store flight details in current booking
        this.currentBooking = {
            ...this.currentBooking,
            ...flightDetails,
            selectedSeats: [], // Reset selected seats
            passengerDetails: [] // Reset passenger details
        };

        // Hide search results
        document.getElementById('searchResults').classList.add('hidden');
        
        // Show booking process
        const bookingProcess = document.getElementById('bookingProcess');
        bookingProcess.classList.remove('hidden');

        // Show personal information step
        this.showBookingStep('personalInfo');
    }

    showBookingStep(step) {
        console.log('Showing step:', step); // Debug log
        
        // Hide all steps
        document.querySelectorAll('.booking-step').forEach(el => {
            el.classList.add('hidden');
            console.log('Hiding:', el.id); // Debug log
        });
        
        // Show requested step
        const stepElement = document.getElementById(`${step}`);
        if (stepElement) {
            console.log('Found step element:', stepElement.id); // Debug log
            stepElement.classList.remove('hidden');
            
            // If showing seat selection, update the display
            if (step === 'seatSelection') {
                this.updateSeatSelectionDisplay();
            }
        } else {
            console.error('Step element not found:', step); // Debug log
        }
    }

    initializeBookingProcess() {
        // Initialize seat map
        this.initializeSeatMap();

        // Personal Information Form
        const personalInfoForm = document.getElementById('personalInfoForm');
        if (personalInfoForm) {
            personalInfoForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const numPassengers = parseInt(document.getElementById('adults').value) || 1;
                const passengerDetails = [];

                // Collect information for each passenger
                for (let i = 1; i <= numPassengers; i++) {
                    const passengerInfo = {
                        firstName: document.getElementById(`firstName${i}`).value,
                        lastName: document.getElementById(`lastName${i}`).value,
                        email: i === 1 ? document.getElementById('email').value : '', // Primary email for first passenger
                        phone: i === 1 ? document.getElementById('phone').value : '', // Primary phone for first passenger
                        seat: this.currentBooking.selectedSeats[i-1] || '' // Assign selected seat to each passenger
                    };
                    passengerDetails.push(passengerInfo);
                }

                this.currentBooking.passengerDetails = passengerDetails;
                
                // Show seat selection step
                this.showBookingStep('seatSelection');
            });
        }

        // Add event listener for passenger count changes
        const adultsInput = document.getElementById('adults');
        if (adultsInput) {
            adultsInput.addEventListener('change', (e) => {
                const numPassengers = parseInt(e.target.value) || 1;
                this.updatePassengerForms(numPassengers);
                
                // Clear existing seat selections if number of passengers changes
                this.currentBooking.selectedSeats = [];
                document.querySelectorAll('.seat.selected').forEach(seat => {
                    seat.classList.remove('selected', 'bg-blue-500', 'text-white');
                });
            });
        }
    }

    updatePassengerForms(numPassengers) {
        const passengerFormsContainer = document.getElementById('passengerForms');
        passengerFormsContainer.innerHTML = '';

        for (let i = 1; i <= numPassengers; i++) {
            const passengerForm = document.createElement('div');
            passengerForm.innerHTML = `
                <h3 class="font-bold mb-2">Passenger ${i}</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="firstName${i}" class="block text-sm font-medium text-gray-700">First Name</label>
                        <input type="text" id="firstName${i}" name="firstName${i}" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md">
                    </div>
                    <div>
                        <label for="lastName${i}" class="block text-sm font-medium text-gray-700">Last Name</label>
                        <input type="text" id="lastName${i}" name="lastName${i}" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md">
                    </div>
                </div>
            `;
            passengerFormsContainer.appendChild(passengerForm);
        }
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

    updateSeatSelectionDisplay() {
        const selectedSeatsDisplay = document.getElementById('selectedSeatsDisplay');
        const requiredSeats = document.getElementById('requiredSeats');
        const continueButton = document.getElementById('continueToPayment');
        const numPassengers = parseInt(document.getElementById('adults').value) || 1;

        // Update the required seats text
        requiredSeats.textContent = numPassengers;

        // Update selected seats display
        selectedSeatsDisplay.textContent = this.currentBooking.selectedSeats.join(', ') || 'None';

        // Enable/disable continue button based on seat selection
        if (this.currentBooking.selectedSeats.length === numPassengers) {
            continueButton.removeAttribute('disabled');
            continueButton.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            continueButton.setAttribute('disabled', 'true');
            continueButton.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    selectSeat(seatNumber) {
        const maxSeats = parseInt(document.getElementById('adults').value) || 1;
        
        // If seat is already selected, unselect it
        const seatIndex = this.currentBooking.selectedSeats.indexOf(seatNumber);
        if (seatIndex !== -1) {
            this.currentBooking.selectedSeats.splice(seatIndex, 1);
            const seatElement = Array.from(document.querySelectorAll('.seat')).find(el => el.textContent === seatNumber);
            if (seatElement) {
                seatElement.classList.remove('selected', 'bg-blue-500', 'text-white');
            }
            this.updateSeatSelectionDisplay();
            return;
        }

        // Check if maximum seats are already selected
        if (this.currentBooking.selectedSeats.length >= maxSeats) {
            alert(`You can only select ${maxSeats} seat(s) for ${maxSeats} passenger(s)`);
            return;
        }

        // Add new seat selection
        const seatElement = Array.from(document.querySelectorAll('.seat')).find(el => el.textContent === seatNumber);
        if (seatElement) {
            seatElement.classList.add('selected', 'bg-blue-500', 'text-white');
            this.currentBooking.selectedSeats.push(seatNumber);
            this.currentBooking.class = document.querySelector('input[name="class"]:checked')?.value || 'economy';
            this.updateSeatSelectionDisplay();
        }
    }

    initializePaymentForm() {
        const paymentForm = document.getElementById('paymentForm');
        const cardNumber = document.getElementById('cardNumber');
        const expiryDate = document.getElementById('expiryDate');
        const cvv = document.getElementById('cvv');

        // Format card number as user types
        cardNumber.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 16) value = value.slice(0, 16);
            
            // Add spaces after every 4 digits
            const parts = [];
            for (let i = 0; i < value.length; i += 4) {
                parts.push(value.slice(i, i + 4));
            }
            e.target.value = parts.join(' ');
        });

        // Format expiry date as user types
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
            if (!value) return;

            const [month, year] = value.split('/');
            const currentYear = new Date().getFullYear() % 100;
            const currentMonth = new Date().getMonth() + 1;

            if (parseInt(month) > 12 || parseInt(month) < 1) {
                alert('Invalid month');
                e.target.value = '';
                return;
            }

            if (parseInt(year) < currentYear || (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
                alert('Card has expired');
                e.target.value = '';
                return;
            }
        });

        // Format CVV
        cvv.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 3) value = value.slice(0, 3);
            e.target.value = value;
        });

        // Handle form submission
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Basic validation
            const cardNumberValue = cardNumber.value.replace(/\s/g, '');
            if (cardNumberValue.length !== 16) {
                alert('Please enter a valid 16-digit card number');
                return;
            }

            if (!expiryDate.value.match(/^\d{2}\/\d{2}$/)) {
                alert('Please enter a valid expiry date (MM/YY)');
                return;
            }

            if (cvv.value.length !== 3) {
                alert('Please enter a valid 3-digit CVV');
                return;
            }

            // Process payment
            try {
                await this.processPayment({
                    cardNumber: cardNumberValue,
                    expiryDate: expiryDate.value,
                    cvv: cvv.value,
                    cardName: document.getElementById('cardName').value
                });
            } catch (error) {
                console.error('Payment error:', error);
                alert('Payment failed. Please try again.');
            }
        });
    }

    async processPayment(paymentDetails) {
        // Show loading state
        this.showLoading(true);

        try {
            // Generate booking reference
            const bookingRef = 'BK' + Date.now();

            // Create booking data
            const bookingData = {
                reference: bookingRef,
                flightDetails: {
                    airline: this.currentBooking.airline,
                    flightNumber: this.currentBooking.flightNumber,
                    from: this.currentBooking.from,
                    to: this.currentBooking.to,
                    departure: this.currentBooking.departure,
                    price: this.currentBooking.price,
                    class: this.currentBooking.class
                },
                passengerDetails: this.currentBooking.passengerDetails,
                selectedSeats: this.currentBooking.selectedSeats,
                paymentDetails: {
                    last4: paymentDetails.cardNumber.slice(-4),
                    cardName: paymentDetails.cardName,
                    amount: this.currentBooking.price
                },
                status: 'confirmed',
                timestamp: new Date().toISOString()
            };

            // Try to save to Firebase first
            try {
                await this.saveToFirebase(bookingData);
            } catch (firebaseError) {
                console.error('Firebase save failed:', firebaseError);
                // If Firebase fails, save to localStorage as backup
                this.saveToLocalStorage(bookingData);
            }

            // Store current booking for confirmation
            this.currentBooking.reference = bookingRef;
            localStorage.setItem('currentBooking', JSON.stringify(bookingData));
            
            // Show confirmation
            this.showBookingStep('confirmation');
            this.showSuccessMessage();
        } catch (error) {
            console.error('Payment processing error:', error);
            this.showFailureMessage();
        } finally {
            this.showLoading(false);
        }
    }

    async saveToFirebase(bookingData) {
        try {
            // Initialize Firebase if not already initialized
            if (!firebase.apps.length) {
                firebase.initializeApp({
                    apiKey: "AIzaSyBOE7GXvXMrXQXVOWEbNJVXQwrHgNM5Vw4",
                    authDomain: "globetrail-web.firebaseapp.com",
                    databaseURL: "https://globetrail-web-default-rtdb.firebaseio.com",
                    projectId: "globetrail-web",
                    storageBucket: "globetrail-web.appspot.com",
                    messagingSenderId: "1234567890",
                    appId: "1:1234567890:web:abcdef123456"
                });
            }

            // Get current user if logged in
            const user = firebase.auth().currentUser;
            if (user) {
                bookingData.userId = user.uid;
                bookingData.userEmail = user.email;
            }

            // Save to Realtime Database
            const bookingsRef = firebase.database().ref('bookings');
            const newBookingRef = bookingsRef.push();
            
            await newBookingRef.set({
                ...bookingData,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

            // If user is logged in, add to their bookings
            if (user) {
                const userBookingsRef = firebase.database().ref(`users/${user.uid}/bookings`);
                await userBookingsRef.child(newBookingRef.key).set({
                    bookingReference: bookingData.reference,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                });
            }

            console.log('Booking saved to Firebase successfully');
            return true;
        } catch (error) {
            console.error('Firebase save error:', error);
            throw error;
        }
    }

    saveToLocalStorage(bookingData) {
        try {
            // Get existing bookings
            const existingBookings = JSON.parse(localStorage.getItem('bookings') || '[]');
            
            // Add new booking
            existingBookings.push(bookingData);
            
            // Save back to localStorage
            localStorage.setItem('bookings', JSON.stringify(existingBookings));
            
            console.log('Booking saved to localStorage successfully');
            return true;
        } catch (error) {
            console.error('LocalStorage save error:', error);
            throw error;
        }
    }

    async syncLocalBookingsToFirebase() {
        try {
            // Get bookings from localStorage
            const localBookings = JSON.parse(localStorage.getItem('bookings') || '[]');
            if (!localBookings.length) return;

            // Get current user
            const user = firebase.auth().currentUser;
            if (!user) return;

            // Get database reference
            const bookingsRef = firebase.database().ref('bookings');
            const userBookingsRef = firebase.database().ref(`users/${user.uid}/bookings`);

            // Create updates object for atomic operation
            const updates = {};

            // Add each booking
            for (const booking of localBookings) {
                const newBookingKey = bookingsRef.push().key;
                updates[`/bookings/${newBookingKey}`] = {
                    ...booking,
                    userId: user.uid,
                    userEmail: user.email,
                    syncedFromLocal: true,
                    syncedAt: firebase.database.ServerValue.TIMESTAMP
                };
                updates[`/users/${user.uid}/bookings/${newBookingKey}`] = {
                    bookingReference: booking.reference,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                };
            }

            // Commit all updates atomically
            await firebase.database().ref().update(updates);

            // Clear local bookings after successful sync
            localStorage.removeItem('bookings');
            console.log('Local bookings synced to Firebase successfully');
        } catch (error) {
            console.error('Error syncing local bookings:', error);
        }
    }

    showSuccessMessage() {
        // Hide failure message if shown
        document.getElementById('failureMessage').classList.add('hidden');
        document.getElementById('successMessage').classList.remove('hidden');

        // Set booking reference
        const bookingRef = 'BK' + Date.now();
        document.getElementById('bookingReference').textContent = bookingRef;

        // Show booking details
        const details = document.getElementById('bookingDetails');
        details.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h4 class="font-semibold text-gray-600">Flight Details</h4>
                        <p class="text-sm"><span class="font-medium">Airline:</span> ${this.currentBooking.airline}</p>
                        <p class="text-sm"><span class="font-medium">Flight:</span> ${this.currentBooking.flightNumber}</p>
                        <p class="text-sm"><span class="font-medium">Class:</span> ${this.currentBooking.class}</p>
                    </div>
                    <div>
                        <h4 class="font-semibold text-gray-600">Journey Details</h4>
                        <p class="text-sm"><span class="font-medium">From:</span> ${this.currentBooking.from}</p>
                        <p class="text-sm"><span class="font-medium">To:</span> ${this.currentBooking.to}</p>
                        <p class="text-sm"><span class="font-medium">Date:</span> ${new Date(this.currentBooking.departure).toLocaleDateString()}</p>
                    </div>
                </div>

                <div class="mt-4">
                    <h4 class="font-semibold text-gray-600">Passenger Details</h4>
                    ${this.currentBooking.passengerDetails.map((passenger, index) => `
                        <div class="bg-gray-50 p-3 rounded mt-2">
                            <p class="text-sm"><span class="font-medium">Passenger ${index + 1}:</span> ${passenger.firstName} ${passenger.lastName}</p>
                            <p class="text-sm"><span class="font-medium">Seat:</span> ${this.currentBooking.selectedSeats[index]}</p>
                            ${index === 0 ? `
                                <p class="text-sm"><span class="font-medium">Email:</span> ${passenger.email}</p>
                                <p class="text-sm"><span class="font-medium">Phone:</span> ${passenger.phone}</p>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>

                <div class="mt-4 pt-4 border-t">
                    <h4 class="font-semibold text-gray-600">Payment Details</h4>
                    <p class="text-sm"><span class="font-medium">Amount Paid:</span> ₹${Math.round(this.currentBooking.price).toLocaleString('en-IN')}</p>
                    <p class="text-sm"><span class="font-medium">Booking Reference:</span> ${bookingRef}</p>
                </div>
            </div>
        `;
    }

    showFailureMessage() {
        // Hide success message if shown
        document.getElementById('successMessage').classList.add('hidden');
        document.getElementById('failureMessage').classList.remove('hidden');
    }

    initializeCalendars() {
        // Initialize departure calendar
        this.updateCalendar('departure', this.currentMonth);

        // Initialize return calendar
        this.updateCalendar('return', this.returnMonth);

        // Add click listeners to date inputs
        document.getElementById('departureDate')?.addEventListener('click', () => this.toggleCalendar('departure'));
        document.getElementById('returnDate')?.addEventListener('click', () => this.toggleCalendar('return'));

        // Close calendars when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.calendar') && !e.target.closest('#departureDate') && !e.target.closest('#returnDate')) {
                document.querySelectorAll('.calendar').forEach(cal => cal.classList.remove('show'));
            }
        });
    }

    nextMonth(type) {
        if (type === 'departure') {
            this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
            this.updateCalendar('departure', this.currentMonth);
        } else {
            this.returnMonth.setMonth(this.returnMonth.getMonth() + 1);
            this.updateCalendar('return', this.returnMonth);
        }
    }

    prevMonth(type) {
        if (type === 'departure') {
            this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
            this.updateCalendar('departure', this.currentMonth);
        } else {
            this.returnMonth.setMonth(this.returnMonth.getMonth() - 1);
            this.updateCalendar('return', this.returnMonth);
        }
    }

    updateCalendar(type, date) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const currentMonth = date.getMonth();
        const currentYear = date.getFullYear();

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
            const isDisabled = date < new Date();
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
            this.currentMonth.getFullYear(),
            this.currentMonth.getMonth(),
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
    
    // Make functions globally available
    window.handleFlightBooking = (event, flightDetails) => {
        event.preventDefault();
        if (flightSearchInstance) {
            flightSearchInstance.handleBooking(flightDetails);
        } else {
            console.error('Flight search not initialized');
        }
    };

    window.showBookingStep = (step) => {
        if (flightSearchInstance) {
            flightSearchInstance.showBookingStep(step);
        } else {
            console.error('Flight search not initialized');
        }
    };
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
function nextMonth(type) {
    if (flightSearchInstance) {
        flightSearchInstance.nextMonth(type);
    }
}

function prevMonth(type) {
    if (flightSearchInstance) {
        flightSearchInstance.prevMonth(type);
    }
}