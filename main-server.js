// Load environment variables first
require('dotenv').config();

// Verify API key is loaded
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!GOOGLE_MAPS_API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY is not set in environment variables');
    process.exit(1);
}

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const Amadeus = require('amadeus');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Client } = require('@googlemaps/google-maps-services-js');

// Initialize Google Maps client
const googleMapsClient = new Client({});

// Firebase configuration
const { initializeApp } = require('firebase/app');
const {
    getDatabase,
    ref,
    push,
    set,
    update,
    onValue,
    get,
    query,
    orderByChild,
    startAt,
    endAt,
    serverTimestamp
} = require('firebase/database');

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: "globetrail-clg-project.firebaseapp.com",
    databaseURL: "https://globetrail-clg-project-default-rtdb.firebaseio.com",
    projectId: "globetrail-clg-project",
    storageBucket: "globetrail-clg-project.appspot.com",
    messagingSenderId: "90557063561",
    appId: "1:90557063561:web:f93540b20d00ce4e084158"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Dynamic database operations
const createNewBooking = async (userData, flightData) => {
    try {
        // Create a new booking reference with auto-generated ID
        const bookingsRef = ref(db, 'bookings');
        const newBookingRef = push(bookingsRef);

        // Generate unique booking reference
        const bookingReference = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Create booking data
        const bookingData = {
            userId: userData.userId,
            bookingReference,
            flightDetails: {
                from: flightData.from,
                to: flightData.to,
                departureDate: flightData.departureDate,
                returnDate: flightData.returnDate,
                adults: flightData.adults,
                children: flightData.children,
                class: flightData.class
            },
            passengers: flightData.passengers,
            status: 'pending',
            bookingDate: serverTimestamp(),
            payment: {
                amount: flightData.totalAmount,
                currency: 'INR',
                status: 'pending'
            }
        };

        // Save booking data
        await set(newBookingRef, bookingData);

        // Update available seats
        await updateFlightSeats(flightData.flightNumber, flightData.selectedSeats);

        return {
            success: true,
            bookingId: newBookingRef.key,
            bookingReference
        };
    } catch (error) {
        console.error('Booking creation error:', error);
        throw error;
    }
};

// Update flight seats
const updateFlightSeats = async (flightNumber, selectedSeats) => {
    try {
        const seatsRef = ref(db, `seats/${flightNumber}`);
        const updates = {};

        selectedSeats.forEach(seat => {
            updates[seat] = {
                status: 'booked',
                bookingId: newBookingRef.key,
                updatedAt: serverTimestamp()
            };
        });

        await update(seatsRef, updates);

        // Update available seats count
        const flightRef = ref(db, `flights/${flightNumber}`);
        onValue(flightRef, (snapshot) => {
            const flightData = snapshot.val();
            const currentSeats = flightData.availableSeats;

            update(flightRef, {
                availableSeats: {
                    ...currentSeats,
                    [flightData.class]: currentSeats[flightData.class] - selectedSeats.length
                }
            });
        }, { onlyOnce: true });

    } catch (error) {
        console.error('Seat update error:', error);
        throw error;
    }
};

// Update payment status
const updatePaymentStatus = async (bookingId, paymentDetails) => {
    try {
        const bookingRef = ref(db, `bookings/${bookingId}/payment`);
        await update(bookingRef, {
            status: 'completed',
            transactionId: paymentDetails.transactionId,
            paymentDate: serverTimestamp(),
            ...paymentDetails
        });

        // Update booking status
        await update(ref(db, `bookings/${bookingId}`), {
            status: 'confirmed'
        });

    } catch (error) {
        console.error('Payment update error:', error);
        throw error;
    }
};

// Monitor seat availability in real-time
const monitorSeatAvailability = (flightNumber, callback) => {
    const seatsRef = ref(db, `seats/${flightNumber}`);
    onValue(seatsRef, (snapshot) => {
        const seatsData = snapshot.val();
        callback(seatsData);
    });
};

const expressApp = express();
const port = 4000;

// Enable CORS
expressApp.use(cors({
    origin: 'http://localhost:4000',
    credentials: true
}));

// Parse JSON bodies
expressApp.use(express.json());

// Cookie parser middleware
expressApp.use(cookieParser());

// Session configuration
expressApp.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    rolling: true, // Resets the cookie expiration on every response
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Amadeus API
const amadeus = new Amadeus({
    clientId: process.env.AMADEUS_CLIENT_ID,
    clientSecret: process.env.AMADEUS_CLIENT_SECRET
});


// Middleware to log requests
expressApp.use((req, res, next) => {
    console.log("Middleware starts");
    next();
});

// Helper function for setting MIME types
const setMimeTypes = (res, filePath) => {
    if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
    }
};

// Error handling middleware
expressApp.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message
    });
});

// Airport search endpoint
expressApp.get('/api/airports/search', async (req, res) => {
    const { keyword } = req.query;

    if (!keyword || keyword.length < 1) {
        return res.status(400).json({
            error: 'Search keyword is required'
        });
    }

    try {
        console.log('Searching airports for:', keyword);

        // Reference to airports in Firebase
        const airportsRef = ref(db, 'airports');

        // Get all airports
        const snapshot = await get(airportsRef);

        if (!snapshot.exists()) {
            return res.status(404).json({
                error: 'No airports found'
            });
        }

        const airports = [];
        const searchTerm = keyword.toLowerCase();

        // Search through airports
        snapshot.forEach((childSnapshot) => {
            const airport = childSnapshot.val();

            // Search in city, name, and IATA code
            if (airport.city.toLowerCase().includes(searchTerm) ||
                airport.name.toLowerCase().includes(searchTerm) ||
                airport.iata.toLowerCase().includes(searchTerm)) {

                airports.push({
                    id: childSnapshot.key,
                    iata: airport.iata,
                    name: airport.name,
                    city: airport.city,
                    country: airport.country
                });
            }
        });

        // Sort results by relevance
        airports.sort((a, b) => {
            // Prioritize matches in IATA code
            const aIataMatch = a.iata.toLowerCase().includes(searchTerm);
            const bIataMatch = b.iata.toLowerCase().includes(searchTerm);
            if (aIataMatch && !bIataMatch) return -1;
            if (!aIataMatch && bIataMatch) return 1;

            // Then prioritize matches in city name
            const aCityMatch = a.city.toLowerCase().includes(searchTerm);
            const bCityMatch = b.city.toLowerCase().includes(searchTerm);
            if (aCityMatch && !bCityMatch) return -1;
            if (!aCityMatch && bCityMatch) return 1;

            return 0;
        });

        // Limit results
        const limitedResults = airports.slice(0, 10);

        console.log(`Found ${limitedResults.length} matching airports`);

        res.json({
            success: true,
            airports: limitedResults
        });

    } catch (error) {
        console.error('Airport search error:', error);
        res.status(500).json({
            error: 'Failed to search airports',
            details: error.message
        });
    }
});

// Get cities endpoint
expressApp.get('/api/cities/search', async (req, res) => {
    const searchQuery = req.query.q?.toLowerCase() || '';

    try {
        const citiesRef = ref(db, 'cities');
        const snapshot = await get(citiesRef);

        if (!snapshot.exists()) {
            return res.json({ cities: [] });
        }

        const cities = [];
        snapshot.forEach((childSnapshot) => {
            const city = childSnapshot.val();
            // Search in city name, state, and country
            if (city.name.toLowerCase().includes(searchQuery) ||
                city.state.toLowerCase().includes(searchQuery) ||
                city.country.toLowerCase().includes(searchQuery)) {
                cities.push({
                    id: childSnapshot.key,
                    ...city
                });
            }
        });

        res.json({ cities: cities.slice(0, 10) }); // Limit to 10 results

    } catch (error) {
        console.error('Error searching cities:', error);
        res.status(500).json({
            error: 'Failed to search cities',
            details: error.message
        });
    }
});

// Airline reference data
const airlines = {
    'AI': { name: 'Air India', logo: 'https://www.air.irctc.co.in/assets/airline-logos/AI.png' },
    'UK': { name: 'Vistara', logo: 'https://www.air.irctc.co.in/assets/airline-logos/UK.png' },
    '6E': { name: 'IndiGo', logo: 'https://www.air.irctc.co.in/assets/airline-logos/6E.png' },
    'SG': { name: 'SpiceJet', logo: 'https://www.air.irctc.co.in/assets/airline-logos/SG.png' },
    'G8': { name: 'Go First', logo: 'https://www.air.irctc.co.in/assets/airline-logos/G8.png' },
    'I5': { name: 'Air Asia India', logo: 'https://www.air.irctc.co.in/assets/airline-logos/I5.png' }
};

// Flight search endpoint
expressApp.post('/api/flights/search', async (req, res) => {
    const { origin, destination, departureDate, returnDate, adults } = req.body;

    try {
        // Search for flights
        const response = await amadeus.shopping.flightOffersSearch.get({
            originLocationCode: origin,
            destinationLocationCode: destination,
            departureDate,
            returnDate,
            adults: parseInt(adults),
            max: 20,
            currencyCode: 'USD'
        });

        // Transform the Amadeus response into a simpler format
        const flights = response.data.map(offer => {
            const itinerary = offer.itineraries[0];
            const firstSegment = itinerary.segments[0];
            const lastSegment = itinerary.segments[itinerary.segments.length - 1];
            const carrierCode = firstSegment.carrierCode;

            // Get airline details
            const airline = airlines[carrierCode] || {
                name: carrierCode,
                logo: 'https://www.air.irctc.co.in/assets/airline-logos/default.png'
            };

            return {
                id: offer.id,
                price: {
                    amount: parseFloat(offer.price.total),
                    currency: offer.price.currency || 'USD'
                },
                airline: {
                    code: carrierCode,
                    name: airline.name,
                    logo: airline.logo
                },
                origin: firstSegment.departure.iataCode,
                destination: lastSegment.arrival.iataCode,
                departureTime: firstSegment.departure.at,
                arrivalTime: lastSegment.arrival.at,
                duration: itinerary.duration,
                stops: itinerary.segments.length - 1,
                segments: itinerary.segments.map(segment => {
                    const segmentCarrier = airlines[segment.carrierCode] || {
                        name: segment.carrierCode,
                        logo: 'https://www.air.irctc.co.in/assets/airline-logos/default.png'
                    };

                    return {
                        departure: {
                            airport: segment.departure.iataCode,
                            time: segment.departure.at,
                            terminal: segment.departure.terminal
                        },
                        arrival: {
                            airport: segment.arrival.iataCode,
                            time: segment.arrival.at,
                            terminal: segment.arrival.terminal
                        },
                        airline: {
                            code: segment.carrierCode,
                            name: segmentCarrier.name,
                            logo: segmentCarrier.logo
                        },
                        flightNumber: segment.number,
                        duration: segment.duration
                    };
                })
            };
        });

        res.json({ flights });
    } catch (error) {
        console.error('Error searching flights:', error);
        res.status(500).json({
            error: 'Failed to search flights',
            details: error.message
        });
    }
});

// Flight booking endpoint
expressApp.post('/api/flights/book', async (req, res) => {
    const { flight, passengers, contact } = req.body;

    try {
        // Validate required fields
        if (!flight || !passengers || !contact) {
            return res.status(400).json({
                error: 'Missing required booking information',
                details: 'Flight, passenger, and contact details are required'
            });
        }

        // Validate flight data
        if (!flight.price || !flight.price.amount) {
            return res.status(400).json({
                error: 'Invalid flight data',
                details: 'Flight price information is missing'
            });
        }

        // Validate passenger data
        if (!Array.isArray(passengers) || passengers.length === 0) {
            return res.status(400).json({
                error: 'Invalid passenger data',
                details: 'At least one passenger is required'
            });
        }

        for (const passenger of passengers) {
            if (!passenger.firstName || !passenger.lastName) {
                return res.status(400).json({
                    error: 'Invalid passenger data',
                    details: 'First name and last name are required for all passengers'
                });
            }
        }

        // Validate contact information
        if (!contact.email || !contact.phone) {
            return res.status(400).json({
                error: 'Invalid contact information',
                details: 'Email and phone number are required'
            });
        }

        // Calculate total amount
        const totalAmount = flight.price.amount * passengers.length;

        // Generate booking reference
        const bookingReference = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Store booking in Firebase
        const bookingsRef = ref(db, 'bookings');
        const newBookingRef = push(bookingsRef);

        const bookingData = {
            bookingReference,
            flightDetails: {
                ...flight,
                totalPassengers: passengers.length,
                totalAmount
            },
            passengers: passengers.map(passenger => ({
                ...passenger,
                seatNumber: null // Will be assigned during seat selection
            })),
            contact,
            status: 'pending',
            createdAt: serverTimestamp(),
            userId: req.session?.userId || 'guest',
            payment: {
                status: 'pending',
                amount: totalAmount,
                currency: flight.price.currency || 'INR',
                createdAt: serverTimestamp()
            }
        };

        await set(newBookingRef, bookingData);

        console.log('Booking created:', {
            id: newBookingRef.key,
            reference: bookingReference,
            amount: totalAmount
        });

        res.json({
            success: true,
            bookingId: newBookingRef.key,
            bookingReference,
            totalAmount
        });

    } catch (error) {
        console.error('Booking creation error:', error);
        res.status(500).json({
            error: 'Failed to create booking',
            details: error.message
        });
    }
});


// Hotel booking endpoint
expressApp.post('/api/hotels/booking/create', async (req, res) => {
    try {
        const {
            hotelId,
            hotelName,
            roomType,
            checkIn,
            checkOut,
            rooms,
            adults,
            children,
            pricePerNight,
            paymentMethod,
            guestName,
            guestEmail,
            guestPhone
        } = req.body;

        // Validate required fields
        if (!hotelId || !hotelName || !roomType || !checkIn || !checkOut || !rooms || 
            !adults || !pricePerNight || !paymentMethod || !guestName || !guestEmail || !guestPhone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Generate a unique booking reference
        const bookingId = 'BK' + Date.now().toString().slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();

        // Calculate total price
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
        const totalPrice = pricePerNight * nights * rooms;

        // In a real application, you would:
        // 1. Process payment through a payment gateway
        // 2. Store booking details in a database
        // 3. Send confirmation email
        // 4. Update hotel inventory

        // For demo purposes, we'll just return success
        res.json({
            success: true,
            bookingId,
            message: 'Booking confirmed successfully',
            details: {
                bookingId,
                hotelName,
                roomType,
                checkIn,
                checkOut,
                nights,
                rooms,
                adults,
                children,
                totalPrice,
                guestName,
                guestEmail
            }
        });

    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create booking'
        });
    }
});

// Seat assignment endpoint
expressApp.post('/api/flights/seats', async (req, res) => {
    const { bookingId, seats } = req.body;

    try {
        // Validate input
        if (!bookingId || !seats || !Array.isArray(seats)) {
            return res.status(400).json({
                error: 'Invalid request',
                details: 'Booking ID and seat selections are required'
            });
        }

        // Get booking reference
        const bookingRef = ref(db, `bookings/${bookingId}`);
        const bookingSnapshot = await get(bookingRef);

        if (!bookingSnapshot.exists()) {
            return res.status(404).json({
                error: 'Booking not found',
                details: 'The specified booking does not exist'
            });
        }

        const booking = bookingSnapshot.val();

        // Validate number of seats matches passengers
        if (seats.length !== booking.passengers.length) {
            return res.status(400).json({
                error: 'Invalid seat selection',
                details: 'Number of seats must match number of passengers'
            });
        }

        // Update seat assignments in the booking
        const updates = {};

        // Update passenger seat assignments
        booking.passengers.forEach((passenger, index) => {
            updates[`/bookings/${bookingId}/passengers/${index}/seatNumber`] = seats[index];
        });

        // Update seat status in the seats collection
        seats.forEach(seatNumber => {
            updates[`/seats/${booking.flightDetails.segments[0].flightNumber}/${seatNumber}`] = {
                status: 'booked',
                bookingId: bookingId,
                updatedAt: serverTimestamp()
            };
        });

        // Apply all updates atomically
        await update(ref(db), updates);

        console.log('Seats assigned:', {
            bookingId,
            seats,
            flightNumber: booking.flightDetails.segments[0].flightNumber
        });

        res.json({
            success: true,
            message: 'Seats assigned successfully'
        });

    } catch (error) {
        console.error('Seat assignment error:', error);
        res.status(500).json({
            error: 'Failed to assign seats',
            details: error.message
        });
    }
});

// Get seat availability endpoint
expressApp.get('/api/flights/:flightNumber/seats', async (req, res) => {
    const { flightNumber } = req.params;

    try {
        // Get all seats for the flight
        const seatsRef = ref(db, `seats/${flightNumber}`);
        const seatsSnapshot = await get(seatsRef);

        const bookedSeats = seatsSnapshot.exists() ? Object.keys(seatsSnapshot.val()) : [];

        res.json({
            success: true,
            bookedSeats
        });

    } catch (error) {
        console.error('Error getting seat availability:', error);
        res.status(500).json({
            error: 'Failed to get seat availability',
            details: error.message
        });
    }
});

// API configuration endpoint
expressApp.get('/api/config', (req, res) => {
    res.json({
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
});

// Firebase config endpoint
expressApp.get('/api/config/firebase', (req, res) => {
    const firebaseConfig = {
        apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
        authDomain: "globetrail-clg-project.firebaseapp.com",
        databaseURL: "https://globetrail-clg-project-default-rtdb.firebaseio.com",
        projectId: "globetrail-clg-project",
        storageBucket: "globetrail-clg-project.appspot.com",
        messagingSenderId: "90557063561",
        appId: "1:90557063561:web:f93540b20d00ce4e084158"
    };
    res.json(firebaseConfig);
});

// Configure static file serving with correct MIME types
expressApp.use('/app', express.static(path.join(__dirname, 'app'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/auth', express.static(path.join(__dirname, 'auth'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/dashboard', express.static(path.join(__dirname, 'app/dashboard'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/create-itinerary', express.static(path.join(__dirname, 'app/create-itinerary'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/flight', express.static(path.join(__dirname, 'app/flight'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/hotel', express.static(path.join(__dirname, 'app/hotel'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/saved-itinerary', express.static(path.join(__dirname, 'app/saved-itinerary'), {
    setHeaders: setMimeTypes
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// Check session endpoint
expressApp.get('/api/check-session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            userId: req.session.userId,
            name: req.session.name || req.session.email,
            email: req.session.email,
            authenticated: true
        });
    } else {
        res.json({ 
            authenticated: false,
            userId: null,
            name: null,
            email: null
        });
    }
});

// Login endpoint
expressApp.post('/api/login', (req, res) => {
    try {
        const { email, firebaseUid, displayName } = req.body;

        if (!email || !firebaseUid) {
            return res.status(400).json({
                success: false,
                message: 'Email and firebaseUid are required'
            });
        }

        // Create session with more user info
        req.session.userId = firebaseUid;
        req.session.email = email;
        req.session.name = displayName || email.split('@')[0]; // Use display name or email username as fallback

        res.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Logout endpoint
expressApp.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error during logout'
            });
        }
        res.json({ success: true });
    });
});

// Routes
expressApp.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'app', 'home', 'home.html'));
    }
});

expressApp.get('/login', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'auth', 'login', 'login.html'));
    }
});

expressApp.get('/register', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'auth', 'register', 'register.html'));
    }
});

// Protected routes
expressApp.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'dashboard', 'dashboard.html'));
});

expressApp.get('/create-itinerary', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'create-itinerary', 'create-itinerary.html'));
});

expressApp.get('/app/create-itinerary/create-itinerary.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'create-itinerary', 'create-itinerary.html'));
});

expressApp.get('/flight', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'flight', 'flight.html'));
});

expressApp.get('/hotel', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'hotel', 'hotel.html'));
});

expressApp.get('/saved-itinerary', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'saved-itinerary', 'saved-itinerary.html'));
});

// Hotel search endpoint
expressApp.post('/api/hotels/search', requireAuth, async (req, res) => {
    try {
        const {
            destination,
            location,
            checkIn,
            checkOut,
            rooms,
            adults,
            children,
            priceRange,
            ratings
        } = req.body;

        console.log('Received hotel search request:', {
            destination,
            location,
            checkIn,
            checkOut,
            rooms,
            adults,
            children,
            priceRange,
            ratings
        });

        if (!location || !location.lat || !location.lng) {
            throw new Error('Invalid location data');
        }

        // Search for hotels using Google Places API
        console.log('Searching for hotels with query:', `hotels in ${destination}`);
        const searchResponse = await googleMapsClient.textSearch({
            params: {
                query: `hotels in ${destination}`,
                location: { lat: parseFloat(location.lat), lng: parseFloat(location.lng) },
                radius: 5000, // 5km radius
                type: 'lodging',
                key: GOOGLE_MAPS_API_KEY
            }
        });

        if (!searchResponse.data || !searchResponse.data.results) {
            throw new Error('No results from Google Places API');
        }

        console.log(`Found ${searchResponse.data.results.length} hotels`);

        // Process each hotel to get additional details
        const hotelDetailsPromises = searchResponse.data.results.map(async (place) => {
            try {
                const detailResponse = await googleMapsClient.placeDetails({
                    params: {
                        place_id: place.place_id,
                        fields: ['name', 'formatted_address', 'geometry', 'rating', 'formatted_phone_number', 'website', 'price_level', 'photos'],
                        key: GOOGLE_MAPS_API_KEY
                    }
                });

                const details = detailResponse.data.result;
                const basePrice = priceRange === 'economy' ? 2000 : priceRange === 'moderate' ? 5000 : 10000;
                const priceMultiplier = details.price_level ? details.price_level : 1;

                return {
                    id: place.place_id,
                    name: details.name,
                    address: details.formatted_address,
                    location: {
                        lat: details.geometry.location.lat,
                        lng: details.geometry.location.lng
                    },
                    rating: details.rating || 0,
                    phone: details.formatted_phone_number,
                    website: details.website,
                    price: basePrice * priceMultiplier,
                    image: details.photos && details.photos[0] ? 
                        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${details.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}` 
                        : null
                };
            } catch (detailError) {
                console.error('Error fetching hotel details:', {
                    hotelId: place.place_id,
                    error: detailError.message,
                    stack: detailError.stack
                });
                return null;
            }
        });

        const hotels = (await Promise.all(hotelDetailsPromises)).filter(hotel => hotel !== null);

        // Filter by rating if specified
        const filteredHotels = ratings.length > 0
            ? hotels.filter(hotel => ratings.includes(Math.floor(hotel.rating).toString()))
            : hotels;

        console.log('Sending response with hotels:', {
            totalHotels: hotels.length,
            filteredHotels: filteredHotels.length
        });

        res.json({
            success: true,
            hotels: filteredHotels
        });

    } catch (error) {
        console.error('Error searching hotels:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search hotels',
            details: error.message
        });
    }
});

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
});

const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192
};

// Express route for itinerary generation
expressApp.post('/api/generate-itinerary', async (req, res) => {
    try {
        const { destination, startDate, endDate, budget, travelers } = req.body;

        console.log('Generating itinerary for:', { destination, startDate, endDate, budget, travelers });

        // Calculate number of days
        const start = new Date(startDate);
        const end = new Date(endDate);
        const numberOfDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        // Create Gemini API prompt
        const prompt = `Generate a travel planner for ${destination}, for ${numberOfDays} days, with a budget range of ${budget} and ${travelers} travelers. 
                        Give me a hotel list with name, address, price, image URL, geo-coordinates, rating, and descriptions. 
                        Provide an itinerary with places, details, image URLs, coordinates, ticket prices, travel times, and best visit times in JSON format.`;

        console.log('Sending prompt to Gemini:', prompt);

        // Call Gemini API
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
        });

        if (!result || !result.response) {
            throw new Error('No response from Gemini API');
        }

        const responseText = result.response.text();
        if (!responseText) {
            throw new Error('Empty itinerary received from Gemini API');
        }

        console.log('Successfully generated itinerary');

        // Send the generated itinerary back to client
        res.json({
            success: true,
            itinerary: responseText,
            metadata: {
                destination,
                dates: { startDate, endDate },
                numberOfDays,
                budget,
                travelers
            }
        });

    } catch (error) {
        console.error('Error generating itinerary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate itinerary',
            details: error.message
        });
    }
});

// Save itinerary endpoint
expressApp.post('/api/save-itinerary', async (req, res) => {
    try {
        const { itineraryData, metadata, userId, isTemporary } = req.body;

        if (!itineraryData || !metadata || !userId) {
            throw new Error('Missing required data');
        }

        // Create a reference to the itineraries collection
        const itinerariesRef = ref(db, 'itineraries');
        const newItineraryRef = push(itinerariesRef);

        // Create itinerary data object
        const saveData = {
            itineraryData,
            metadata,
            userId,
            isTemporary: isTemporary || false,
            createdAt: serverTimestamp(),
            status: 'active',
            id: newItineraryRef.key,
            expiresAt: isTemporary ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null // 7 days expiry for temporary itineraries
        };

        // Save to Firebase
        await set(newItineraryRef, saveData);

        // If it's a temporary itinerary, set up automatic deletion after 7 days
        if (isTemporary) {
            const deleteRef = ref(db, `itineraries/${newItineraryRef.key}`);
            setTimeout(async () => {
                try {
                    await set(deleteRef, null);
                    console.log(`Temporary itinerary ${newItineraryRef.key} deleted`);
                } catch (error) {
                    console.error('Error deleting temporary itinerary:', error);
                }
            }, 7 * 24 * 60 * 60 * 1000); // 7 days
        }

        res.json({
            success: true,
            message: isTemporary ? 'Itinerary saved temporarily' : 'Itinerary saved successfully',
            itineraryId: newItineraryRef.key,
            isTemporary
        });

    } catch (error) {
        console.error('Error saving itinerary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save itinerary',
            details: error.message
        });
    }
});

// Get user's itineraries endpoint
expressApp.get('/api/itineraries/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const isTemp = userId.startsWith('anon_');
        
        // Reference to itineraries
        const itinerariesRef = ref(db, 'itineraries');
        
        // Query itineraries for this user
        const userItinerariesQuery = query(
            itinerariesRef,
            orderByChild('userId'),
            equalTo(userId)
        );

        // Get the data
        const snapshot = await get(userItinerariesQuery);
        const itineraries = [];

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const itinerary = childSnapshot.val();
                // For temporary users, only show non-expired itineraries
                if (isTemp) {
                    const expiryDate = new Date(itinerary.expiresAt);
                    if (expiryDate > new Date()) {
                        itineraries.push({
                            id: childSnapshot.key,
                            ...itinerary
                        });
                    }
                } else {
                    itineraries.push({
                        id: childSnapshot.key,
                        ...itinerary
                    });
                }
            });
        }

        res.json({ itineraries });
    } catch (error) {
        console.error('Error fetching itineraries:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch itineraries'
        });
    }
});

// Delete itinerary endpoint
expressApp.delete('/api/itineraries/:itineraryId', async (req, res) => {
    try {
        const { itineraryId } = req.params;
        
        // Reference to the specific itinerary
        const itineraryRef = ref(db, `itineraries/${itineraryId}`);
        
        // Get the itinerary data first to check ownership
        const snapshot = await get(itineraryRef);
        
        if (!snapshot.exists()) {
            return res.status(404).json({
                success: false,
                error: 'Itinerary not found'
            });
        }

        const itinerary = snapshot.val();
        
        // Check if the user owns this itinerary
        if (req.session && req.session.userId && itinerary.userId !== req.session.userId) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to delete this itinerary'
            });
        }

        // Delete the itinerary
        await set(itineraryRef, null);

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting itinerary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete itinerary'
        });
    }
});

// Handle 404 errors with more detailed logging
expressApp.use((req, res) => {
    console.log('404 error for path:', req.path);
    console.log('Method:', req.method);
    console.log('Headers:', req.headers);
    
    res.status(404).json({
        success: false,
        error: 'Page not found',
        path: req.path
    });
});

// Start server with health check
expressApp.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('Environment variables loaded:');
    console.log('  - FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Missing');
    console.log('  - AMADEUS_CLIENT_ID:', process.env.AMADEUS_CLIENT_ID ? 'Set' : 'Missing');
});