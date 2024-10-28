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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    initializeBotTypeSelection();
    setupEventListeners();
    checkMockMode();
    
    // Add this to handle back navigation
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.step) {
            showStep(event.state.step);
        }
    });
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

// Bot Type Selection
function initializeBotTypeSelection() {
    const formContent = document.getElementById('formContent');
    if (!formContent) return;

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
                
                // Add selection to clicked plan
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

    } catch (error) {
        console.error('Deployment error:', error);
        showToast('Deployment failed: ' + error.message, 'error');
        showDeploymentError(error.message);
    }
}

// Initialize progress steps
function initializeProgressSteps() {
    const steps = [
        { title: 'Initializing', description: 'Setting up deployment environment' },
        { title: 'Creating Knowledge Base', description: 'Building AI knowledge base' },
        { title: 'Training Model', description: 'Training AI model with your data' },
        { title: 'Cloud Setup', description: 'Setting up cloud infrastructure' },
        { title: 'Final Configuration', description: 'Configuring your AI receptionist' }
    ];

    const progressContainer = document.getElementById('progressSteps');
    if (!progressContainer) return;

    progressContainer.innerHTML = steps.map((step, index) => `
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
    `).join('');
}

// Start event stream for deployment updates
function startEventStream(requestId) {
    if (state.eventSource) {
        state.eventSource.close();
    }

    const token = localStorage.getItem('token');
    state.eventSource = new EventSource(`/create-bot?requestId=${requestId}&token=${token}`);

    state.eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleDeploymentUpdate(data);
    };

    state.eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        state.eventSource.close();
        showToast('Lost connection to deployment server', 'error');
    };
}

// Handle deployment updates
function handleDeploymentUpdate(data) {
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
function updateProgressStep(data) {
    const steps = document.querySelectorAll('.progress-step');
    const currentStep = Array.from(steps).find(step => {
        const title = step.querySelector('h4').textContent;
        return title.toLowerCase().includes(data.status.toLowerCase());
    });

    if (currentStep) {
        // Update progress bar
        const progressBar = currentStep.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${data.progress || 0}%`;
        }

        // Update step status
        steps.forEach(step => step.classList.remove('active'));
        currentStep.classList.add('active');

        // Mark previous steps as completed
        let prevStep = currentStep.previousElementSibling;
        while (prevStep) {
            prevStep.classList.add('completed');
            prevStep.querySelector('.progress-bar').style.width = '100%';
            prevStep = prevStep.previousElementSibling;
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
                                <span class="text-sm font-medium text-gray-700">
                                    <i class="fas fa-phone-alt text-koko-purple-500 mr-2"></i>
                                    Phone Number
                                </span>
                                <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedPhoneNumber">
                                    ${data.phoneNumber}
                                </span>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">
                                    <i class="fas fa-globe text-koko-purple-500 mr-2"></i>
                                    Service URL
                                </span>
                                <a href="${data.serviceUrl}" target="_blank" 
                                   class="text-sm font-mono text-koko-purple-600 hover:text-koko-purple-700 bg-gray-50 px-3 py-1 rounded">
                                    ${data.serviceUrl.split('//')[1]}
                                </a>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">
                                    <i class="fas fa-user text-koko-purple-500 mr-2"></i>
                                    Username
                                </span>
                                <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedUsername">
                                    ${data.username}
                                </span>
                            </div>
                        </div>

                        <div class="bg-white p-4 rounded-lg border border-koko-purple-200 shadow-sm">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-gray-700">
                                    <i class="fas fa-key text-koko-purple-500 mr-2"></i>
                                    Password
                                </span>
                                <div class="flex items-center space-x-2">
                                    <span class="text-sm font-mono bg-gray-50 px-3 py-1 rounded" id="deployedPassword">
                                        ••••••••
                                    </span>
                                    <button onclick="togglePassword('deployed')" 
                                            class="text-koko-purple-600 hover:text-koko-purple-700">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Warning Message -->
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
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
                    <div class="flex justify-end space-x-4 mt-8">
                        <button onclick="copyCredentials()" 
                                class="flex items-center px-4 py-2 border border-koko-purple-200 rounded-lg text-koko-purple-600 hover:bg-koko-purple-50 transition-colors duration-200">
                            <i class="fas fa-copy mr-2"></i>
                            Copy Credentials
                        </button>
                        <button onclick="window.location.href='/dashboard#deployed-bots'" 
                                class="flex items-center px-4 py-2 bg-koko-purple-600 text-white rounded-lg hover:bg-koko-purple-700 transition-colors duration-200">
                            <i class="fas fa-robot mr-2"></i>
                            View Deployed Bots
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

// Add dashboard navigation
function viewDashboard() {
    window.location.href = '/dashboard';
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
