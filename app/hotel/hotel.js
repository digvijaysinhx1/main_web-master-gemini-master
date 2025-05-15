
document.addEventListener('DOMContentLoaded', async function () {

    let map;
    let markers = [];
    let autocomplete;
    let bounds;

    // Initialize date pickers
    const checkInPicker = flatpickr("#checkIn", {
        minDate: "today",
        dateFormat: "Y-m-d",
        onChange: function (selectedDates) {
            checkOutPicker.set('minDate', selectedDates[0]);
        }
    });

    const checkOutPicker = flatpickr("#checkOut", {
        minDate: "today",
        dateFormat: "Y-m-d"
    });

    // Initialize Google Maps and Places
    async function initializeGoogleMaps() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            if (!config.googleMapsApiKey) {
                throw new Error('Google Maps API key not found');
            }

            await loadGoogleMapsScript(config.googleMapsApiKey);
            initMap();
            initializeGooglePlaces();
        } catch (error) {
            console.error('Error initializing Google Maps:', error);
            const searchForm = document.getElementById('hotelSearchForm');
            searchForm.innerHTML = `<div class="error-message">Error loading Google Maps. Please try again later.</div>`;
        }
    }

    function loadGoogleMapsScript(apiKey) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function initMap() {
        bounds = new google.maps.LatLngBounds();
        map = new google.maps.Map(document.getElementById('map'), {
            zoom: 12,
            center: { lat: 20.5937, lng: 78.9629 }, // Center of India
            mapTypeControl: false,
            streetViewControl: false,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
    }

    function initializeGooglePlaces() {
        const destinationInput = document.getElementById('destination');
        autocomplete = new google.maps.places.Autocomplete(destinationInput, {
            types: ['(cities)'],
            fields: ['place_id', 'geometry', 'name']
        });

        autocomplete.addListener('place_changed', function () {
            const place = autocomplete.getPlace();
            if (!place.geometry) {
                console.error('No details available for place');
                return;
            }

            destinationInput.dataset.placeId = place.place_id;
            destinationInput.dataset.lat = place.geometry.location.lat();
            destinationInput.dataset.lng = place.geometry.location.lng();

            // Center map on selected location
            map.setCenter(place.geometry.location);
            map.setZoom(13);
        });
    }

    // Initialize Google Maps
    initializeGoogleMaps();

    // Handle form submission
    const searchForm = document.getElementById('hotelSearchForm');
    searchForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const loadingIndicator = document.getElementById('loadingIndicator');
        const resultsContainer = document.getElementById('searchResults');

        // Show loading
    loadingIndicator.style.display = 'block';
    resultsContainer.innerHTML = '';

        const destination = document.getElementById('destination');
        if (!destination.dataset.lat || !destination.dataset.lng) {
            alert('Please select a destination from the dropdown list');
            loadingIndicator.style.display = 'none'; // Hide on early return
            return;
        }

        const checkIn = document.getElementById('checkIn').value;
        const checkOut = document.getElementById('checkOut').value;

        if (!checkIn || !checkOut) {
            alert('select the dates');
            return;
        }

        const rooms = document.getElementById('rooms');
        const adults = document.getElementById('adults');
        const children = document.getElementById('children');
        const priceRange = document.querySelector('input[name="priceRange"]:checked');
        const ratings = Array.from(document.querySelectorAll('input[name="rating"]:checked')).map(input => input.value);

        const location = {
            lat: parseFloat(destination.dataset.lat),
            lng: parseFloat(destination.dataset.lng)
        };

        try {
            const response = await fetch('/api/hotels/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    destination: destination.value,
                    location,
                    checkIn: checkIn.value,
                    checkOut: checkOut.value,
                    rooms: rooms.value,
                    adults: adults.value,
                    children: children.value,
                    priceRange: priceRange.value,
                    ratings
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to search hotels');
            }

            displayResults(data.hotels);

        } catch (error) {
            console.error('Error searching hotels:', error);
            const resultsContainer = document.getElementById('searchResults');
            resultsContainer.innerHTML = `<div class="error-message">
                <p>Error searching hotels: ${error.message}</p>
                <p>Please try again or contact support if the problem persists.</p>
            </div>`;
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

    function displayResults(hotels) {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = '';

        // Clear existing markers
        markers.forEach(marker => marker.setMap(null));
        markers = [];
        bounds.extend(new google.maps.LatLng(parseFloat(destination.dataset.lat), parseFloat(destination.dataset.lng)));

        if (!hotels || hotels.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No hotels found matching your criteria.</div>';
            return;
        }

        hotels.forEach((hotel, index) => {
            const card = document.createElement('div');
            card.className = 'hotel-card';

            const defaultImage = 'data:image/svg+xml,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
                    <rect width="400" height="200" fill="#f0f0f0"/>
                    <text x="50%" y="50%" font-family="Arial" font-size="16" fill="#666" text-anchor="middle">
                        No Image Available
                    </text>
                </svg>
            `);

            const imageUrl = hotel.image || defaultImage;

            // Generate random amenities based on hotel rating and price
            const amenities = [];
            if (hotel.rating >= 4) amenities.push('🏊‍♂️ Pool');
            if (hotel.rating >= 3) amenities.push('🅿️ Parking');
            if (hotel.price > 5000) amenities.push('🍳 Restaurant');
            if (hotel.price > 8000) amenities.push('💆‍♂️ Spa');

            card.innerHTML = `
                <div class="hotel-image-container">
                    <img src="${imageUrl}" alt="${hotel.name}" class="hotel-image" 
                         onerror="this.onerror=null; this.src='${defaultImage}';">
                </div>
                <div class="hotel-info">
                    <h3 class="hotel-name">${hotel.name}</h3>
                    <p class="hotel-address">${hotel.address}</p>
                    <div class="hotel-rating">
                        <div class="stars">${'★'.repeat(Math.floor(hotel.rating))}${'☆'.repeat(5 - Math.floor(hotel.rating))}</div>
                        <span class="rating-number">${hotel.rating.toFixed(1)}</span>
                    </div>
                    <div class="hotel-amenities">
                        ${amenities.map(amenity => `<span class="amenity">${amenity}</span>`).join('')}
                    </div>
                    <div class="hotel-contact">
                        ${hotel.phone ? `<a href="tel:${hotel.phone}" class="hotel-phone">📞 ${hotel.phone}</a>` : ''}
                        ${hotel.website ? `<a href="${hotel.website}" target="_blank" class="hotel-website">🌐 Website</a>` : ''}
                    </div>
                    <button class="book-btn" onclick="bookHotel('${hotel.id}', '${encodeURIComponent(hotel.name)}')">
                        Book Now
                    </button>
                </div>
            `;

            // Add hover effect to show marker info window
            card.addEventListener('mouseenter', () => {
                markers[index].setAnimation(google.maps.Animation.BOUNCE);
            });

            card.addEventListener('mouseleave', () => {
                markers[index].setAnimation(null);
            });

            resultsContainer.appendChild(card);

            // Add marker to map
            const position = new google.maps.LatLng(hotel.location.lat, hotel.location.lng);
            bounds.extend(position);

            const marker = new google.maps.Marker({
                position,
                map,
                title: hotel.name,
                animation: google.maps.Animation.DROP,

            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div class="map-info-window">
                        <h3>${hotel.name}</h3>
                        <p>${hotel.address}</p>
                        <p>Rating: ${hotel.rating} ★</p>
                        <p>₹${hotel.price.toLocaleString('en-IN')} per night</p>
                    </div>
                `
            });

            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });

            markers.push(marker);
        });

        // Fit map to show all markers
        map.fitBounds(bounds);
        if (hotels.length === 1) {
            map.setZoom(15);
        }
    }

    // Add click handlers for popular destinations
    document.querySelectorAll('.destination-card').forEach(card => {
        card.addEventListener('click', () => {
            const city = card.dataset.city;
            const lat = card.dataset.lat;
            const lng = card.dataset.lng;

            // Set the destination input
            const destinationInput = document.getElementById('destination');
            destinationInput.value = city;
            destinationInput.dataset.lat = lat;
            destinationInput.dataset.lng = lng;

            // Scroll to the search form
            document.getElementById('hotelSearchForm').scrollIntoView({ behavior: 'smooth' });

            // Optional: Automatically trigger the search
            searchForm.dispatchEvent(new Event('submit'));
        });
    });

    let currentBooking = null;
    let currentStep = 1;

    window.bookHotel = async function (hotelId, hotelName) {
        const checkInElem = document.getElementById('checkIn');
        const checkOutElem = document.getElementById('checkOut');

        console.log("checkInElem:", checkInElem);
        console.log("checkOutElem:", checkOutElem);
        console.log("checkInPicker:", checkInPicker);
        console.log("checkOutPicker:", checkOutPicker);
        console.log("checkInPicker.selectedDates:", checkInPicker.selectedDates);
        console.log("checkOutPicker.selectedDates:", checkOutPicker.selectedDates);

        const rooms = document.getElementById('rooms').value;
        const adults = document.getElementById('adults').value;
        const children = document.getElementById('children').value;


        if (checkInPicker.selectedDates && checkInPicker.selectedDates.length > 0) {
            console.log("Type of checkInPicker.selectedDates[0]:", typeof checkInPicker.selectedDates[0]);
            console.log("checkInPicker.selectedDates[0]:", checkInPicker.selectedDates[0]);
        } else {
            console.log("checkInPicker.selectedDates is empty or undefined");
        }
    
        if (checkOutPicker.selectedDates && checkOutPicker.selectedDates.length > 0) {
            console.log("Type of checkOutPicker.selectedDates[0]:", typeof checkOutPicker.selectedDates[0]);
            console.log("checkOutPicker.selectedDates[0]:", checkOutPicker.selectedDates[0]);
        } else {
            console.log("checkOutPicker.selectedDates is empty or undefined");
        }

        const checkIn = checkInPicker.selectedDates[0];
        const checkOut = checkOutPicker.selectedDates[0];

        // Format dates to ISO 8601 (YYYY-MM-DD)
        const formattedCheckIn = new Date(checkIn).toISOString().split('T')[0];
        const formattedCheckOut = new Date(checkOut).toISOString().split('T')[0];

        // Store booking details
        currentBooking = {
            hotelId,
            hotelName: decodeURIComponent(hotelName),
            checkIn: formattedCheckIn,
            checkOut: formattedCheckOut,
            rooms,
            adults,
            children
        };

        // Show room options
        displayRoomOptions();

        // Show modal
        const modal = document.getElementById('bookingModal');
        modal.style.display = 'block';
    };

    window.nextStep = function (step) {
        document.getElementById(`step${currentStep}`).style.display = 'none';
        document.getElementById(`step${step}`).style.display = 'block';
        currentStep = step;

        if (step === 3) {
            const guestRooms = document.getElementById('guestRooms').value;
    currentBooking.rooms = parseInt(guestRooms) || 1;
            updateBookingSummary();
        }
    };

    window.prevStep = function (step) {
        document.getElementById(`step${currentStep}`).style.display = 'none';
        document.getElementById(`step${step}`).style.display = 'block';
        currentStep = step;
    };

    window.selectRoom = function (roomType, price) {
        currentBooking.roomType = roomType;
        currentBooking.pricePerNight = price;
        window.nextStep(2);
    };

    window.confirmBooking = function () {
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        const cardNumber = document.getElementById('cardNumber').value;
        const expiryDate = document.getElementById('expiryDate').value;
        const cvv = document.getElementById('cvv').value;

        // Store booking details
        currentBooking.paymentMethod = paymentMethod;
        currentBooking.cardNumber = cardNumber;
        currentBooking.expiryDate = expiryDate;
        currentBooking.cvv = cvv;

        // Show confirmation modal
        const modal = document.getElementById('confirmationModal');
        modal.style.display = 'block';
    };

    window.closeModal = function () {
        const modal = document.getElementById('confirmationModal');
        modal.style.display = 'none';
    };

    function displayRoomOptions() {
        const roomOptionsContainer = document.getElementById('roomOptions');
        const roomTypes = [
            {
                type: 'Deluxe Room',
                price: Math.floor(Math.random() * (5001 - 3000 + 1)) + 3000,
                amenities: ['King Size Bed', 'City View', 'Free WiFi', 'Breakfast Included']
            },
            {
                type: 'Premium Room',
                price: Math.floor(Math.random() * (7501 - 5000 + 1)) + 5000,
                amenities: ['Twin Beds', 'Pool View', 'Free WiFi', 'Breakfast Included', 'Mini Bar']
            },
            {
                type: 'Suite',
                price: Math.floor(Math.random() * (12001 - 10000 + 1)) + 10000,
                amenities: ['King Size Bed', 'Ocean View', 'Free WiFi', 'Breakfast Included', 'Mini Bar', 'Living Room']
            }
        ];

        roomOptionsContainer.innerHTML = roomTypes.map(room => `
            <div class="room-option">
                <h4>${room.type}</h4>
                <p class="price">₹${room.price.toLocaleString('en-IN')} per night</p>
                <ul class="amenities">
                    ${room.amenities.map(amenity => `<li>${amenity}</li>`).join('')}
                </ul>
                <button onclick="window.selectRoom('${room.type}', ${room.price})">Select</button>
            </div>
        `).join('');
    }

    function updateBookingSummary() {
        const checkInDate = new Date(currentBooking.checkIn);
        const checkOutDate = new Date(currentBooking.checkOut);
        const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
        const totalPrice = currentBooking.pricePerNight * nights * currentBooking.rooms;

        const summary = document.getElementById('bookingSummary');
        summary.innerHTML = `
            <h4>Booking Summary</h4>
            <div class="summary-details">
                <p><strong>Hotel:</strong> ${currentBooking.hotelName}</p>
                <p><strong>Room Type:</strong> ${currentBooking.roomType}</p>
                <p><strong>Check-in:</strong> ${formatDate(checkInDate)}</p>
                <p><strong>Check-out:</strong> ${formatDate(checkOutDate)}</p>
                <p><strong>Number of Nights:</strong> ${nights}</p>
                <p><strong>Rooms:</strong> ${currentBooking.rooms}</p>
                <p><strong>Guests:</strong> ${currentBooking.adults} Adults, ${currentBooking.children} Children</p>
                <div class="price-breakdown">
                    <p><strong>Price per Night:</strong> ₹${currentBooking.pricePerNight.toLocaleString('en-IN')}</p>
                    <p><strong>Total Price:</strong> ₹${totalPrice.toLocaleString('en-IN')}</p>
                </div>
            </div>
        `;
    }

    function formatDate(date) {
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    // Close modal when clicking on X or outside the modal
    document.querySelector('.close').onclick = function () {
        document.getElementById('bookingModal').style.display = 'none';
    };

    window.onclick = function (event) {
        const modal = document.getElementById('bookingModal');
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };

    // Handle payment method selection
    document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
        radio.addEventListener('change', function () {
            document.querySelectorAll('.payment-section').forEach(section => {
                section.style.display = 'none';
            });
            document.getElementById(this.value + 'Payment').style.display = 'block';
        });
    });

    // Handle payment form submission 
    document.getElementById('paymentForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        // Validate all fields are filled
        const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
        const expiryDate = document.getElementById('expiryDate').value;
        const cvv = document.getElementById('cvv').value;
        const cardName = document.getElementById('cardName').value;
        const guestNameInput = document.getElementById('guestName');
        const guestEmailInput = document.getElementById('guestEmail');
        const guestPhoneInput = document.getElementById('guestPhone');
        const specialRequests = document.getElementById('specialRequests').value;
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked');

        // Validate guest information
        if (!guestNameInput.value) {
            alert('Please enter the guest name.');
            guestNameInput.focus(); // Optional: focus the field
            return; // Stop execution
        }
        if (!guestEmailInput.value) {
            alert('Please enter the guest email.');
            guestEmailInput.focus();
            return;
        }
         // Basic email format check (optional but recommended)
        if (!/^\S+@\S+\.\S+$/.test(guestEmailInput.value)) {
             alert('Please enter a valid email address.');
             guestEmailInput.focus();
             return;
        }
        if (!guestPhoneInput.value) {
            alert('Please enter the guest phone number.');
            guestPhoneInput.focus();
            return;
        }

        // Validate card information
        if (paymentMethod === 'card') {
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
        }


        // Now retrieve the validated values
        const guestName = guestNameInput.value;
        const guestEmail = guestEmailInput.value;
        const guestPhone = guestPhoneInput.value;


        try {

            const bookingId = 'HB' + Date.now().toString().slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();


            console.log("Current Booking:", currentBooking);

            // Calculate total price
            const checkInDate = new Date(currentBooking.checkIn);
            const checkOutDate = new Date(currentBooking.checkOut);
            const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
            if (typeof currentBooking.pricePerNight === 'undefined' || currentBooking.pricePerNight === null) {
                throw new Error("Booking price information is missing."); // More specific error
           }
           const totalPrice = currentBooking.pricePerNight * nights * currentBooking.rooms;

            // Create booking data
            const payloadToSend = {
                hotelId: currentBooking.hotelId,
                hotelName: currentBooking.hotelName,
                roomType: currentBooking.roomType,
                checkInDate: checkInDate.toISOString(),
                checkOutDate: checkOutDate.toISOString(),
                nights,
                rooms: parseInt(currentBooking.rooms) || 1,
                adults: parseInt(currentBooking.adults) || 1,
                children: parseInt(currentBooking.children) || 0,
                pricePerNight: currentBooking.pricePerNight,
                paymentMethod,
                guestName: guestNameInput.value.trim(),
                guestEmail: guestEmailInput.value.trim(),
                guestPhone: guestPhoneInput.value.trim(),
                specialRequests: specialRequests.trim()
            };

            // Validate all required fields are present and valid
            const requiredFields = {
                'Hotel ID': payloadToSend.hotelId,
                'Hotel Name': payloadToSend.hotelName,
                'Room Type': payloadToSend.roomType,
                'Check-in Date': payloadToSend.checkInDate,
                'Check-out Date': payloadToSend.checkOutDate,
                'Number of Rooms': payloadToSend.rooms,
                'Number of Adults': payloadToSend.adults,
                'Price per Night': payloadToSend.pricePerNight,
                'Payment Method': payloadToSend.paymentMethod,
                'Guest Name': payloadToSend.guestName,
                'Guest Email': payloadToSend.guestEmail,
                'Guest Phone': payloadToSend.guestPhone
            };

            const missingFields = Object.entries(requiredFields)
                .filter(([_, value]) => !value)
                .map(([field]) => field);

            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            
            console.log("--- Sending Booking Data ---");
            console.log("hotelId:", payloadToSend.hotelId);
            console.log("hotelName:", payloadToSend.hotelName);
            console.log("roomType:", payloadToSend.roomType);
            console.log("checkIn:", payloadToSend.checkInDate);
            console.log("checkOut:", payloadToSend.checkOutDate);
            console.log("rooms:", payloadToSend.rooms); // Check if this is 0
            console.log("adults:", payloadToSend.adults); // Check if this is 0
            console.log("children:", payloadToSend.children);
            console.log("pricePerNight:", payloadToSend.pricePerNight); // Check if this is 0
            console.log("paymentMethod:", payloadToSend.paymentMethod); // Check if ""
            console.log("guestName:", payloadToSend.guestName);       // Check if ""
            console.log("guestEmail:", payloadToSend.guestEmail);     // Check if ""
            console.log("guestPhone:", payloadToSend.guestPhone);     // Check if ""
            console.log("specialRequests:", payloadToSend.specialRequests);
            console.log("--- End Booking Data ---");

            console.log("Booking Data being sent:", JSON.stringify(payloadToSend, null, 2));

            // Add checks for essential currentBooking data if necessary
            if (!payloadToSend.hotelId || !payloadToSend.roomType || !payloadToSend.checkInDate || !payloadToSend.checkOutDate) {
                throw new Error("Essential booking details are missing.");
            }

            const response = await fetch('/api/hotels/booking/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadToSend)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create booking');
            }

            const responseData = await response.json();
            if (!responseData.success) {
                throw new Error(responseData.error || 'Booking creation failed');
            }

            
            
            // Show success message
            document.querySelector('.modal-content').innerHTML = `
            <div class="booking-success">
                <h2>Booking Confirmed! 🎉</h2>
                <p>Your booking reference: <strong>${bookingId}</strong></p>
                <p>Thank you for your booking</p>
                <div class="booking-details">
                    <p><strong>Hotel:</strong> ${currentBooking.hotelName}</p>
                    <p><strong>Room Type:</strong> ${currentBooking.roomType}</p>
                    <p><strong>Number of Rooms:</strong> ${currentBooking.rooms}</p>
                    <p><strong>Check-in:</strong> ${formatDate(checkInDate)}</p>
                    <p><strong>Check-out:</strong> ${formatDate(checkOutDate)}</p>
                    <p><strong>Total Amount:</strong> ₹${totalPrice.toLocaleString('en-IN')}</p>
                </div>
                <button onclick="window.location.reload()" class="btn btn-primary mt-3">Book Another Hotel</button>
            </div>
        `;

        } catch (error) {
            console.error('Booking error:', error); // This will now show more specific errors if thrown above
            // Provide more user-friendly feedback based on the error
             let userMessage = 'Booking failed. Please try again.';
             if (error.message === "Booking price information is missing." || error.message === "Essential booking details are missing.") {
                 userMessage = `Booking failed: ${error.message} Please go back and ensure all details are selected correctly.`;
             } else if (error.message.includes("invalid input")) { // Example if you add more specific errors
                userMessage = `Booking failed due to invalid input: ${error.message}`;
             }
            alert(userMessage);
        }
    });

    // Add the new input formatting code for payment form
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
        if (!value) return;

        if (!value.match(/^\d{2}\/\d{2}$/)) {
            // Handle format error
            alert('Please match the format requested (MM/YY)');
            return;
        }
        
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
});