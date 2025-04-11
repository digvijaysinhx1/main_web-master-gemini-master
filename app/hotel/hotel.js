// initialize firebase with .env
async function initializeFirebase() {
    const response = await fetch('/api/config/firebase');
    const config = await response.json();
    firebase.initializeApp(config);
}




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

        autocomplete.addListener('place_changed', function() {
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
    searchForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const destination = document.getElementById('destination');
        if (!destination.dataset.lat || !destination.dataset.lng) {
            alert('Please select a destination from the dropdown list');
            return;
        }

        const checkIn = document.getElementById('checkIn');
        const checkOut = document.getElementById('checkOut');
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
                    <div class="hotel-price-tag">₹${hotel.price.toLocaleString('en-IN')}</div>
                    <img src="${imageUrl}" alt="${hotel.name}" class="hotel-image" 
                         onerror="this.onerror=null; this.src='${defaultImage}';">
                </div>
                <div class="hotel-info">
                    <h3 class="hotel-name">${hotel.name}</h3>
                    <p class="hotel-address">${hotel.address}</p>
                    <div class="hotel-rating">
                        <div class="stars">${'★'.repeat(Math.floor(hotel.rating))}${'☆'.repeat(5-Math.floor(hotel.rating))}</div>
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
                label: {
                    text: `₹${Math.floor(hotel.price/1000)}k`,
                    color: '#FFFFFF',
                    fontSize: '14px'
                }
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

    window.bookHotel = function(hotelId, hotelName) {
        const checkIn = document.getElementById('checkIn').value;
        const checkOut = document.getElementById('checkOut').value;
        const rooms = document.getElementById('rooms').value;
        const adults = document.getElementById('adults').value;
        const children = document.getElementById('children').value;

        // Store booking details
        currentBooking = {
            hotelId,
            hotelName: decodeURIComponent(hotelName),
            checkIn,
            checkOut,
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

    window.nextStep = function(step) {
        document.getElementById(`step${currentStep}`).style.display = 'none';
        document.getElementById(`step${step}`).style.display = 'block';
        currentStep = step;

        if (step === 3) {
            updateBookingSummary();
        }
    };

    window.prevStep = function(step) {
        document.getElementById(`step${currentStep}`).style.display = 'none';
        document.getElementById(`step${step}`).style.display = 'block';
        currentStep = step;
    };

    window.selectRoom = function(roomType, price) {
        currentBooking.roomType = roomType;
        currentBooking.pricePerNight = price;
        window.nextStep(2);
    };

    function displayRoomOptions() {
        const roomOptionsContainer = document.getElementById('roomOptions');
        const roomTypes = [
            {
                type: 'Deluxe Room',
                price: 5000,
                amenities: ['King Size Bed', 'City View', 'Free WiFi', 'Breakfast Included']
            },
            {
                type: 'Premium Room',
                price: 7500,
                amenities: ['Twin Beds', 'Pool View', 'Free WiFi', 'Breakfast Included', 'Mini Bar']
            },
            {
                type: 'Suite',
                price: 12000,
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
    document.querySelector('.close').onclick = function() {
        document.getElementById('bookingModal').style.display = 'none';
    };

    window.onclick = function(event) {
        const modal = document.getElementById('bookingModal');
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };

    // Handle payment method selection
    document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
        radio.addEventListener('change', function() {
            document.querySelectorAll('.payment-section').forEach(section => {
                section.style.display = 'none';
            });
            document.getElementById(this.value + 'Payment').style.display = 'block';
        });
    });

    // Handle payment form submission
    document.getElementById('paymentForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        const guestName = document.getElementById('guestName').value;
        const guestEmail = document.getElementById('guestEmail').value;
        const guestPhone = document.getElementById('guestPhone').value;
        const specialRequests = document.getElementById('specialRequests').value;
        
        try {
            // Generate booking ID
            const bookingId = 'HB' + Date.now().toString().slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
            
            // Calculate total price
            const checkInDate = new Date(currentBooking.checkIn);
            const checkOutDate = new Date(currentBooking.checkOut);
            const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
            const totalPrice = currentBooking.pricePerNight * nights * currentBooking.rooms;

            // Create booking data
            const bookingData = {
                bookingId,
                hotelId: currentBooking.hotelId,
                hotelName: currentBooking.hotelName,
                roomType: currentBooking.roomType,
                checkIn: new Date(currentBooking.checkIn),
                checkOut: new Date(currentBooking.checkOut),
                nights,
                rooms: parseInt(currentBooking.rooms),
                adults: parseInt(currentBooking.adults),
                children: parseInt(currentBooking.children),
                pricePerNight: currentBooking.pricePerNight,
                totalPrice,
                guest: {
                    name: guestName,
                    email: guestEmail,
                    phone: guestPhone
                },
                specialRequests,
                paymentMethod,
                paymentStatus: 'completed',
                bookingStatus: 'confirmed',
                createdAt: new Date(),
                userId: null
            };

            // Save to local storage
            localStorage.setItem('booking', JSON.stringify(bookingData));

            // Show success message
            document.querySelector('.modal-content').innerHTML = `
                <div class="booking-success">
                    <h2>Booking Confirmed! 🎉</h2>
                    <p>Thank you for your booking. A confirmation email will be sent to ${guestEmail}.</p>
                    <p>Booking Reference: ${bookingId}</p>
                    <div class="booking-details">
                        <p><strong>Hotel:</strong> ${currentBooking.hotelName}</p>
                        <p><strong>Room Type:</strong> ${currentBooking.roomType}</p>
                        <p><strong>Check-in:</strong> ${formatDate(checkInDate)}</p>
                        <p><strong>Check-out:</strong> ${formatDate(checkOutDate)}</p>
                        <p><strong>Total Amount Paid:</strong> ₹${totalPrice.toLocaleString('en-IN')}</p>
                    </div>
                    <button onclick="location.reload()">Book Another Hotel</button>
                </div>
            `;

        } catch (error) {
            console.error('Booking error:', error);
            alert('Booking failed: ' + error.message);
        }
    });
});