// Global state management
const state = {
    currentStep: 1,
    formData: {},
    selectedPlan: null,
    selectedAmount: 0,
    isDeploymentOngoing: false,
    currentRequestId: null,
    eventSource: null
};

// Quick test data
const quickTestData = {
    botType: 'Hotel',
    hotelName: 'Test Hotel Bot',
    email: 'test@example.com',
    hotelStars: '4',
    hotelRooms: '100',
    hotelAmenities: 'Pool, Spa, Restaurant, Gym',
    hotelDescription: 'A luxury test hotel in the heart of the city',
    hotelPolicies: 'Check-in: 3 PM, Check-out: 11 AM, No smoking'
};

// Add these constants at the top
const DEPLOYMENT_STORAGE_KEY = 'ongoing_deployment';
const DEPLOYMENT_PROGRESS_KEY = 'deployment_progress';
const DEPLOYMENT_EXPIRY_TIME = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// Initialize on page load
// Update the initialization code in the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    
    // Check URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const step = urlParams.get('step');
    const requestId = urlParams.get('requestId');
    
    if (step === '4' && requestId) {
        console.log('Found deployment in URL:', requestId);
        const deploymentData = localStorage.getItem(DEPLOYMENT_STORAGE_KEY);
        
        if (deploymentData) {
            try {
                const { formData, timestamp } = JSON.parse(deploymentData);
                const age = Date.now() - timestamp;
                
                // Only restore if deployment is less than 30 minutes old
                if (age < 30 * 60 * 1000) {
                    console.log('Restoring deployment state for requestId:', requestId);
                    state.formData = formData;
                    state.currentRequestId = requestId;
                    
                    // Skip to deployment step
                    updateStepIndicator(4);
                    
                    // Show deployment UI
                    showDeploymentUI();
                    
                    // Reconnect to SSE
                    const token = localStorage.getItem('token');
                    if (token) {
                        console.log('Reconnecting to SSE with requestId:', requestId);
                        startEventStream(requestId, token);
                    }
                } else {
                    console.log('Deployment state too old, starting fresh');
                    localStorage.removeItem(DEPLOYMENT_STORAGE_KEY);
                    initializeBotTypeSelection();
                }
            } catch (error) {
                console.error('Error restoring deployment state:', error);
                initializeBotTypeSelection();
            }
        } else {
            console.log('No deployment data found for requestId:', requestId);
            initializeBotTypeSelection();
        }
    } else {
        // Normal initialization
        initializeBotTypeSelection();
    }
    
    setupEventListeners();
    checkMockMode();
    setupQuickTest();
});

// Authentication check
async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (!token && process.env.IS_MOCK !== 'true') {
        window.location.href = '/login';
        return;
    }
    await updateUserDisplay();
}

async function updateUserDisplay() {
    try {
        const response = await fetch('/api/user', {
            headers: getRequestHeaders()
        });
        const userData = await response.json();
        
        const userSection = document.getElementById('userSection');
        const userName = document.getElementById('userName');

        if (userSection && userName && userData) {
            userSection.classList.remove('hidden');
            userName.textContent = userData.name || 'Guest User';
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        // Show guest user info instead of failing
        const userSection = document.getElementById('userSection');
        const userName = document.getElementById('userName');
        if (userSection && userName) {
            userSection.classList.remove('hidden');
            userName.textContent = 'Guest User';
        }
    }
}

// Update the createCompletionCard function to generate the completion card HTML
function createCompletionCard() {
    return `
        <div class="bg-gradient-to-br from-koko-purple-50 to-white p-8 rounded-xl shadow-xl border border-koko-purple-100">
            <div class="flex items-center justify-center mb-8">
                <div class="w-16 h-16 bg-koko-purple-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-check text-3xl text-koko-purple-600"></i>
                </div>
            </div>

            <h3 class="text-2xl font-bold text-center text-gray-900 mb-8">
                Your AI Receptionist is Ready! 🎉
            </h3>

            <div class="space-y-6">
                <!-- Credentials Section -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium text-gray-700">Phone Number</span>
                            <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedPhoneNumber"></span>
                        </div>
                    </div>

                    <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium text-gray-700">Service URL</span>
                            <a href="#" class="text-sm font-mono text-koko-purple-600 hover:text-koko-purple-700" id="deployedServiceUrl" target="_blank"></a>
                        </div>
                    </div>

                    <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium text-gray-700">Username</span>
                            <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedUsername"></span>
                        </div>
                    </div>

                    <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium text-gray-700">Password</span>
                            <div class="flex items-center space-x-2">
                                <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedPassword">••••••••</span>
                                <button onclick="togglePassword('deployed')" class="text-koko-purple-600 hover:text-koko-purple-700">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Warning Message -->
                <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-triangle text-yellow-400"></i>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-yellow-700">
                                Please save these credentials securely. They will not be shown again.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex justify-end space-x-4">
                    <button onclick="copyCredentials()" class="btn-secondary">
                        <i class="fas fa-copy mr-2"></i>
                        Copy Credentials
                    </button>
                    <button onclick="window.location.href='/dashboard'" class="btn-primary">
                        <i class="fas fa-tachometer-alt mr-2"></i>
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    `;
}


// Add this function near the top
function setupEventListeners() {
    // Add any global event listeners here
    console.log('Setting up event listeners');
}
// Update handleDeploymentComplete function
// Update the handleDeploymentComplete function
function handleDeploymentComplete(data) {
    console.log('Deployment completed with data:', data);
    
    // Get current state and update it
    const currentState = localStorage.getItem(DEPLOYMENT_STORAGE_KEY);
    const deploymentState = currentState ? JSON.parse(currentState) : {};
    
    // Update state while preserving lastKnownState
    const updatedState = {
        ...deploymentState,
        requestId: state.currentRequestId,
        formData: state.formData,
        completionData: data,
        timestamp: Date.now(),
        status: 'completed',
        lastKnownState: data // Store completion data as last known state too
    };
    
    localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(updatedState));
    
    // Get the deployment complete section
    const deploymentComplete = document.getElementById('deploymentComplete');
    if (!deploymentComplete) {
        console.error('Deployment complete section not found');
        // Try to find the formContent and add the deploymentComplete div if it doesn't exist
        const formContent = document.getElementById('formContent');
        if (formContent) {
            const deploymentCompleteDiv = document.createElement('div');
            deploymentCompleteDiv.id = 'deploymentComplete';
            deploymentCompleteDiv.className = 'mt-8';
            formContent.appendChild(deploymentCompleteDiv);
        }
        return;
    }

    console.log('Inserting completion card HTML');
    
    // Insert the completion card HTML
    deploymentComplete.innerHTML = createCompletionCard();

    // Update the credential values
    if (data.serviceUrl) {
        const serviceUrlElement = document.getElementById('deployedServiceUrl');
        if (serviceUrlElement) {
            serviceUrlElement.href = data.serviceUrl;
            serviceUrlElement.textContent = new URL(data.serviceUrl).hostname;
        }
    }

    if (data.phoneNumber) {
        const phoneElement = document.getElementById('deployedPhoneNumber');
        if (phoneElement) {
            phoneElement.textContent = data.phoneNumber;
        }
    }

    if (data.username) {
        const usernameElement = document.getElementById('deployedUsername');
        if (usernameElement) {
            usernameElement.textContent = data.username;
        }
    }

    if (data.password) {
        window.deployedPassword = data.password;
        const passwordElement = document.getElementById('deployedPassword');
        if (passwordElement) {
            passwordElement.textContent = '••••••••';
        }
    }

    // Force display block and remove hidden class
    deploymentComplete.style.removeProperty('display');
    deploymentComplete.classList.remove('hidden');

    // Debug log
    console.log('Deployment complete element:', deploymentComplete);
    console.log('Display style:', deploymentComplete.style.display);
    console.log('Classes:', deploymentComplete.className);

    // Make sure parent containers are visible
    let parent = deploymentComplete.parentElement;
    while (parent) {
        parent.classList.remove('hidden');
        if (parent.style) {
            parent.style.removeProperty('display');
        }
        console.log('Parent element:', parent);
        console.log('Parent display:', parent.style.display);
        parent = parent.parentElement;
    }

    // Scroll to the completion section
    setTimeout(() => {
        deploymentComplete.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    // Show success toast
    showToast('Deployment completed successfully!', 'success');

    // Update all progress steps to completed state
    const steps = document.querySelectorAll('.progress-step');
    steps.forEach(step => {
        step.classList.add('completed');
        step.classList.remove('active');
        const progressBar = step.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = '100%';
        }
    });

    // Start celebration effect
    startCelebration();

    console.log('Deployment completion handler finished');
}
function togglePassword(type) {
    const passwordElement = document.getElementById(`${type}Password`);
    const passwordValue = window[`${type}Password`];
    
    if (passwordElement.textContent === '••••••••') {
        passwordElement.textContent = passwordValue;
    } else {
        passwordElement.textContent = '••••••••';
    }
}
// Bot Type Selection
function initializeBotTypeSelection() {
    const formContent = document.getElementById('formContent');
    if (!formContent) return;

    // Preserve the quick test button if it exists
    const quickTestButton = formContent.querySelector('#quickTestButton')?.parentElement;
    
    const botTypes = [
        {
            id: 'hotel',
            title: 'Hotel Receptionist',
            description: 'Perfect for hotels, resorts, and hospitality businesses',
            icon: 'hotel'
        },
        {
            id: 'hospital',
            title: 'Hospital Receptionist',
            description: 'Ideal for hospitals, clinics, and healthcare facilities',
            icon: 'hospital'
        },
        {
            id: 'custom',
            title: 'Custom Assistant',
            description: 'Build a custom AI receptionist for any industry',
            icon: 'robot'
        }
    ];

    formContent.innerHTML = `
        <!-- Quick Test Button -->
        <div class="mb-8 text-center">
            <button id="quickTestButton" class="bg-koko-purple-100 text-koko-purple-700 px-6 py-3 rounded-lg hover:bg-koko-purple-200 transition-colors duration-200 flex items-center mx-auto">
                <i class="fas fa-bolt mr-2"></i>
                Quick Test Deployment
                <span class="text-xs ml-2 text-koko-purple-600">(Hotel Bot)</span>
            </button>
        </div>

        <!-- Bot Type Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${botTypes.map(type => `
                <div class="bot-type-card cursor-pointer border border-gray-200 p-6 hover:border-koko-purple-600 transition-all"
                     data-type="${type.id}">
                    <div class="w-12 h-12 bg-koko-purple-100 flex items-center justify-center mb-4">
                        <i class="fas fa-${type.icon} text-xl text-koko-purple-600"></i>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900">${type.title}</h3>
                    <p class="mt-2 text-gray-600">${type.description}</p>
                </div>
            `).join('')}
        </div>
    `;

    // Add event listeners after setting innerHTML
    setupQuickTest(); // Re-attach quick test button listener
    formContent.querySelectorAll('.bot-type-card').forEach(card => {
        card.addEventListener('click', () => handleBotTypeSelection(card));
    });
}

function handleBotTypeSelection(card) {
    // Remove selection from all cards
    document.querySelectorAll('.bot-type-card').forEach(c => 
        c.classList.remove('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600'));
    
    // Add selection to clicked card
    card.classList.add('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600');
    
    // Store selected type
    state.formData.botType = card.dataset.type;
    
    // Show continue button
    showContextAction('Continue to Configuration', () => showConfigurationForm(card.dataset.type));
}

// Configuration Forms
function showConfigurationForm(botType) {
    const formContent = document.getElementById('formContent');
    
    // Load appropriate form template
    const formTemplate = getFormTemplate(botType);
    formContent.innerHTML = formTemplate;
    
    // Update step indicator
    updateStepIndicator(2);
    
    // Initialize form event listeners
    setupFormEventListeners();
    
    // Show back button in context bar
    showContextAction(
        'Continue to Plan Selection',
        () => validateAndContinue(),
        'Back to Bot Type',
        () => {
            initializeBotTypeSelection();
            updateStepIndicator(1);
        }
    );
    
    // Update preview with empty form data
    updateLivePrompt();
}

function getFormTemplate(botType) {
    switch (botType) {
        case 'hotel':
            return createHotelForm();
        case 'hospital':
            return createHospitalForm();
        case 'custom':
            return createCustomForm();
        default:
            return '';
    }
}

// Form Templates
function createHotelForm() {
    return `
        <form id="configForm" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="col-span-2">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Hotel Information</h3>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700">Hotel Name</label>
                    <input type="text" name="hotelName" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" name="email" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Star Rating</label>
                    <select name="hotelStars" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                        <option value="">Select rating</option>
                        <option value="3">3 Stars</option>
                        <option value="4">4 Stars</option>
                        <option value="5">5 Stars</option>
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Number of Rooms</label>
                    <input type="number" name="hotelRooms" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Amenities</label>
                    <input type="text" name="hotelAmenities" placeholder="e.g., Pool, Spa, Restaurant (comma-separated)"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Hotel Description</label>
                    <textarea name="hotelDescription" rows="3"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none"></textarea>
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Hotel Policies</label>
                    <textarea name="hotelPolicies" rows="3"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none"></textarea>
                </div>
            </div>
        </form>
    `;
}

// Add these functions to handle form templates and prompt generation

function createHospitalForm() {
    return `
        <form id="configForm" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="col-span-2">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Hospital Information</h3>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700">Hospital Name</label>
                    <input type="text" name="hospitalName" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" name="email" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Hospital Type</label>
                    <select name="hospitalType" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                        <option value="">Select type</option>
                        <option value="general">General Hospital</option>
                        <option value="specialized">Specialized Hospital</option>
                        <option value="teaching">Teaching Hospital</option>
                        <option value="clinic">Clinic</option>
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Number of Beds</label>
                    <input type="number" name="hospitalBeds" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Departments</label>
                    <input type="text" name="hospitalDepartments" placeholder="e.g., Emergency, Cardiology, Pediatrics (comma-separated)"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Services</label>
                    <textarea name="hospitalServices" rows="3" placeholder="List main hospital services"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none"></textarea>
                </div>
            </div>
        </form>
    `;
}

function createCustomForm() {
    return `
        <form id="configForm" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="col-span-2">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Custom Assistant Configuration</h3>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700">Assistant Name</label>
                    <input type="text" name="assistantName" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Email</label>
                    <input type="email" name="email" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Industry</label>
                    <input type="text" name="customIndustry" required placeholder="e.g., Retail, Education, Technology"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Preferred Tone</label>
                    <select name="customTone" required
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none">
                        <option value="">Select tone</option>
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="casual">Casual</option>
                        <option value="formal">Formal</option>
                    </select>
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Assistant's Purpose</label>
                    <textarea name="customPurpose" rows="3" placeholder="Describe the main purpose of your AI assistant"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none"></textarea>
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Knowledge Base</label>
                    <textarea name="customKnowledgeBase" rows="3" placeholder="Enter key information for your assistant"
                        class="mt-1 block w-full border border-gray-300 px-3 py-2 focus:border-koko-purple-500 focus:outline-none"></textarea>
                </div>
            </div>
        </form>
    `;
}

// Prompt generation functions
function generatePrompt(data) {
    switch (data.botType) {
        case 'hotel':
            return generateHotelPrompt(data);
        case 'hospital':
            return generateHospitalPrompt(data);
        case 'custom':
            return generateCustomPrompt(data);
        default:
            return 'Select a bot type to see the preview...';
    }
}

function generateHotelPrompt(data) {
    return `You are the AI receptionist for ${data.hotelName || '[Hotel Name]'}.
Your role is to handle guest inquiries and provide excellent service.

Email: ${data.email || '[Email]'}
Additional Details: ${data.additionalDetails || '[No additional details provided]'}

You should:
- Be professional and courteous
- Handle reservations and inquiries
- Provide information about hotel amenities
- Address guest concerns promptly`;
}

function generateHospitalPrompt(data) {
    return `You are the AI receptionist for ${data.hospitalName || '[Hospital Name]'}.
Your role is to assist patients and visitors with their inquiries.

Email: ${data.email || '[Email]'}
Additional Details: ${data.additionalDetails || '[No additional details provided]'}

You should:
- Be compassionate and professional
- Direct patients to appropriate departments
- Handle appointment inquiries
- Provide general facility information`;
}

function generateCustomPrompt(data) {
    return `You are ${data.assistantName || '[Assistant Name]'}, 
a custom AI receptionist.

Email: ${data.email || '[Email]'}
Additional Details: ${data.additionalDetails || '[No additional details provided]'}

You should:
- Maintain professional communication
- Handle specific industry requirements
- Provide relevant information
- Address inquiries efficiently`;
}

// Step Management
function updateStepIndicator(stepNumber) {
    document.querySelectorAll('[data-step]').forEach(step => {
        const isActive = parseInt(step.dataset.step) === stepNumber;
        step.classList.toggle('active', isActive);
        const numberDiv = step.querySelector('div');
        if (isActive) {
            numberDiv.classList.remove('bg-gray-200', 'text-gray-600');
            numberDiv.classList.add('bg-koko-purple-600', 'text-white');
        } else {
            numberDiv.classList.add('bg-gray-200', 'text-gray-600');
            numberDiv.classList.remove('bg-koko-purple-600', 'text-white');
        }
    });
    state.currentStep = stepNumber;
}

// Context Actions
function showContextAction(nextText, nextAction, backText, backAction) {
    const contextBar = document.getElementById('contextActions');
    contextBar.innerHTML = `
        <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            ${backText ? `
                <button class="btn-secondary" onclick="handleBackAction()">
                    <i class="fas fa-arrow-left mr-2"></i>
                    ${backText}
                </button>
            ` : '<div></div>'}
            <button class="btn-primary" onclick="handleNextAction()">
                ${nextText}
                <i class="fas fa-arrow-right ml-2"></i>
            </button>
        </div>
    `;
    contextBar.classList.remove('hidden');
    window.handleNextAction = nextAction;
    if (backAction) window.handleBackAction = backAction;
}

// Form Validation and Navigation
function validateAndContinue() {
    const form = document.getElementById('configForm');
    if (!form) return;

    if (form.checkValidity()) {
        const formData = new FormData(form);
        // Store form data with proper naming
        state.formData = {
            ...state.formData,
            ...Object.fromEntries(formData.entries()),
            // Ensure name is set based on the form type
            name: formData.get('hotelName') || formData.get('hospitalName') || formData.get('assistantName')
        };
        showPlanSelection();
    } else {
        showToast('Please fill in all required fields', 'error');
        form.reportValidity();
    }
}

// Plan Selection
function showPlanSelection() {
    updateStepIndicator(3);
    const formContent = document.getElementById('formContent');
    const template = document.getElementById('planSelectionTemplate');
    if (template) {
        formContent.innerHTML = template.innerHTML;
        initializePricingToggle();
        setupPlanSelectionListeners();
    }
}

function initializePricingToggle() {
    const toggle = document.getElementById('pricingToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            const isYearly = e.target.checked;
            document.querySelectorAll('[data-monthly]').forEach(element => {
                const monthlyPrice = element.dataset.monthly;
                const yearlyPrice = element.dataset.yearly;
                element.textContent = isYearly ? yearlyPrice : monthlyPrice;
            });
        });
    }
}

function setupPlanSelectionListeners() {
    document.querySelectorAll('[data-plan]').forEach(button => {
        button.addEventListener('click', (e) => {
            const selectedPlan = e.target.closest('[data-plan]');
            if (selectedPlan) {
                // Remove selection from all plans
                document.querySelectorAll('[data-plan]').forEach(plan => {
                    plan.classList.remove('border-koko-purple-600', 'ring-2');
                });
                
                // Add selection to clicked card
                selectedPlan.classList.add('border-koko-purple-600', 'ring-2');
                
                // Store selected plan data
                state.selectedPlan = selectedPlan.dataset.plan;
                state.selectedAmount = parseInt(selectedPlan.dataset.amount);
                
                // Show mock payment screen
                showMockPayment();
            }
        });
    });
}

// Continue with more functions for:
// - Plan selection handling
// - Payment processing
// - Deployment progress
// - Live preview updates
// - Error handling
// - etc.

// Add these utility functions
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 text-white ${
        type === 'error' ? 'bg-red-500' : 'bg-koko-purple-600'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getRequestHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// Add these event listener functions
function setupFormEventListeners() {
    const form = document.getElementById('configForm');
    if (form) {
        // Add submit handler
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            validateAndContinue();
        });

        // Add input handlers for live preview
        form.querySelectorAll('input, select, textarea').forEach(element => {
            element.addEventListener('input', () => {
                updateLivePrompt();
            });
        });
    }
}

function updateLivePrompt() {
    const livePrompt = document.getElementById('livePrompt');
    if (!livePrompt) return;

    const form = document.getElementById('configForm');
    if (!form) return;

    const formData = new FormData(form);
    const data = {
        ...Object.fromEntries(formData.entries()),
        botType: state.formData.botType
    };

    let promptText = generatePrompt(data);
    livePrompt.innerHTML = `<pre class="whitespace-pre-wrap">${promptText}</pre>`;
}

// Add these deployment-related functions

// Start deployment process
async function startDeployment() {
    try {
        // Extract data from formData
        const formData = state.formData;
        const botName = formData.hotelName || formData.hospitalName || formData.assistantName;
        const serviceName = sanitizeServiceName(botName);

        // Prepare the data in the format the backend expects
        const submissionData = {
            // Top-level required fields
            name: botName,
            serviceName: serviceName,
            botType: capitalizeFirstLetter(formData.botType),
            
            // Form data at top level (not nested)
            hotelName: formData.hotelName,
            hospitalName: formData.hospitalName,
            assistantName: formData.assistantName,
            email: formData.email,
            hotelStars: formData.hotelStars,
            hotelRooms: formData.hotelRooms,
            hotelAmenities: formData.hotelAmenities,
            hotelDescription: formData.hotelDescription,
            hotelPolicies: formData.hotelPolicies,
            
            // Additional fields
            plan: state.selectedPlan,
            amount: state.selectedAmount,
            
            // Generate the prompt
            finalPrompt: generatePrompt(formData),
            
            // Store full form data as additional info
            additionalInfo: JSON.stringify({
                ...formData,
                plan: state.selectedPlan,
                amount: state.selectedAmount
            })
        };

        console.log('Submitting deployment data:', submissionData);

        // Create bot with initial progress update
        const response = await fetch('/create-bot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(submissionData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to start deployment');
        }

        const { requestId } = await response.json();
        state.currentRequestId = requestId;

        // Start listening for deployment updates
        startEventStream(requestId);

        // Show deployment progress UI
        const formContent = document.getElementById('formContent');
        formContent.innerHTML = `
            <div class="space-y-8" id="progressSteps">
                <!-- Progress steps will be inserted here -->
            </div>

            <!-- Deployment Complete Section -->
            <div id="deploymentComplete" class="hidden mt-8">
                <!-- Completion content will be inserted here -->
            </div>
        `;

        // Initialize progress steps
        initializeProgressSteps();

        // Store initial deployment state
        const deploymentState = {
            requestId,
            formData: state.formData,
            timestamp: Date.now(),
            status: 'in_progress'
        };
        localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(deploymentState));

    } catch (error) {
        console.error('Deployment error:', error);
        showToast('Deployment failed: ' + error.message, 'error');
        showDeploymentError(error.message);
    }
}

// Update the progress steps HTML
// Update the connection status HTML
// Update the progress steps HTML
function initializeProgressSteps() {
    const progressContainer = document.getElementById('progressSteps');
    if (!progressContainer) return;

    // Create the main container
    progressContainer.innerHTML = `
        <!-- Connection Status Indicator -->
        <div id="connectionStatus" class="connection-status hidden">
            <div class="connection-pulse"></div>
            <div class="connection-message">
                <span class="font-medium">Live Connection</span>
                <span class="loading-dots">Processing</span>
            </div>
            <div class="connection-time" id="elapsedTime">0:00</div>
        </div>

        <!-- Progress Steps -->
        ${[
            { title: 'Initializing', description: 'Setting up deployment environment' },
            { title: 'Creating Knowledge Base', description: 'Building AI knowledge base' },
            { title: 'Training Model', description: 'Training AI model with your data' },
            { title: 'Cloud Setup', description: 'Setting up cloud infrastructure' },
            { title: 'Final Configuration', description: 'Configuring your AI receptionist' }
        ].map((step, index) => `
            <div class="progress-step ${index === 0 ? 'active' : ''}" data-step="${index}">
                <div class="flex items-center">
                    <div class="w-8 h-8 bg-gray-200 text-gray-600 flex items-center justify-center">
                        ${index + 1}
                    </div>
                    <div class="ml-4">
                        <h4 class="font-medium text-gray-900">${step.title}</h4>
                        <p class="text-sm text-gray-500">${step.description}</p>
                    </div>
                </div>
                <div class="mt-2 relative pt-1">
                    <div class="overflow-hidden h-2 text-xs flex bg-gray-200">
                        <div class="progress-bar w-0 shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-koko-purple-600 transition-all duration-500"></div>
                    </div>
                </div>
            </div>
        `).join('')}
    `;

    // Initialize elapsed time counter
    startTime = Date.now();
    setInterval(updateElapsedTime, 1000);
}
// Add elapsed time tracking
let startTime;
function updateElapsedTime() {
    const elapsedTimeElement = document.getElementById('elapsedTime');
    if (!elapsedTimeElement || !startTime) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    elapsedTimeElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} elapsed`;
}

// Start event stream for deployment updates
function startEventStream(requestId) {
    if (state.eventSource) {
        state.eventSource.close();
    }

    const token = localStorage.getItem('token');
    state.eventSource = createEventSource(requestId, token);
}

// Add this function to show live connection status
function updateConnectionStatus(isActive) {
    const statusIndicator = document.getElementById('connectionStatus');
    if (!statusIndicator) return;

    if (isActive) {
        statusIndicator.classList.remove('hidden');
        statusIndicator.classList.add('connection-active');
    } else {
        statusIndicator.classList.remove('connection-active');
        statusIndicator.classList.add('hidden');
    }
}

// Update createEventSource to handle connection status
function createEventSource(requestId, token) {
    console.log('Creating EventSource for requestId:', requestId);
    const url = `/create-bot?requestId=${requestId}&token=${token}`;
    const eventSource = new EventSource(url);
    
    let retryCount = 0;
    const maxRetries = 3;
    let isCompleted = false;
    let lastHeartbeat = Date.now();
    let retryTimeout = null;
    
    // Update connection status with state
    function updateConnectionStatusWithState(state, message) {
        const statusIndicator = document.getElementById('connectionStatus');
        if (!statusIndicator) return;

        const messageElement = statusIndicator.querySelector('.connection-message');
        if (messageElement) {
            messageElement.innerHTML = `
                <span class="font-medium">${state}</span>
                <span class="loading-dots">${message || ''}</span>
            `;
        }

        statusIndicator.className = 'connection-status';
        switch (state) {
            case 'Connected':
                statusIndicator.classList.add('connection-active');
                break;
            case 'Retrying':
                statusIndicator.classList.add('connection-warning');
                break;
            case 'Failed':
                statusIndicator.classList.add('connection-error');
                break;
        }
        statusIndicator.classList.remove('hidden');
    }
    
    // Set up heartbeat checker immediately
    const heartbeatChecker = setInterval(() => {
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
        if (timeSinceLastHeartbeat < 20000) {
            updateConnectionStatusWithState('Connected', 'Server responding');
        } else {
            updateConnectionStatusWithState('Warning', 'Waiting for server response');
        }
    }, 1000);

    eventSource.onmessage = (event) => {
        lastHeartbeat = Date.now();
        try {
            // Handle empty heartbeat
            if (!event.data) {
                console.log('Received heartbeat');
                return;
            }

            const data = JSON.parse(event.data);
            console.log('SSE update received:', data);
            
            // Always store the latest state first, before processing
            const currentState = localStorage.getItem(DEPLOYMENT_STORAGE_KEY);
            const deploymentState = currentState ? JSON.parse(currentState) : {};
            
            // Update with latest data while preserving existing info
            const updatedState = {
                ...deploymentState,
                requestId: state.currentRequestId,
                formData: state.formData,
                timestamp: Date.now(),
                lastKnownState: data // Store every update as last known state
            };

            if (data.status === 'heartbeat') {
                // Format the heartbeat message to include elapsed time
                const message = data.message || `Build in progress - ${data.elapsedMinutes}m elapsed`;
                const heartbeatData = {
                    ...data,
                    message,
                    stage: message // Add stage property for consistency
                };
                
                updateConnectionStatusWithState('Connected', message);
                updateProgressStep(heartbeatData); // Pass the formatted heartbeat data
                localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(updatedState));
                return;
            }

            if (data.status === 'completed') {
                isCompleted = true;
                clearInterval(heartbeatChecker);
                updateConnectionStatusWithState('Connected', 'Deployment complete');
                console.log('Calling handleDeploymentComplete with data:', data);
                
                // Update state with completion data but preserve lastKnownState
                updatedState.status = 'completed';
                updatedState.completionData = data;
                localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(updatedState));
                
                handleDeploymentComplete(data);
                eventSource.close();
            } else if (data.error) {
                clearInterval(heartbeatChecker);
                updateConnectionStatusWithState('Failed', data.error);
                updatedState.status = 'error';
                updatedState.error = data.error;
                localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(updatedState));
                showDeploymentError(data.error);
                eventSource.close();
            } else {
                // Store progress state
                updatedState.status = 'in_progress';
                localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify(updatedState));
                updateProgressStep(data);
            }
        } catch (error) {
            console.error('Error processing SSE message:', error);
        }
    };

    eventSource.onopen = () => {
        console.log('SSE connection opened');
        retryCount = 0; // Reset retry count on successful connection
        updateConnectionStatusWithState('Connected', 'Server connected');
    };

    eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        
        if (isCompleted) {
            clearInterval(heartbeatChecker);
            eventSource.close();
            return;
        }

        // Clear any existing retry timeout
        if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = null;
        }

        if (retryCount < maxRetries) {
            retryCount++;
            updateConnectionStatusWithState('Retrying', `Attempt ${retryCount}/${maxRetries}`);
            console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
            
            // Close current connection before retrying
            eventSource.close();
            
            retryTimeout = setTimeout(() => {
                if (!isCompleted) {
                    // Create new EventSource instance
                    state.eventSource = createEventSource(requestId, token);
                }
            }, 2000 * retryCount); // Exponential backoff
        } else {
            clearInterval(heartbeatChecker);
            updateConnectionStatusWithState('Failed', 'Connection lost - Please refresh page');
            console.error('Max retries reached, giving up');
            if (!isCompleted) {
                showDeploymentError('Lost connection to deployment server - Please refresh page');
            }
            eventSource.close();
        }
    };

    return eventSource;
}

// Handle deployment updates
function handleDeploymentUpdate(data) {
    if (!startTime) {
        startTime = Date.now();
        setInterval(updateElapsedTime, 1000);
    }
    console.log('Deployment update:', data);

    if (data.error) {
        showDeploymentError(data.error);
        return;
    }

    if (data.status === 'completed') {
        showDeploymentComplete(data);
        return;
    }

    updateProgressStep(data);
}

// Update progress step
function updateProgressStep(data, isRestoration = false) {
    console.log('Updating progress step:', data);
    
    // Skip temp service updates in UI
    if (data.isTemp) {
        return;
    }

    // Handle heartbeat messages
    if (data.status === 'heartbeat') {
        // Find the currently active step
        const activeStep = document.querySelector('.progress-step.active');
        if (activeStep) {
            const description = activeStep.querySelector('p');
            if (description && data.message) {
                // Update the stage description with the heartbeat message
                description.textContent = data.message;
            }
            
            // Update progress bar if provided
            if (data.progress !== undefined) {
                const progressBar = activeStep.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${data.progress}%`;
                }
            }
        }
        return;
    }

    // Store this progress update if it's not a restoration
    if (!isRestoration) {
        const progressData = localStorage.getItem(DEPLOYMENT_PROGRESS_KEY);
        let progress = progressData ? JSON.parse(progressData) : { updates: [] };
        // Add timestamp to the update
        progress.updates.push({
            ...data,
            timestamp: Date.now()
        });
        localStorage.setItem(DEPLOYMENT_PROGRESS_KEY, JSON.stringify(progress));
    }

    const steps = document.querySelectorAll('.progress-step');
    let currentStep;

    // Map status to step index to ensure correct order
    const stepOrder = {
        'Initializing': 0,
        'Creating Knowledge Base': 1,
        'Training Model': 2,
        'Cloud Setup': 3,
        'Final Configuration': 4,
        'Deployment': 4 // Map Deployment status to Final Configuration step
    };

    if (data.status === 'Final Configuration' || data.status === 'Deployment') {
        currentStep = steps[4]; // Always use the last step
        
        // Remove active class from all steps
        steps.forEach(step => step.classList.remove('active'));
        // Add active class to current step
        currentStep.classList.add('active');
        
        const progressBar = currentStep.querySelector('.progress-bar');
        if (progressBar) {
            const progress = data.progress || 0;
            progressBar.style.width = `${progress}%`;
            
            // Update description if available
            const description = currentStep.querySelector('p');
            if (description && data.stage) {
                description.textContent = data.stage;
            }
        }

        // Mark previous steps as completed
        steps.forEach((step, index) => {
            if (index < 4) { // All steps before Final Configuration
                step.classList.add('completed');
                const prevProgressBar = step.querySelector('.progress-bar');
                if (prevProgressBar) {
                    prevProgressBar.style.width = '100%';
                }
            }
        });
    } else {
        const stepIndex = stepOrder[data.status];
        if (typeof stepIndex !== 'undefined') {
            currentStep = steps[stepIndex];
            
            // Remove active class from all steps
            steps.forEach(step => step.classList.remove('active'));
            // Add active class to current step
            currentStep.classList.add('active');
            
            // Update progress bar
            const progressBar = currentStep.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${data.progress}%`;
            }

            // Update step status
            steps.forEach((step, index) => {
                if (index < stepIndex) {
                    step.classList.add('completed');
                    const prevProgressBar = step.querySelector('.progress-bar');
                    if (prevProgressBar) {
                        prevProgressBar.style.width = '100%';
                    }
                }
            });
        }
    }
}
// Show deployment complete
function showDeploymentComplete(data) {
    // Update all progress steps to completed
    const steps = document.querySelectorAll('.progress-step');
    steps.forEach(step => {
        step.classList.add('completed');
        step.querySelector('.progress-bar').style.width = '100%';
    });

    // Show completion section with enhanced UI
    const completionSection = document.getElementById('deploymentComplete');
    if (completionSection) {
        completionSection.classList.remove('hidden');
        completionSection.innerHTML = `
            <div class="bg-gradient-to-br from-koko-purple-50 to-white p-8 rounded-xl shadow-xl border border-koko-purple-100">
                <div class="flex items-center justify-center mb-8">
                    <div class="w-16 h-16 bg-koko-purple-100 rounded-full flex items-center justify-center">
                        <i class="fas fa-check text-3xl text-koko-purple-600"></i>
                    </div>
                </div>

                <h3 class="text-2xl font-bold text-center text-gray-900 mb-8">
                    Your AI Receptionist is Ready! 🎉
                </h3>

                <div class="space-y-6">
                    <!-- Credentials Section -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">Phone Number</span>
                                <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedPhoneNumber"></span>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">Service URL</span>
                                <a href="#" class="text-sm font-mono text-koko-purple-600 hover:text-koko-purple-700" id="deployedServiceUrl" target="_blank"></a>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">Username</span>
                                <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedUsername"></span>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">Password</span>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedPassword">••••••••</span>
                                    <button onclick="togglePassword('deployed')" class="text-koko-purple-600 hover:text-koko-purple-700">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Warning Message -->
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <i class="fas fa-exclamation-triangle text-yellow-400"></i>
                            </div>
                            <div class="ml-3">
                                <p class="text-sm text-yellow-700">
                                    Please save these credentials securely. They will not be shown again.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-4">
                        <button onclick="copyCredentials()" class="btn-secondary">
                            <i class="fas fa-copy mr-2"></i>
                            Copy Credentials
                        </button>
                        <button onclick="window.location.href='/dashboard'" class="btn-primary">
                            <i class="fas fa-tachometer-alt mr-2"></i>
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Store password for toggle functionality
        window.deployedPassword = data.password;
        
        // Trigger celebration effect
        startCelebration();
    }

    // Close event stream
    if (state.eventSource) {
        state.eventSource.close();
    }

    // Show success toast
    showToast('Deployment completed successfully!', 'success');
}

// Show deployment error
function showDeploymentError(error) {
    // Clean up deployment storage
    localStorage.removeItem(DEPLOYMENT_STORAGE_KEY);
    
    const errorMessage = document.createElement('div');
    errorMessage.className = 'bg-red-50 border-l-4 border-red-500 p-4 my-4';
    errorMessage.innerHTML = `
        <div class="flex">
            <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                </svg>
            </div>
            <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">Deployment Failed</h3>
                <p class="text-sm text-red-700 mt-1">${error}</p>
            </div>
        </div>
    `;

    const progressContainer = document.getElementById('progressSteps');
    if (progressContainer) {
        progressContainer.appendChild(errorMessage);
    }

    // Close event stream
    if (state.eventSource) {
        state.eventSource.close();
    }

    showToast('Deployment failed', 'error');
}

// Utility function to generate random string
function generateRandomString() {
    return Math.random().toString(36).substring(2, 8);
}

// Add password toggle functionality
function togglePassword(type) {
    const passwordElement = document.getElementById(`${type}Password`);
    const passwordValue = window.deployedPassword;
    
    if (passwordElement.textContent === '••••••••') {
        passwordElement.textContent = passwordValue;
    } else {
        passwordElement.textContent = '••••••••';
    }
}

// Add copy credentials functionality
function copyCredentials() {
    const credentials = {
        'Phone Number': document.getElementById('deployedPhoneNumber').textContent,
        'Service URL': document.getElementById('deployedServiceUrl').textContent,
        'Username': document.getElementById('deployedUsername').textContent,
        'Password': window.deployedPassword
    };

    const text = Object.entries(credentials)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

    navigator.clipboard.writeText(text)
        .then(() => showToast('Credentials copied to clipboard', 'success'))
        .catch(() => showToast('Failed to copy credentials', 'error'));
}

// Update the plan selection handler
function selectPlan(e) {
    const button = e.currentTarget;
    const selectedPlan = button.closest('[data-plan]');
    if (selectedPlan) {
        // Remove selection from all cards
        document.querySelectorAll('[data-plan]').forEach(plan => {
            plan.classList.remove('border-koko-purple-600', 'ring-2');
        });
        
        // Add selection to clicked card
        selectedPlan.classList.add('border-koko-purple-600', 'ring-2');
        
        // Store selected plan data
        state.selectedPlan = selectedPlan.dataset.plan;
        state.selectedAmount = parseInt(selectedPlan.dataset.amount);
        
        // Show mock payment screen
        showMockPayment();
    }
}

// Add mock payment screen
function showMockPayment() {
    const formContent = document.getElementById('formContent');
    formContent.innerHTML = `
        <div class="space-y-6">
            <div class="text-center">
                <h3 class="text-lg font-medium text-gray-900">Payment Confirmation</h3>
                <p class="mt-2 text-gray-600">Mock Payment Screen</p>
            </div>

            <div class="bg-gray-50 p-6 space-y-4">
                <div class="flex justify-between">
                    <span class="font-medium">Selected Plan:</span>
                    <span class="capitalize">${state.selectedPlan}</span>
                </div>
                <div class="flex justify-between">
                    <span class="font-medium">Amount:</span>
                    <span>€${(state.selectedAmount / 100).toFixed(2)}</span>
                </div>
            </div>

            <div class="flex justify-center space-x-4">
                <button onclick="handleMockPayment('success')" class="btn-primary px-8 py-3">
                    <i class="fas fa-check mr-2"></i>
                    Simulate Success
                </button>
                <button onclick="handleMockPayment('failure')" class="btn-secondary px-8 py-3">
                    <i class="fas fa-times mr-2"></i>
                    Simulate Failure
                </button>
            </div>
        </div>
    `;

    // Show back button in context bar
    showContextAction(
        null,
        null,
        'Back to Plan Selection',
        () => showPlanSelection()
    );
}

// Handle mock payment
function handleMockPayment(result) {
    if (result === 'success') {
        showToast('Payment successful', 'success');
        // Move to deployment step
        updateStepIndicator(4);
        showDeploymentStep();
    } else {
        showToast('Payment failed', 'error');
    }
}

// Add deployment step
function showDeploymentStep() {
    const formContent = document.getElementById('formContent');
    
    // Show deployment confirmation screen
    formContent.innerHTML = `
        <div class="space-y-6">
            <div class="text-center">
                <h3 class="text-lg font-medium text-gray-900">Ready to Deploy</h3>
                <p class="mt-2 text-gray-600">Review your configuration and start deployment</p>
            </div>

            <div class="bg-gray-50 p-6 space-y-4">
                <div class="flex justify-between">
                    <span class="font-medium">Bot Type:</span>
                    <span class="capitalize">${state.formData.botType}</span>
                </div>
                <div class="flex justify-between">
                    <span class="font-medium">Plan:</span>
                    <span class="capitalize">${state.selectedPlan}</span>
                </div>
                <div class="flex justify-between">
                    <span class="font-medium">Amount:</span>
                    <span>€${(state.selectedAmount / 100).toFixed(2)}</span>
                </div>
            </div>

            <div class="flex justify-center">
                <button onclick="startDeployment()" class="btn-primary px-8 py-3">
                    <i class="fas fa-rocket mr-2"></i>
                    Start Deployment
                </button>
            </div>
        </div>
    `;

    // Show back button in context bar
    showContextAction(
        null,
        null,
        'Back to Payment',
        () => showMockPayment()
    );
}

// Add utility functions
function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function sanitizeServiceName(name) {
    if (!name) return 'bot-' + generateRandomString();
    
    // Remove any non-alphanumeric characters except dashes
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    // Remove any leading or trailing dashes
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    // Ensure it doesn't start with 'goog'
    if (sanitized.startsWith('goog')) {
        sanitized = 'bot-' + sanitized;
    }
    // Add random suffix for uniqueness
    sanitized = `${sanitized}-${generateRandomString()}`;
    // Truncate to 63 characters if longer
    return sanitized.slice(0, 63);
}

function generateRandomString() {
    return Math.random().toString(36).substring(2, 8);
}

// Add this celebration function using Tsparticles
function startCelebration() {
    tsParticles.load("tsparticles", {
        fullScreen: {
            enable: true,
            zIndex: 1
        },
        particles: {
            number: {
                value: 0
            },
            color: {
                value: ["#7c3aed", "#8b5cf6", "#6d28d9", "#4c1d95"]
            },
            shape: {
                type: ["circle", "square", "star"],
                options: {}
            },
            opacity: {
                value: 1,
                animation: {
                    enable: true,
                    minimumValue: 0,
                    speed: 2,
                    startValue: "max",
                    destroy: "min"
                }
            },
            size: {
                value: 4,
                random: {
                    enable: true,
                    minimumValue: 2
                }
            },
            links: {
                enable: false
            },
            life: {
                duration: {
                    sync: true,
                    value: 5
                },
                count: 1
            },
            move: {
                enable: true,
                gravity: {
                    enable: true,
                    acceleration: 10
                },
                speed: { min: 10, max: 20 },
                decay: 0.1,
                direction: "none",
                straight: false,
                outModes: {
                    default: "destroy",
                    top: "none"
                }
            },
            rotate: {
                value: {
                    min: 0,
                    max: 360
                },
                direction: "random",
                animation: {
                    enable: true,
                    speed: 60
                }
            },
            tilt: {
                direction: "random",
                enable: true,
                value: {
                    min: 0,
                    max: 360
                },
                animation: {
                    enable: true,
                    speed: 60
                }
            },
            roll: {
                darken: {
                    enable: true,
                    value: 25
                },
                enable: true,
                speed: {
                    min: 15,
                    max: 25
                }
            },
            wobble: {
                distance: 30,
                enable: true,
                speed: {
                    min: -15,
                    max: 15
                }
            }
        },
        emitters: {
            life: {
                count: 1,
                duration: 0.1,
                delay: 0.4
            },
            rate: {
                delay: 0.1,
                quantity: 150
            },
            size: {
                width: 0,
                height: 0
            }
        }
    });

    // Clear particles after 3 seconds
    setTimeout(() => {
        tsParticles.destroy();
    }, 3000);
}

// Add this function to handle quick test setup
function setupQuickTest() {
    const quickTestButton = document.getElementById('quickTestButton');
    console.log('Setting up quick test button:', quickTestButton);
    if (quickTestButton) {
        quickTestButton.addEventListener('click', handleQuickTest);
        console.log('Quick test button event listener attached');
    }
}

// Add this function to handle quick test
async function handleQuickTest() {
    console.log('Quick test button clicked');
    
    // Store quick test data in state
    state.formData = { ...quickTestData };
    console.log('State updated with quick test data:', state.formData);
    
    try {
        console.log('Starting quick test deployment...');
        // Start deployment
        const response = await fetch('/create-bot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'x-session-settings': JSON.stringify({
                    isActive: true,
                    SKIP_PAYMENT: true,
                    IS_MOCK: false,
                    DISABLE_FAUX_TIMERS: true
                })
            },
            body: JSON.stringify(state.formData)
        });

        if (!response.ok) {
            throw new Error(`Failed to start deployment: ${response.statusText}`);
        }

        const { requestId } = await response.json();
        console.log('Received requestId:', requestId);
        state.currentRequestId = requestId;

        // Save deployment state
        localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify({
            requestId,
            formData: state.formData,
            timestamp: Date.now()
        }));

        // Update URL with requestId and step
        const baseUrl = window.location.pathname;
        const newUrl = `${baseUrl}?step=4&requestId=${requestId}`;
        window.history.pushState({ step: 4, requestId }, '', newUrl);

        // Skip to deployment step
        updateStepIndicator(4);
        
        // Show deployment progress UI
        showDeploymentUI();
        
        // Start listening for deployment updates
        startEventStream(requestId);

    } catch (error) {
        console.error('Quick test deployment error:', error);
        showToast('Deployment failed: ' + error.message, 'error');
    }
}

// Add this helper function to show deployment UI
function showDeploymentUI() {
    const formContent = document.getElementById('formContent');
    formContent.innerHTML = `
        <div class="space-y-8">
            <!-- Progress Steps Container -->
            <div id="progressSteps">
                <!-- Progress steps will be inserted here -->
            </div>

            <!-- Deployment Complete Section -->
            <div id="deploymentComplete" class="mt-8" style="display: none;">
                <!-- Completion content will be inserted here -->
            </div>
        </div>
    `;

    // Initialize progress steps
    initializeProgressSteps();
}

// Add function to check for ongoing deployment
function checkOngoingDeployment() {
    const deploymentData = localStorage.getItem(DEPLOYMENT_STORAGE_KEY);
    
    if (deploymentData) {
        try {
            const deploymentState = JSON.parse(deploymentData);
            const { requestId, formData, completionData, timestamp, status, lastKnownState } = deploymentState;
            const age = Date.now() - timestamp;
            
            // Clear if older than 12 hours
            if (age > DEPLOYMENT_EXPIRY_TIME) {
                console.log('Deployment state expired, clearing...');
                localStorage.removeItem(DEPLOYMENT_STORAGE_KEY);
                localStorage.removeItem(DEPLOYMENT_PROGRESS_KEY);
                initializeBotTypeSelection();
                return;
            }

            console.log('Found deployment state:', deploymentState);
            
            // Restore deployment state
            state.formData = formData;
            state.currentRequestId = requestId;
            
            // Skip to deployment step
            updateStepIndicator(4);
            
            // Show deployment UI
            showDeploymentUI();

            // If deployment was completed, show completion state
            if (status === 'completed' && completionData) {
                console.log('Restoring completed deployment state');
                handleDeploymentComplete(completionData);
                
                // Also update progress steps to show the journey
                if (lastKnownState) {
                    updateProgressStep(lastKnownState);
                }
                return;
            }
            
            // For in-progress deployments, show last known state
            if (lastKnownState) {
                console.log('Restoring last known state:', lastKnownState);
                updateProgressStep(lastKnownState);
            }
            
            // Reconnect to SSE
            const token = localStorage.getItem('token');
            if (token) {
                console.log('Reconnecting to SSE with requestId:', requestId);
                startEventStream(requestId, token);
            }
        } catch (error) {
            console.error('Error restoring deployment state:', error);
            localStorage.removeItem(DEPLOYMENT_STORAGE_KEY);
            localStorage.removeItem(DEPLOYMENT_PROGRESS_KEY);
            initializeBotTypeSelection();
        }
    }
}



