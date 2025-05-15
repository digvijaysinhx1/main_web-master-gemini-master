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

// Enable CORS with proper configuration
expressApp.use(cors({
    origin: true, // Allow any origin
    credentials: true // Allow credentials
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
    rolling: true,
    cookie: {
        secure: false, // Set to true only in production with HTTPS
        httpOnly: true,
        sameSite: 'lax',
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
        // Log the search request
        console.log('Flight search request:', {
            origin,
            destination,
            departureDate,
            returnDate,
            adults
        });

        // Check if the date is valid (not in the past)
        const searchDate = new Date(departureDate);
        const currentSimulatedDate = new Date('2025-05-10'); // Using your simulated date
        
        if (searchDate < currentSimulatedDate) {
            return res.json({
                success: false,
                error: 'Cannot search for flights in the past',
                flights: []
            });
        }

        // Generate mock flight data since we're in 2025
        const airlines = [
            { code: 'AI', name: 'Air India', basePrice: 5000 },
            { code: '6E', name: 'IndiGo', basePrice: 4500 },
            { code: 'UK', name: 'Vistara', basePrice: 5500 },
            { code: 'SG', name: 'SpiceJet', basePrice: 4000 },
            { code: 'G8', name: 'Go First', basePrice: 4200 }
        ];

        const mockFlights = [];
        
        // Generate 20 flights throughout the day
        for (let i = 0; i < 20; i++) {
            // Calculate flight time (between 5 AM and 11 PM)
            const hour = 5 + Math.floor(i * (18/20)); // Spread flights between 5 AM and 11 PM
            const minute = Math.floor(Math.random() * 60);
            
            // Random duration between 1h 30m and 2h 30m
            const durationHours = 1 + Math.floor(Math.random() * 2);
            const durationMinutes = Math.floor(Math.random() * 60);
            
            // Calculate arrival time
            const departureDateTime = new Date(`${departureDate}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
            const arrivalDateTime = new Date(departureDateTime.getTime() + (durationHours * 60 + durationMinutes) * 60000);
            
            // Select random airline
            const airline = airlines[Math.floor(Math.random() * airlines.length)];
            
            // Calculate price with some variation
            const basePrice = airline.basePrice;
            const priceVariation = Math.floor(Math.random() * 2000) - 1000; // +/- 1000
            const timeOfDayPremium = hour >= 6 && hour <= 9 ? 1000 : // Morning premium
                                   hour >= 16 && hour <= 19 ? 800 : 0; // Evening premium
            
            mockFlights.push({
                airline: airline.code,
                flightNumber: `${airline.code}-${Math.floor(Math.random() * 1000)}`,
                departureTime: departureDateTime.toISOString(),
                arrivalTime: arrivalDateTime.toISOString(),
                duration: `PT${durationHours}H${durationMinutes}M`,
                price: {
                    amount: basePrice + priceVariation + timeOfDayPremium,
                    currency: 'INR'
                },
                from: origin,
                to: destination,
                stops: 0,
                aircraft: 'A320'
            });
        }

        // Sort flights by departure time
        mockFlights.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));

        return res.json({ 
            success: true,
            flights: mockFlights 
        });

    } catch (error) {
        console.error('Flight search error:', {
            message: error.message,
            code: error.code,
            status: error.status,
            response: error.response?.data
        });
        
        let errorMessage = 'Failed to search flights';
        if (error.response?.data?.errors) {
            errorMessage = error.response.data.errors.map(e => e.detail).join(', ');
        }

        res.status(error.status || 500).json({
            success: false,
            error: errorMessage,
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
            checkInDate,
            checkOutDate,
            rooms,
            adults,
            children,
            pricePerNight,
            paymentMethod,
            guestName,
            guestEmail,
            guestPhone,
            specialRequests
        } = req.body;

        // Validate required fields
        if (!hotelId || !hotelName || !roomType || !checkInDate || !checkOutDate || !rooms ||
            !adults || !pricePerNight || !paymentMethod || !guestName || !guestEmail || !guestPhone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Calculate total price
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        const totalPrice = pricePerNight * nights * rooms;

        // Create booking reference
        const bookingId = `HB${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        // Format dates in ISO format with timezone
        const formattedCheckIn = checkIn.toISOString();
        const formattedCheckOut = checkOut.toISOString();
        const createdAt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });

        const bookingData = {
            adults: parseInt(adults),
            bookingId,
            bookingStatus: "confirmed",
            checkInDate: formattedCheckIn,
            checkOutDate: formattedCheckOut,
            children: children ? parseInt(children) : 0,
            createdAt,
            guest: {
                email: guestEmail,
                name: guestName,
                phone: guestPhone
            },
            hotelId,
            hotelName,
            nights,
            paymentMethod,
            paymentStatus: "pending",
            pricePerNight: parseInt(pricePerNight),
            roomType,
            rooms: parseInt(rooms),
            specialRequests: specialRequests || "",
            totalPrice,
            userId: req.session?.userId || 'guest'
        };

        // Firebase save to "hotel_bookings"
        const hotelBookingsRef = ref(db, 'hotel_bookings');
        const newHotelBookingRef = push(hotelBookingsRef);

        await set(newHotelBookingRef, {
            bookingId,
            hotelId,
            hotelName,
            roomType,
            checkInDate,
            checkOutDate,
            nights,
            rooms,
            adults,
            children,
            totalPrice,
            pricePerNight,
            paymentMethod,
            guestName,
            guestEmail,
            guestPhone,
            specialRequests,
            createdAt: serverTimestamp(),
            bookingStatus: 'confirmed'
        });

        res.json({
            success: true,
            bookingId,
            message: 'Booking confirmed and saved successfully',
            details: {
                bookingId,
                hotelName,
                roomType,
                checkInDate,
                checkOutDate,
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
        console.error('Error creating hotel booking:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create booking',
            details: error.message
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
expressApp.use('/static', express.static(path.join(__dirname, 'static')));
expressApp.use('/app', express.static(path.join(__dirname, 'app')));

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

expressApp.use('/review', express.static(path.join(__dirname, 'app/review'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/view-trip', express.static(path.join(__dirname, 'app/view-trip'), {
    setHeaders: setMimeTypes
}));

expressApp.use('/acc-info', express.static(path.join(__dirname, 'app/acc-info'), {
    setHeaders: setMimeTypes
}));

// Serve static files from the app directory
expressApp.use(express.static(path.join(__dirname, 'app')));

// Handle frontend page routes
expressApp.get('/flight', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'flight', 'flight.html'));
});

expressApp.get('/hotel', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'hotel', 'hotel.html'));
});

expressApp.get('/review', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'review', 'review.html'));
});

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

expressApp.get('/view-trip', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'view-trip', 'view-trip.html'));
});
expressApp.get('/acc-info', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'acc-info', 'acc-info.html'));
});

// Get itinerary data endpoint
expressApp.get('/api/get-itinerary/:userId/:itineraryId', requireAuth, async (req, res) => {
    try {
        const itineraryId = req.params.itineraryId;
        const userId = req.params.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        console.log('Fetching itinerary:', itineraryId, 'for user:', userId);

        // First try to find the itinerary in the user's path
        const userItineraryRef = ref(db, `itineraries/${userId}/${itineraryId}`);
        let snapshot = await get(userItineraryRef);

        if (!snapshot.exists()) {
            // If not found in user's path, search in all users' itineraries
            const allUsersRef = ref(db, 'itineraries');
            const allUsersSnapshot = await get(allUsersRef);

            if (allUsersSnapshot.exists()) {
                let found = false;
                allUsersSnapshot.forEach((userSnapshot) => {
                    const userItineraries = userSnapshot.val();
                    if (userItineraries[itineraryId]) {
                        snapshot = {
                            val: () => userItineraries[itineraryId],
                            exists: () => true
                        };
                        found = true;
                        return true;
                    }
                });

                if (!found) {
                    return res.status(404).json({
                        success: false,
                        error: 'Itinerary not found'
                    });
                }
            } else {
                return res.status(404).json({
                    success: false,
                    error: 'Itinerary not found'
                });
            }
        }

        const itineraryData = snapshot.val();
        console.log('Found itinerary:', itineraryData);

        res.json({
            success: true,
            itinerary: itineraryData.itineraryData,
            metadata: itineraryData.metadata
        });
    } catch (error) {
        console.error('Error fetching itinerary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch itinerary',
            details: error.message
        });
    }
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

        // Create Gemini API prompt with strict JSON structure
        const prompt = `You are a JSON generator for travel itineraries. Generate a travel itinerary for ${destination} with these requirements:
1. Respond ONLY with valid JSON
2. Do not include any explanatory text
3. Follow this exact structure:
{
  "itinerarySummary": {
    "destination": "${destination}",
    "travelDates": {
      "start": "${startDate}",
      "end": "${endDate}"
    },
    "travelers": "${travelers}",
    "budget": "${budget}",
    "days": "day1",
    "placesToVisit": [
      {
        "day": "Day 1",
        "name": "string",
        "imageUrl": "string",
        "visitTime": "string",
        "entryFee": "string",
        "description": "string",
        "interestingFact": "string",
        "order": 1
      }
    ]
  }
}

Requirements:
- Group places by days (Day 1, Day 2, etc.)
- Include at least 2-3 places for each day
- Number of days should match the travel dates
- Each place must have the day field (e.g., "Day 1", "Day 2")
- Places should be in chronological order within each day
- Provide real place names and descriptions
- Use realistic timings and entry fees
- Each place must have a unique order number within its day
- Keep descriptions concise but informative
- Entry fee should be "Free" or include amount
- Image URLs should be placeholder URLs like "https://example.com/image-name.jpg"`;

        console.log('Sending prompt to Gemini:', prompt);

        // Call Gemini API with stricter parameters
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3, // Lower temperature for more consistent output
                topK: 1,
                topP: 0.8,
                maxOutputTokens: 2048,
            },
        });

        if (!result || !result.response) {
            throw new Error('No response from Gemini API');
        }

        const responseText = result.response.text();
        if (!responseText) {
            throw new Error('Empty itinerary received from Gemini API');
        }

        // Clean the response text and try to parse as JSON
        let parsedResponse;
        try {
            // Remove any potential markdown code block markers or extra text
            const cleanedText = responseText
                .replace(/```json\s*/g, '')
                .replace(/```\s*$/g, '')
                .trim();

            parsedResponse = JSON.parse(cleanedText);

            // Validate the required structure
            if (!parsedResponse.itinerarySummary || !Array.isArray(parsedResponse.itinerarySummary.placesToVisit)) {
                throw new Error('Invalid itinerary structure');
            }
        } catch (error) {
            console.error('Invalid JSON from Gemini:', responseText);
            throw new Error('Generated itinerary is not in valid JSON format');
        }

        console.log('Successfully generated itinerary:', parsedResponse);

        // Send the generated itinerary back to client
        res.json({
            success: true,
            itinerary: parsedResponse,
            metadata: {
                destination,
                startDate,
                endDate,
                numberOfDays,
                budget,
                travelers
            }
        });

    } catch (error) {
        console.error('Error generating itinerary:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate itinerary'
        });
    }
});

// Save itinerary endpoint
expressApp.post('/api/save-itinerary', requireAuth, async (req, res) => {
    try {
        const { itineraryData, metadata } = req.body;
        const userId = req.body.userId;

        if (!itineraryData || !metadata) {
            throw new Error('Missing required data');
        }

        // Parse the itinerary data if it's a string
        const parsedItinerary = typeof itineraryData === 'string' ? JSON.parse(itineraryData) : itineraryData;
        const itinerarySummary = parsedItinerary.itinerarySummary;

        if (!itinerarySummary) {
            throw new Error('Invalid itinerary format');
        }

        // Use the authenticated user's ID from the session
        const authenticatedUserId = req.session.userId;

        if (!authenticatedUserId) {
            throw new Error('User not authenticated');
        }

        // Create a new itinerary ID
        const itinerariesRef = ref(db, `itineraries/${authenticatedUserId}`);
        const newItineraryRef = push(itinerariesRef);
        const itineraryId = newItineraryRef.key;

        // Extract places from itineraryData and structure them correctly
        const places = {};
        if (Array.isArray(itinerarySummary.placesToVisit)) {
            itinerarySummary.placesToVisit.forEach((place, index) => {
                const placeId = `place${index + 1}`;
                places[placeId] = {
                    day: place.day || `Day ${Math.floor(index / 3) + 1}`, // Fallback to calculating day if not provided
                    name: place.name,
                    imageUrl: place.imageUrl,
                    visitTime: place.visitTime,
                    entryFee: place.entryFee === 'Free' ? 0 : parseInt(place.entryFee.replace(/[^\d]/g, '')) || 0,
                    description: place.description,
                    facts: place.interestingFact,
                    visitOrder: place.order || (index % 3) + 1 // Reset order for each day
                };
            });
        }

        // Create the itinerary record
        const itineraryRecord = {
            userId: authenticatedUserId,
            destination: itinerarySummary.destination || metadata.destination,
            startDate: metadata.startDate,
            endDate: metadata.endDate,
            travelers: metadata.travelers,
            budget: metadata.budget,
            places: places,
            createdAt: serverTimestamp(),
            status: 'active'
        };

        // Save to Firebase
        await set(newItineraryRef, itineraryRecord);

        res.json({
            success: true,
            itineraryId: itineraryId,
            message: 'Itinerary saved successfully'
        });

    } catch (error) {
        console.error('Error saving itinerary:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to save itinerary'
        });
    }
});

// Get latest itinerary endpoint
expressApp.post('/api/get-latest-itinerary', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        // Get reference to user's itineraries
        const userItinerariesRef = ref(db, `itineraries/${userId}`);

        try {
            // Get the user's itineraries
            const snapshot = await get(userItinerariesRef);

            if (!snapshot.exists()) {
                return res.status(404).json({
                    success: false,
                    error: 'No itineraries found for this user'
                });
            }

            // Convert snapshot to array and sort by timestamp
            const itineraries = [];
            snapshot.forEach((childSnapshot) => {
                const itinerary = childSnapshot.val();
                itineraries.push({
                    ...itinerary,
                    timestamp: itinerary.timestamp || itinerary.createdAt || Date.now()
                });
            });

            // Sort by timestamp (newest first) and get the latest
            const latestItinerary = itineraries.sort((a, b) => {
                const timeA = a.timestamp || 0;
                const timeB = b.timestamp || 0;
                return timeB - timeA;
            })[0];

            res.json({
                success: true,
                itinerary: latestItinerary
            });

        } catch (error) {
            console.error('Error reading from Firebase:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to read from database'
            });
        }

    } catch (error) {
        console.error('Error in get-latest-itinerary:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Get user's itineraries endpoint
expressApp.get('/api/itineraries/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const isTemp = userId.startsWith('anon_');

        // Reference to itineraries
        const itinerariesRef = ref(db, `itineraries/${userId}`);

        // Get all itineraries for this user
        const snapshot = await get(itinerariesRef);

        if (!snapshot.exists()) {
            return res.json({
                success: true,
                itineraries: []
            });
        }

        // Convert the snapshot to array and add IDs
        const itineraries = Object.entries(snapshot.val()).map(([id, data]) => ({
            id,
            ...data,
            metadata: {
                destination: data.destination,
                startDate: data.startDate,
                endDate: data.endDate,
                travelers: data.travelers,
                budget: data.budget
            }
        }));

        // Sort by timestamp, newest first
        itineraries.sort((a, b) => {
            const timeA = a.timestamp || a.createdAt || 0;
            const timeB = b.timestamp || b.createdAt || 0;
            return timeB - timeA;
        });

        res.json({
            success: true,
            itineraries
        });

    } catch (error) {
        console.error('Error fetching itineraries:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch itineraries'
        });
    }
});

// Delete itinerary endpoint
expressApp.delete('/api/itineraries/:userId/:itineraryId', requireAuth, async (req, res) => {
    try {
        const { userId, itineraryId } = req.params;

        // Reference to the specific itinerary under the user's path
        const itineraryRef = ref(db, `itineraries/${userId}/${itineraryId}`);

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
        if (req.session && req.session.userId && userId !== req.session.userId) {
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