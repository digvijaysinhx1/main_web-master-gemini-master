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

function displayItinerary(metadata, places) {
    // Show itinerary container
    document.getElementById('itineraryContainer').classList.remove('hidden');

    // Display metadata
    document.getElementById('tripTitle').textContent = `Trip to ${metadata.destination}`;
    document.getElementById('destination').textContent = metadata.destination;
    document.getElementById('dates').textContent = `${formatDate(metadata.startDate)} - ${formatDate(metadata.endDate)}`;
    document.getElementById('travelers').textContent = `${metadata.travelers}`;
    document.getElementById('budget').textContent = `Budget: ${metadata.budget}`;

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
    Object.keys(placesByDay)
        .sort((a, b) => {
            const dayA = parseInt(a.split(' ')[1]);
            const dayB = parseInt(b.split(' ')[1]);
            return dayA - dayB;
        })
        .forEach((day, dayIndex) => {
            // Add day header
            const dayHeader = document.createElement('div');
            dayHeader.className = 'w-full text-center py-4 font-bold text-xl text-primary-600';
            dayHeader.textContent = day;
            timeline.appendChild(dayHeader);

            // Sort places within the day by visitOrder
            placesByDay[day]
                .sort((a, b) => (a.visitOrder || 0) - (b.visitOrder || 0))
                .forEach((place, index) => {
                    const card = template.content.cloneNode(true);
                    
                    // Set place details
                    card.querySelector('.place-name').textContent = place.name;
                    card.querySelector('.place-image').src = place.imageUrl || 'default-place-image.jpg';
                    card.querySelector('.visit-time').textContent = formatVisitTime(place.visitTime);
                    card.querySelector('.entry-fee').textContent = place.entryFee ? `Entry Fee: ₹${place.entryFee}` : 'Free Entry';
                    card.querySelector('.place-description').textContent = place.description;
                    card.querySelector('.place-facts p').textContent = place.facts || 'No additional facts available';

                    // Add animation delay based on index
                    const timelineItem = card.querySelector('.timeline-item');
                    timelineItem.style.animationDelay = `${(dayIndex * placesByDay[day].length + index) * 0.1}s`;
                    timelineItem.classList.add('fade-in');

                    timeline.appendChild(card);
                });
        });
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