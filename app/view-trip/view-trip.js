// Import from Firebase modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/11.3.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBm4FwFhQyW17r_8Waa6SjQGJlCm8DG9GU",
  authDomain: "globetrail-clg-project.firebaseapp.com",
  databaseURL: "https://globetrail-clg-project-default-rtdb.firebaseio.com",
  projectId: "globetrail-clg-project",
  storageBucket: "globetrail-clg-project.appspot.com",
  messagingSenderId: "90557063561",
  appId: "1:90557063561:web:f93540b20d00ce4e084158"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Add this to the top of your file with other imports
let map;
let placesService;
const GOOGLE_API_KEY = 'AIzaSyB_dyM2dfau2b6vXtoWtR04mlNbTD38cso'; // Using your existing Google Maps API key

// Initialize Google Maps and Places service
function initGoogleServices() {
    // Create a dummy map (required for Places service)
    map = new google.maps.Map(document.createElement('div'));
    // Initialize Places service
    placesService = new google.maps.places.PlacesService(map);
}

// Modified getPlaceImage function using Places service
async function getPlaceImage(placeName) {
    if (!placesService) {
        initGoogleServices();
    }

    return new Promise((resolve, reject) => {
        const request = {
            query: `${placeName} india landmark`,
            fields: ['photos', 'formatted_address', 'name', 'rating', 'opening_hours', 'geometry'],
        };

        placesService.findPlaceFromQuery(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0] && results[0].photos) {
                const photoUrl = results[0].photos[0].getUrl({maxWidth: 800, maxHeight: 600});
                resolve(photoUrl);
            } else {
                // Fallback images based on place type
                if (placeName.toLowerCase().includes('temple')) {
                    resolve('https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=ATJ83zj5vP_w9MjsGWxwKQxqhqq4I6b6QTkEI_8akGQZNKg6qKjxc9C1h8uhKM_nkH5KwpLgHJsLnqo2qICIFu7GQ9b-2QRqRQ&key=' + GOOGLE_API_KEY);
                } else if (placeName.toLowerCase().includes('palace')) {
                    resolve('https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=ATJ83ziUz2kY5FkQZ9j8IUjK9bqq4I6b6QTkEI_8akGQZNKg6qKjxc9C1h8uhKM_nkH5KwpLgHJsLnqo2qICIFu7GQ9b-2QRqRQ&key=' + GOOGLE_API_KEY);
                } else {
                    resolve('https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=ATJ83zjUz2kY5FkQZ9j8IUjK9bqq4I6b6QTkEI_8akGQZNKg6qKjxc9C1h8uhKM_nkH5KwpLgHJsLnqo2qICIFu7GQ9b-2QRqRQ&key=' + GOOGLE_API_KEY);
                }
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const itineraryId = urlParams.get('id');
    const userId = urlParams.get('userId');

    console.log('URL Parameters:', { userId, itineraryId });

    if (!itineraryId || !userId) {
        showError(!itineraryId ? 'No itinerary ID provided' : 'No user ID provided');
        return;
    }

    loadItinerary(itineraryId);
});

async function loadItinerary(itineraryId) {
    try {
        // Show loading spinner
        document.getElementById('loadingSpinner').classList.remove('hidden');
        
        // Get the userId from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('userId');

        if (!userId) {
            throw new Error('User ID is required');
        }
        
        // Get itinerary data using the correct path
        const itineraryRef = ref(db, `itineraries/${userId}/${itineraryId}`);
        console.log('Database Reference:', `itineraries/${userId}/${itineraryId}`);
        
        const itinerarySnapshot = await get(itineraryRef);

        console.log('Snapshot exists?', itinerarySnapshot.exists());

        if (!itinerarySnapshot.exists()) {
            throw new Error('Itinerary not found');
        }

        const itineraryData = itinerarySnapshot.val();
        console.log('Itinerary Data:', itineraryData);

        // Get places data
        const places = [];
        if (itineraryData.places) {
            Object.entries(itineraryData.places).forEach(([id, data]) => {
                places.push({ id, ...data });
            });
            // Sort places by visitOrder
            places.sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0));
        }

        // Display the itinerary
        displayItinerary(itineraryData, places);
    } catch (error) {
        console.error('Error loading itinerary:', error);
        showError(error.message || 'Failed to load itinerary');
    } finally {
        document.getElementById('loadingSpinner').classList.add('hidden');
    }
}

async function displayItinerary(metadata, places) {
    // Show itinerary container
    document.getElementById('itineraryContainer').classList.remove('hidden');

    // Display metadata
    document.getElementById('tripTitle').textContent = `Trip to ${metadata.destination}`;
    document.getElementById('destination').textContent = metadata.destination;
    document.getElementById('dates').textContent = `${formatDate(metadata.startDate)} - ${formatDate(metadata.endDate)}`;
    document.getElementById('travelers').textContent = `${metadata.travelers} Travelers`;
    document.getElementById('budget').textContent = `Budget: ₹${metadata.budget}`;

    // Display timeline
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';

    // Get the card template
    const template = document.getElementById('placeCardTemplate');

    // Group places by day
    const placesByDay = {};
    places.forEach(place => {
        if (!placesByDay[place.day]) {
            placesByDay[place.day] = [];
        }
        placesByDay[place.day].push(place);
    });

    // Sort days and display places
    for (const day of Object.keys(placesByDay).sort((a, b) => {
        const dayA = parseInt(a.split(' ')[1]);
        const dayB = parseInt(b.split(' ')[1]);
        return dayA - dayB;
    })) {
        const dayIndex = parseInt(day.split(' ')[1]) - 1;
        
        // Add day header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'w-full text-center py-4 font-bold text-xl text-primary-600';
        dayHeader.textContent = day;
        timeline.appendChild(dayHeader);

        // Sort places within the day by visitOrder
        const sortedPlaces = placesByDay[day].sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0));
        
        // Fetch images for all places in this day
        const placeImages = await Promise.all(
            sortedPlaces.map(place => getPlaceImage(place.name))
        );

        // Display places with their images
        sortedPlaces.forEach((place, index) => {
            const card = template.content.cloneNode(true);
            
            // Set place details
            card.querySelector('.place-name').textContent = place.name;
            
            // Set place image
            const placeImage = card.querySelector('.place-image');
            placeImage.src = placeImages[index];
            placeImage.alt = place.name;
            
            // Add loading state to image
            placeImage.classList.add('opacity-0', 'transition-opacity', 'duration-300');
            placeImage.onload = () => placeImage.classList.remove('opacity-0');
            
            card.querySelector('.visit-time').textContent = formatVisitTime(place.visitTime);
            card.querySelector('.entry-fee').textContent = place.entryFee ? `Entry Fee: ₹${place.entryFee}` : 'Free Entry';
            card.querySelector('.place-description').textContent = place.description || 'Experience this amazing destination';
            card.querySelector('.place-facts p').textContent = place.facts || 'No additional facts available';

            // Add animation delay based on index
            const timelineItem = card.querySelector('.timeline-item');
            timelineItem.style.animationDelay = `${(dayIndex * sortedPlaces.length + index) * 0.1}s`;
            timelineItem.classList.add('fade-in');

            timeline.appendChild(card);
        });
    }
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatVisitTime(time) {
    return time || 'Flexible timing';
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    // Hide loading spinner
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.add('hidden');
}