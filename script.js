// *** IMPORTANT: YOUR APPS SCRIPT URL GOES HERE ***
// Use the URL you obtained after deploying your Code.gs script as a Web App (Access: Anyone).
const GS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzjjAofqch230aw2FLqbkzZXqOEk2eIS8xge2XOWdWiRJd6NNLIXNR73T2o4EzJHnIx2A/exec"; 

// Quiz state variables
let currentQuestionIndex = 0;
let score = 0;
let shuffledData = [];
let allData = [];
let quizConfig = {
    length: 10,
    tag: ''
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

// Utility to shuffle the array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
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

// Show the start page
function showStartPage() {
    document.getElementById('start-page').classList.remove('hidden');
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('quiz-content').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
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
        }
        
        // Filter and prepare quiz data
        let filteredData = allData.slice();
        
        // Apply tag filter if specified
        if (quizConfig.tag && quizConfig.tag.trim()) {
            const tagLower = quizConfig.tag.trim().toLowerCase();
            filteredData = allData.filter(event => 
                event[0].toLowerCase().includes(tagLower) || 
                (event[4] && event[4].toLowerCase().includes(tagLower))
            );
        }
        
        if (filteredData.length === 0) {
            displayError(`No events found matching "${quizConfig.tag}". Please try a different tag or leave it empty.`);
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
    document.getElementById('score-display').textContent = `Score: ${score}/${currentQuestionIndex}`;
    
    document.getElementById('feedback').textContent = "(use negative numbers for BC)";
    document.getElementById('feedback').classList.remove('text-green-600', 'text-red-600');
    document.getElementById('feedback').classList.add('text-gray-500');
    
    // Reset input and button state
    const yearInput = document.getElementById('year-input');
    const checkButton = document.getElementById('check-button');
    
    yearInput.value = '';
    yearInput.disabled = false;
    yearInput.focus();
    checkButton.textContent = 'Check';
    answerSubmitted = false;

    // Update progress bar
    const progress = (currentQuestionIndex / shuffledData.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

function checkAnswer() {
    const input = document.getElementById('year-input').value.trim();
    const currentEvent = shuffledData[currentQuestionIndex];
    const correctYear = currentEvent[1];
    const month = currentEvent[2];
    const day = currentEvent[3];
    const inputNumber = parseInt(input, 10);

    // Check if input is a valid integer (no decimals, no non-numeric characters)
    if (isNaN(inputNumber) || input.includes('.') || inputNumber.toString() !== input) {
        document.getElementById('feedback').innerHTML = "Please enter a valid integer (whole number only).";
        document.getElementById('feedback').classList.remove('text-green-600', 'text-gray-500');
        document.getElementById('feedback').classList.add('text-red-600');
        return;
    }

    const isCorrect = inputNumber === correctYear;

    const feedbackElement = document.getElementById('feedback');
    feedbackElement.classList.remove('text-green-600', 'text-red-600', 'text-gray-500');

    if (isCorrect) {
        score++;
        const formattedDate = formatDateForDisplay(correctYear, month, day);
        feedbackElement.innerHTML = `Correct!<br><span class="text-lg font-semibold">${formattedDate}</span>`;
        feedbackElement.classList.add('text-green-600');
    } else {
        const formattedDate = formatDateForDisplay(correctYear, month, day);
        feedbackElement.innerHTML = `Incorrect. The correct year was:<br><span class="text-lg font-semibold">${formattedDate}</span>`;
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
    
    // Calculate percentage
    const percentage = Math.round((score / shuffledData.length) * 100);
    
    // Update score display
    document.getElementById('final-score').textContent = `${score}/${shuffledData.length}`;
    document.getElementById('score-percentage').textContent = `${percentage}% Correct`;
    
    // Show performance message based on score
    const messageElement = document.getElementById('performance-message');
    let message, messageClass;
    
    if (percentage >= 90) {
        message = "🌟 Outstanding! You're a history expert!";
        messageClass = "bg-green-100 text-green-800 border border-green-200";
    } else if (percentage >= 70) {
        message = "👏 Great job! You have solid historical knowledge!";
        messageClass = "bg-blue-100 text-blue-800 border border-blue-200";
    } else if (percentage >= 50) {
        message = "📚 Not bad! Keep studying to improve your score!";
        messageClass = "bg-yellow-100 text-yellow-800 border border-yellow-200";
    } else {
        message = "🎯 Keep practicing! History is full of fascinating dates to learn!";
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
    
    // Start quiz button
    document.getElementById('start-quiz-btn').addEventListener('click', () => {
        quizConfig.tag = document.getElementById('tag-filter').value.trim();
        startQuizWithConfig();
    });
}

// Event handlers for end screen
function setupEndScreenHandlers() {
    document.getElementById('restart-same-quiz').addEventListener('click', () => {
        // Restart with same configuration
        startQuizWithConfig();
    });
    
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

    if (checkButton) {
        checkButton.addEventListener('click', function() {
            if (answerSubmitted) {
                nextQuestion();
            } else {
                checkAnswer();
            }
        });
    }
    
    if (yearInput) {
        yearInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (answerSubmitted) {
                    nextQuestion();
                } else {
                    checkAnswer();
                }
            }
        });
        
        // Allow only integer input (including negative)
        yearInput.addEventListener('input', function(e) {
            let value = this.value;
            
            // Allow only digits and one minus sign at the beginning
            // First, remove any characters that aren't digits or minus
            value = value.replace(/[^\d-]/g, '');
            
            // Handle minus signs: only allow one at the beginning
            if (value.includes('-')) {
                // Remove all minus signs
                const digitsOnly = value.replace(/-/g, '');
                // Add back one minus at the start if there was one
                if (value.indexOf('-') === 0) {
                    value = '-' + digitsOnly;
                } else {
                    value = digitsOnly;
                }
            }
            
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
