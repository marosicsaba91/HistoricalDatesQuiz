// *** IMPORTANT: YOUR APPS SCRIPT URL GOES HERE ***
// Use the URL you obtained after deploying your Code.gs script as a Web App (Access: Anyone).
const GS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxkB3hlgP07tZH-m6kQ_2sldUWpmKsNmlIq54PM4F5RXTAPMzugWK-S1G64q1VrD5-e7g/exec"; 

let currentQuestionIndex = 0;
let score = 0;
let shuffledData = [];

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

async function initializeQuiz() {
    const loadingElement = document.getElementById('loading-state');
    
    // Show loading state
    loadingElement.classList.remove('hidden');
    document.getElementById('quiz-content').classList.add('hidden');
    
    // Check for placeholder URL
    if (GS_WEB_APP_URL.includes("YOUR_APPS_SCRIPT_WEB_APP_URL_HERE")) {
        displayError("Please set the correct Apps Script Web App URL in script.js.");
        return;
    }

    try {
        // Fetch data from the deployed Apps Script URL
        const data = await fetchDataWithRetry(GS_WEB_APP_URL);
        
        // Shuffle data and start quiz
        shuffledData = shuffleArray(data.slice());
        loadingElement.classList.add('hidden');
        document.getElementById('quiz-content').classList.remove('hidden');
        
        if (shuffledData.length === 0) {
            displayError("Data loaded successfully, but the quiz list is empty. Check your Google Sheet data range and row count.");
            return;
        }

        loadQuestion();

    } catch (error) {
        displayError(`Data Load Error: ${error.message}`);
    }
}

function displayError(message) {
    const loadingElement = document.getElementById('loading-state');
    loadingElement.classList.remove('hidden');
    loadingElement.innerHTML = `
        <div class="text-center p-8 bg-red-50 border border-red-200 rounded-lg">
            <h2 class="text-xl font-bold text-red-700 mb-4">Error Loading Data</h2>
            <p class="text-sm text-red-600">${message}</p>
            <button id="restart-button" 
                    class="mt-4 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition duration-150"
                    onclick="window.location.reload()">
                Try Again
            </button>
        </div>
    `;
    document.getElementById('quiz-content').classList.add('hidden');
}


// --- Quiz Flow Logic ---

function loadQuestion() {
    if (currentQuestionIndex >= shuffledData.length) {
        showResults();
        return;
    }

    const currentEvent = shuffledData[currentQuestionIndex];
    document.getElementById('event-text').textContent = currentEvent[0];
    document.getElementById('score-display').textContent = `Score: ${score} / ${currentQuestionIndex}`;
    document.getElementById('feedback').textContent = "Enter the year (negative for BC)";
    document.getElementById('feedback').classList.remove('text-green-600', 'text-red-600');
    document.getElementById('feedback').classList.add('text-gray-500');
    document.getElementById('year-input').value = '';
    document.getElementById('year-input').focus();

    // Update progress bar
    const progress = (currentQuestionIndex / shuffledData.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

function checkAnswer() {
    const input = document.getElementById('year-input').value.trim();
    const currentEvent = shuffledData[currentQuestionIndex];
    const correctYear = currentEvent[1];
    const exactDate = currentEvent[2];
    const inputNumber = parseInt(input, 10);

    if (isNaN(inputNumber)) {
        document.getElementById('feedback').textContent = "Please enter a valid number.";
        document.getElementById('feedback').classList.remove('text-green-600', 'text-gray-500');
        document.getElementById('feedback').classList.add('text-red-600');
        return;
    }

    const isCorrect = inputNumber === correctYear;

    const feedbackElement = document.getElementById('feedback');
    feedbackElement.classList.remove('text-green-600', 'text-red-600', 'text-gray-500');

    if (isCorrect) {
        score++;
        feedbackElement.textContent = `Correct! ${Math.abs(correctYear)} ${correctYear < 0 ? 'BC' : 'AD'}${exactDate ? ' (' + exactDate + ')' : ''}`;
        feedbackElement.classList.add('text-green-600');
    } else {
        let yearString = Math.abs(correctYear);
        yearString += (correctYear < 0 ? ' BC' : ' AD');
        feedbackElement.textContent = `Incorrect. The correct year was ${yearString}${exactDate ? ' (' + exactDate + ')' : ''}`;
        feedbackElement.classList.add('text-red-600');
    }

    // Move to the next question after a brief delay
    document.getElementById('year-input').blur(); // Remove focus
    setTimeout(() => {
        currentQuestionIndex++;
        loadQuestion();
    }, 1500);
}

function showResults() {
    document.getElementById('quiz-content').innerHTML = `
        <div class="text-center p-8">
            <h2 class="text-3xl font-bold text-gray-800 mb-4">Quiz Finished!</h2>
            <p class="text-5xl font-extrabold text-blue-600">${score}/${shuffledData.length}</p>
            <p class="text-lg text-gray-600 mt-2">You scored ${score} out of ${shuffledData.length} events.</p>
            <button id="restart-button" 
                    class="mt-6 w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition duration-150 transform hover:scale-[1.02]"
                    onclick="window.location.reload()">
                Restart Quiz
            </button>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    initializeQuiz();
    
    // Event listeners attached to elements that exist in the DOM initially
    const checkButton = document.getElementById('check-button');
    const yearInput = document.getElementById('year-input');

    if (checkButton) {
        checkButton.addEventListener('click', checkAnswer);
    }
    
    if (yearInput) {
        yearInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                checkAnswer();
            }
        });
    }
});
