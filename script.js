// *** IMPORTANT: YOUR APPS SCRIPT URL GOES HERE ***
// Use the URL you obtained after deploying your Code.gs script as a Web App (Access: Anyone).
const GS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzjjAofqch230aw2FLqbkzZXqOEk2eIS8xge2XOWdWiRJd6NNLIXNR73T2o4EzJHnIx2A/exec"; 

// Quiz state variables
let currentQuestionIndex = 0;
let score = 0;
let shuffledData = [];
let allData = [];
let availableTags = [];
let quizConfig = {
    length: 10,
    tag: '',
    minYear: null,
    maxYear: null
};
let answerSubmitted = false;

// Utility to format date for display
function formatDateForDisplay(year, month, day) {
    const absYear = Math.abs(year);
    const era = year < 0 ? ' BC' : '';
    
    // If no month or day provided, just return year
    if (!month || !day) {
        return `${absYear}${era}`;
    }
    
    // Convert month number to month name
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    
    // Validate month and day
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        const monthName = months[monthNum];
        const dayFormatted = dayNum.toString().padStart(2, '0');
        return `${absYear}${era} ${monthName} ${dayFormatted}`;
    }
    
    // If invalid month/day, just return year
    return `${absYear}${era}`;
}

// Calculate score based on how close the answer is to the correct year
// Returns a score from 0-10 points based on the difference
function calculateScore(userAnswer, correctYear) 
{
    const difference = Math.abs(userAnswer - correctYear);
    if (difference === 0) return 10; 

    if(correctYear >= 2000)
    {
        if (difference <= 1) return 5;
        if (difference <= 2) return 2;
        if (difference <= 5) return 1;
        return 0;
    }

    if(correctYear >= 1900)
    {
        if (difference <= 1) return 5;
        if (difference <= 2) return 4;
        if (difference <= 3) return 3;
        if (difference <= 5) return 2;
        if (difference <= 10) return 1;
        return 0;
    }

    if(correctYear >= 1500)
    {
        if (difference <= 1) return 5;
        if (difference <= 5) return 4;
        if (difference <= 10) return 3;
        if (difference <= 25) return 2;
        if (difference <= 100) return 1;
        return 0;
    }

    if(correctYear >= 0)
    {
        if (difference <= 3) return 5;
        if (difference <= 5) return 4;
        if (difference <= 10) return 3;
        if (difference <= 25) return 2; 
        if (difference <= 100) return 1; 
        return 0;
    }

    if(correctYear >= -2000)
    { 
        if (difference <= 5) return 5;
        if (difference <= 10) return 4;
        if (difference <= 20) return 3;
        if (difference <= 50) return 2; 
        if (difference <= 150) return 1; 
        return 0;
    }

    if (difference <= 10) return 5; 
    if (difference <= 50) return 4;
    if (difference <= 100) return 3; 
    if (difference <= 250) return 2; 
    if (difference <= 500) return 1; 
    return 0;
}

// Utility to shuffle the array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Extract unique tags from data
function extractTags(data) {
    const tagSet = new Set();
    data.forEach(event => {
        if (event[4] && event[4].trim()) {
            // Split tags by comma and add each one
            const tags = event[4].split(',').map(tag => tag.trim()).filter(tag => tag);
            tags.forEach(tag => tagSet.add(tag));
        }
    });
    return Array.from(tagSet).sort();
}

// Populate tag dropdown
function populateTagDropdown(tags, filter = '') {
    const dropdown = document.getElementById('tag-dropdown');
    dropdown.innerHTML = '';
    
    if (tags.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }
    
    // Filter tags based on search
    const filteredTags = tags.filter(tag => 
        tag.toLowerCase().includes(filter.toLowerCase())
    );
    
    if (filteredTags.length === 0 && filter) {
        dropdown.classList.add('hidden');
        return;
    }
    
    // Add "All Events" option
    const allOption = document.createElement('div');
    allOption.className = 'px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm';
    allOption.textContent = 'All Events';
    allOption.addEventListener('click', () => {
        document.getElementById('tag-filter').value = '';
        dropdown.classList.add('hidden');
    });
    dropdown.appendChild(allOption);
    
    // Add filtered tags
    filteredTags.forEach(tag => {
        const option = document.createElement('div');
        option.className = 'px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm';
        option.textContent = tag;
        option.addEventListener('click', () => {
            document.getElementById('tag-filter').value = tag;
            dropdown.classList.add('hidden');
        });
        dropdown.appendChild(option);
    });
    
    dropdown.classList.remove('hidden');
}

// --- Data Fetching Logic ---

// Exponential backoff mechanism for retries
async function fetchDataWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.error) {
                // Handle specific error message returned by Apps Script
                throw new Error(`Apps Script Error: ${data.error}`);
            }

            return data;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            if (i === maxRetries - 1) {
                throw new Error("Failed to load quiz data after multiple retries. Check the Web App URL and deployment status.");
            }
            // Wait for 2^i seconds before next retry
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

// Initialize app - show start page
function initializeApp() {
    showStartPage();
}

// Preload tags for dropdown
async function preloadTags() {
    if (allData.length === 0) {
        try {
            allData = await fetchDataWithRetry(GS_WEB_APP_URL);
            availableTags = extractTags(allData);
            console.log('Tags loaded:', availableTags);
        } catch (error) {
            console.error('Failed to preload tags:', error);
            // Continue without tags - user can still type custom filters
        }
    }
}

// Show the start page
function showStartPage() {
    document.getElementById('start-page').classList.remove('hidden');
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('quiz-content').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    
    // Preload tags in background for dropdown
    preloadTags();
}

// Load data and start quiz with configuration
async function startQuizWithConfig() {
    const loadingElement = document.getElementById('loading-state');
    
    // Hide start page and show loading
    document.getElementById('start-page').classList.add('hidden');
    loadingElement.classList.remove('hidden');
    document.getElementById('quiz-content').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    
    // Check for placeholder URL
    if (GS_WEB_APP_URL.includes("YOUR_APPS_SCRIPT_WEB_APP_URL_HERE")) {
        displayError("Please set the correct Apps Script Web App URL in script.js.");
        return;
    }

    try {
        // Fetch data from the deployed Apps Script URL (only if not already loaded)
        if (allData.length === 0) {
            allData = await fetchDataWithRetry(GS_WEB_APP_URL);
            // Extract tags when data is first loaded
            availableTags = extractTags(allData);
        }
        
        // Filter and prepare quiz data
        let filteredData = allData.slice();
        
        // Apply tag filter if specified
        if (quizConfig.tag && quizConfig.tag.trim()) {
            const tagLower = quizConfig.tag.trim().toLowerCase();
            filteredData = filteredData.filter(event => 
                event[0].toLowerCase().includes(tagLower) || 
                (event[4] && event[4].toLowerCase().includes(tagLower))
            );
        }
        
        // Apply year range filter if specified
        if (quizConfig.minYear !== null || quizConfig.maxYear !== null) {
            filteredData = filteredData.filter(event => {
                const eventYear = event[1]; // Year is in index 1
                let inRange = true;
                
                if (quizConfig.minYear !== null && eventYear < quizConfig.minYear) {
                    inRange = false;
                }
                if (quizConfig.maxYear !== null && eventYear > quizConfig.maxYear) {
                    inRange = false;
                }
                
                return inRange;
            });
        }
        
        if (filteredData.length === 0) {
            const filters = [];
            if (quizConfig.tag && quizConfig.tag.trim()) filters.push(`tag "${quizConfig.tag}"`);
            if (quizConfig.minYear !== null) filters.push(`min year ${quizConfig.minYear}`);
            if (quizConfig.maxYear !== null) filters.push(`max year ${quizConfig.maxYear}`);
            const filterText = filters.length > 0 ? ` matching ${filters.join(', ')}` : '';
            displayError(`No events found${filterText}. Please adjust your filters.`);
            return;
        }
        
        // Shuffle and limit data based on quiz length
        shuffledData = shuffleArray(filteredData.slice());
        shuffledData = shuffledData.slice(0, Math.min(quizConfig.length, shuffledData.length));
        
        // Reset quiz state
        currentQuestionIndex = 0;
        score = 0;
        
        // Show quiz content and start
        loadingElement.classList.add('hidden');
        document.getElementById('quiz-content').classList.remove('hidden');
        
        loadQuestion();

    } catch (error) {
        displayError(`Data Load Error: ${error.message}`);
    }
}

function displayError(message) {
    const loadingElement = document.getElementById('loading-state');
    document.getElementById('start-page').classList.add('hidden');
    document.getElementById('quiz-content').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    loadingElement.classList.remove('hidden');
    loadingElement.innerHTML = `
        <div class="text-center p-8 bg-red-50 border border-red-200 rounded-lg">
            <h2 class="text-xl font-bold text-red-700 mb-4">Error Loading Data</h2>
            <p class="text-sm text-red-600">${message}</p>
            <button id="back-to-start" 
                    class="mt-4 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition duration-150">
                Back to Start
            </button>
        </div>
    `;
    
    // Add event listener for back to start button
    document.getElementById('back-to-start').addEventListener('click', () => {
        loadingElement.innerHTML = `
            <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>Loading quiz events from Google Sheet...</p>
        `;
        showStartPage();
    });
}

// --- Quiz Flow Logic ---

function loadQuestion() {
    if (currentQuestionIndex >= shuffledData.length) {
        showResults();
        return;
    }

    const currentEvent = shuffledData[currentQuestionIndex];
    document.getElementById('event-text').textContent = currentEvent[0];
    
    // Update question counter and score
    document.getElementById('question-counter').textContent = `Question ${currentQuestionIndex + 1}/${shuffledData.length}`;
    const maxPossiblePoints = currentQuestionIndex * 10; // 10 points per question
    document.getElementById('score-display').textContent = `Score: ${score}/${maxPossiblePoints} pts`;
    
    // Hide feedback element initially
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('feedback').classList.remove('text-green-600', 'text-orange-600', 'text-yellow-600', 'text-red-600', 'text-gray-500');
    
    // Reset input and button state
    const yearInput = document.getElementById('year-input');
    const checkButton = document.getElementById('check-button');
    const bcToggle = document.getElementById('bc-toggle');
    
    yearInput.value = '';
    yearInput.disabled = false;
    yearInput.focus();
    checkButton.textContent = 'Check';
    answerSubmitted = false;
    
    // Reset BC toggle to AD
    if (bcToggle) {
        bcToggle.textContent = 'AD';
        bcToggle.classList.remove('border-blue-500', 'bg-blue-600', 'text-white');
        bcToggle.classList.add('border-gray-300', 'bg-white');
    }

    // Update progress bar
    const progress = (currentQuestionIndex / shuffledData.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

function checkAnswer() {
    const input = document.getElementById('year-input').value.trim();
    const bcToggle = document.getElementById('bc-toggle');
    const isBC = bcToggle.textContent === 'BC';
    const currentEvent = shuffledData[currentQuestionIndex];
    const correctYear = currentEvent[1];
    const month = currentEvent[2];
    const day = currentEvent[3];
    
    // Parse input and convert to negative if BC is selected
    let inputNumber = parseInt(input, 10);
    if (isBC && inputNumber > 0) {
        inputNumber = -inputNumber;
    }

    // Check if input is a valid positive integer (since we handle BC with toggle)
    if (isNaN(inputNumber) || input.includes('.') || input.includes('-') || parseInt(input, 10) <= 0) {
                    document.getElementById('feedback').classList.remove('hidden');
        document.getElementById('feedback').innerHTML = "Please enter a valid positive year number.";
        document.getElementById('feedback').classList.remove('text-green-600', 'text-orange-600', 'text-yellow-600', 'text-gray-500');
        document.getElementById('feedback').classList.add('text-red-600');
        return;
    }

    // Check if year is not in the future (only for AD years)
    const currentYear = new Date().getFullYear();
    if (!isBC && parseInt(input, 10) > currentYear) {
        document.getElementById('feedback').classList.remove('hidden');
        document.getElementById('feedback').innerHTML = `Please enter a year not later than ${currentYear}.`;
        document.getElementById('feedback').classList.remove('text-green-600', 'text-orange-600', 'text-yellow-600', 'text-gray-500');
        document.getElementById('feedback').classList.add('text-red-600');
        return;
    }

    const pointsEarned = calculateScore(inputNumber, correctYear);
    const isCorrect = inputNumber === correctYear;
    const difference = Math.abs(inputNumber - correctYear);

    score += pointsEarned; // Add points to total score

    const feedbackElement = document.getElementById('feedback');
    feedbackElement.classList.remove('hidden'); // Show feedback element
    feedbackElement.classList.remove('text-green-600', 'text-orange-600', 'text-yellow-600', 'text-red-600', 'text-gray-500');

    const formattedDate = formatDateForDisplay(correctYear, month, day);
    
    if (isCorrect) {
        feedbackElement.innerHTML = `Perfect! ${pointsEarned} points<br><span class="text-lg font-semibold">${formattedDate}</span>`;
        feedbackElement.classList.add('text-green-600');
    } else if (pointsEarned >= 4) {
        feedbackElement.innerHTML = `Close! ${pointsEarned} points (off by ${difference} years)<br><span class="text-lg font-semibold">${formattedDate}</span>`;
        feedbackElement.classList.add('text-yellow-600');
    }
     else if (pointsEarned >= 1) {
        feedbackElement.innerHTML = `Not too bad! ${pointsEarned} points (off by ${difference} years)<br><span class="text-lg font-semibold">${formattedDate}</span>`;
        feedbackElement.classList.add('text-orange-600');
    } else {
        feedbackElement.innerHTML = `0 points (off by ${difference} years)<br><span class="text-lg font-semibold">${formattedDate}</span>`;
        feedbackElement.classList.add('text-red-600');
    }
    
    console.log('Feedback set to:', feedbackElement.textContent);

    // Change button to "Next" and disable input
    const checkButton = document.getElementById('check-button');
    const yearInput = document.getElementById('year-input');
    
    checkButton.textContent = 'Next';
    answerSubmitted = true;
    yearInput.disabled = true;
    yearInput.blur();
}

function nextQuestion() {
    currentQuestionIndex++;
    loadQuestion();
}

function showResults() {
    // Hide quiz content and show end screen
    document.getElementById('quiz-content').classList.add('hidden');
    document.getElementById('end-screen').classList.remove('hidden');
    
    // Calculate percentage based on points (max 10 points per question)
    const maxPossiblePoints = shuffledData.length * 10;
    const percentage = Math.round((score / maxPossiblePoints) * 100);
    
    // Update score display
    document.getElementById('final-score').textContent = `${score}/${maxPossiblePoints}`;
    document.getElementById('score-percentage').textContent = `${percentage}% Score`;
    
    // Show performance message based on score
    const messageElement = document.getElementById('performance-message');
    let message, messageClass;
    
    if (percentage >= 90) {
        message = "🌟 Outstanding! You're a history expert!";
        messageClass = "bg-green-100 text-green-800 border border-green-200";
    } else if (percentage >= 70) {
        message = "👏 Great job! You have solid historical knowledge!";
        messageClass = "bg-blue-100 text-blue-800 border border-blue-200";
    } else if (percentage >= 30) {
        message = "📚 Could be better! Keep studying to improve your score!";
        messageClass = "bg-yellow-100 text-yellow-800 border border-yellow-200";
    } else {
        message = "🎯 Auch, not the best! Keep practicing!";
        messageClass = "bg-orange-100 text-orange-800 border border-orange-200";
    }
    
    messageElement.textContent = message;
    messageElement.className = `mb-6 p-4 rounded-lg ${messageClass}`;
}

// Event handlers for start page
function setupStartPageHandlers() {
    // Quiz length selection buttons
    const lengthButtons = document.querySelectorAll('.quiz-length-btn');
    lengthButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            lengthButtons.forEach(btn => {
                btn.classList.remove('border-blue-500', 'bg-blue-50', 'text-blue-700');
                btn.classList.add('border-gray-300');
            });
            
            // Add active class to clicked button
            button.classList.remove('border-gray-300');
            button.classList.add('border-blue-500', 'bg-blue-50', 'text-blue-700');
            
            // Update config
            quizConfig.length = parseInt(button.dataset.length);
        });
    });
    
    // Tag filter dropdown handlers
    const tagFilter = document.getElementById('tag-filter');
    const tagDropdown = document.getElementById('tag-dropdown');
    
    if (tagFilter) {
        // Show dropdown on focus and populate with available tags
        tagFilter.addEventListener('focus', () => {
            setTimeout(() => {
                if (availableTags.length > 0) {
                    populateTagDropdown(availableTags, tagFilter.value);
                } else {
                    // Show loading message if tags not loaded yet
                    const dropdown = document.getElementById('tag-dropdown');
                    dropdown.innerHTML = '<div class="px-3 py-2 text-sm text-gray-500">Loading tags...</div>';
                    dropdown.classList.remove('hidden');
                }
            }, 100);
        });
        
        // Filter dropdown as user types
        tagFilter.addEventListener('input', (e) => {
            if (availableTags.length > 0) {
                populateTagDropdown(availableTags, e.target.value);
            }
        });
        
        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target !== tagFilter && !tagDropdown.contains(e.target)) {
                tagDropdown.classList.add('hidden');
            }
        });
    }
    
    // Start quiz button
    document.getElementById('start-quiz-btn').addEventListener('click', () => {
        quizConfig.tag = document.getElementById('tag-filter').value.trim();
        
        // Capture year range filters
        const minYearValue = document.getElementById('min-year').value.trim();
        const maxYearValue = document.getElementById('max-year').value.trim();
        
        quizConfig.minYear = minYearValue ? parseInt(minYearValue, 10) : null;
        quizConfig.maxYear = maxYearValue ? parseInt(maxYearValue, 10) : null;
        
        // Validate year range
        if (quizConfig.minYear !== null && quizConfig.maxYear !== null && quizConfig.minYear > quizConfig.maxYear) {
            alert('Minimum year cannot be greater than maximum year.');
            return;
        }
        
        startQuizWithConfig();
    });
}

// Event handlers for end screen
function setupEndScreenHandlers(){
    
    document.getElementById('new-quiz-btn').addEventListener('click', () => {
        showStartPage();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize app
    initializeApp();
    
    // Setup all event handlers
    setupStartPageHandlers();
    setupEndScreenHandlers();
    
    // Event listeners for quiz content (these elements exist in the DOM initially)
    const checkButton = document.getElementById('check-button');
    const yearInput = document.getElementById('year-input');
    const quitButton = document.getElementById('quit-quiz-btn');

    if (checkButton) {
        checkButton.addEventListener('click', function() {
            if (answerSubmitted) {
                nextQuestion();
            } else {
                checkAnswer();
            }
        });
    }
    
    if (quitButton) {
        quitButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to quit and return to setup? Your progress will be lost.')) {
                showStartPage();
            }
        });
    }
    
    // BC Toggle functionality
    const bcToggle = document.getElementById('bc-toggle');
    if (bcToggle) {
        bcToggle.addEventListener('click', function() {
            const currentText = this.textContent;
            if (currentText === 'AD') {
                this.textContent = 'BC';
                this.classList.remove('border-gray-300', 'bg-white');
                this.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
            } else {
                this.textContent = 'AD';
                this.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
                this.classList.add('border-gray-300', 'bg-white');
            }
        });
    }
    
    if (yearInput) {
        yearInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission or other default behavior
                e.stopPropagation(); // Prevent event from bubbling to document listener
                if (answerSubmitted) {
                    nextQuestion();
                } else {
                    checkAnswer();
                }
            }
        });
        
        // Handle minus key for BC toggle and block non-numeric input
        yearInput.addEventListener('keydown', function(e) {
            // Allow navigation and editing keys
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                'Home', 'End', 'PageUp', 'PageDown'
            ];
            
            // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            if (e.ctrlKey && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) {
                return;
            }
            
            // Handle minus key for BC toggle
            if (e.key === '-' || e.key === 'Minus') {
                e.preventDefault();
                
                // Toggle to BC if currently AD
                const bcToggle = document.getElementById('bc-toggle');
                if (bcToggle && bcToggle.textContent === 'AD') {
                    bcToggle.textContent = 'BC';
                    bcToggle.classList.remove('border-gray-300', 'bg-white');
                    bcToggle.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
                } else {
                    bcToggle.textContent = 'AD';
                    bcToggle.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
                    bcToggle.classList.add('border-gray-300', 'bg-white');
                }
                return;
            }
            
            // Allow only digits (0-9) and allowed navigation keys
            if (!allowedKeys.includes(e.key) && (e.key < '0' || e.key > '9')) {
                e.preventDefault();
            }
        });
        
        // Allow only digit input
        yearInput.addEventListener('input', function(e) {
            let value = this.value;
            
            // Allow only digits
            value = value.replace(/[^\d]/g, '');
            
            // Update the input if it changed
            if (this.value !== value) {
                this.value = value;
            }
        });
    }
    
    // Also handle Enter key when input is disabled (for next question)
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && answerSubmitted) {
            nextQuestion();
        }
    });
});
