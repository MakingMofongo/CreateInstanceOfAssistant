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
    initializeForm();
    initializePricing();
    initializeSteps();
    setupEventListeners();
    checkMockMode();
});

// Authentication and User Management
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
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                ...getRequestHeaders()
            }
        });
        const userData = await response.json();
        
        const userSection = document.getElementById('userSection');
        const authButtons = document.getElementById('authButtons');
        const userName = document.getElementById('userName');

        if (userData.name) {
            userSection.classList.remove('hidden');
            authButtons.classList.add('hidden');
            userName.textContent = userData.name;
        } else {
            userSection.classList.add('hidden');
            authButtons.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}

// Mock Mode Check
async function checkMockMode() {
    try {
        const response = await fetch('/api/check-mock-mode');
        const { isMock } = await response.json();
        const indicator = document.getElementById('mockModeIndicator');
        if (isMock) {
            indicator.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error checking mock mode:', error);
    }
}

// Form Initialization and Management
function initializeForm() {
    const form = document.getElementById('createBotForm');
    if (!form) return;

    // Create bot type selection cards
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

    const typeSelection = document.createElement('div');
    typeSelection.className = 'grid grid-cols-1 md:grid-cols-3 gap-6';
    typeSelection.innerHTML = botTypes.map(type => `
        <div class="bot-type-card cursor-pointer border border-gray-200 p-6 hover:border-koko-purple-600 transition-all"
             data-type="${type.id}">
            <div class="w-12 h-12 bg-koko-purple-100 flex items-center justify-center mb-4">
                <i class="fas fa-${type.icon} text-xl text-koko-purple-600"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">${type.title}</h3>
            <p class="mt-2 text-gray-600">${type.description}</p>
        </div>
    `).join('');

    // Add click handlers
    typeSelection.querySelectorAll('.bot-type-card').forEach(card => {
        card.addEventListener('click', () => {
            // Remove selection from all cards
            typeSelection.querySelectorAll('.bot-type-card').forEach(c => 
                c.classList.remove('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600'));
            
            // Add selection to clicked card
            card.classList.add('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600');
            
            // Store selected type
            state.formData.botType = card.dataset.type;
            
            // Show continue button
            showContextAction('Continue to Configuration', () => showStep(2));
        });
    });

    form.appendChild(typeSelection);
}

// Step Management
function initializeSteps() {
    const steps = [
        { number: 1, label: 'Type' },
        { number: 2, label: 'Details' },
        { number: 3, label: 'Plan' },
        { number: 4, label: 'Deploy' }
    ];

    const stepsContainer = document.querySelector('[data-steps]');
    if (stepsContainer) {
        stepsContainer.innerHTML = steps.map(step => `
            <div class="step ${step.number === 1 ? 'active' : ''}" data-step="${step.number}">
                <div class="step-number">${step.number}</div>
                <div class="step-label">${step.label}</div>
            </div>
        `).join('');
    }
}

function showStep(stepNumber) {
    // Update step indicators
    const steps = document.querySelectorAll('[data-step]');
    steps.forEach(step => {
        const isActive = parseInt(step.dataset.step) === stepNumber;
        step.classList.toggle('active', isActive);
        if (isActive) {
            step.classList.add('bg-koko-purple-600', 'text-white');
        } else {
            step.classList.remove('bg-koko-purple-600', 'text-white');
        }
    });

    // Show/hide appropriate content
    if (stepNumber === 1) {
        // Show bot type selection
        document.getElementById('createBotForm').classList.remove('hidden');
        document.getElementById('pricing').classList.add('hidden');
        document.getElementById('deploymentProgress').classList.add('hidden');
    } else if (stepNumber === 2) {
        // Show pricing section
        document.getElementById('createBotForm').classList.add('hidden');
        document.getElementById('pricing').classList.remove('hidden');
        document.getElementById('deploymentProgress').classList.add('hidden');
        // Initialize pricing toggle if not already done
        initializePricing();
    } else if (stepNumber === 3) {
        // Show deployment progress
        document.getElementById('createBotForm').classList.add('hidden');
        document.getElementById('pricing').classList.add('hidden');
        document.getElementById('deploymentProgress').classList.remove('hidden');
        startDeployment();
    }

    state.currentStep = stepNumber;
}

// Pricing Management
function initializePricing() {
    const toggle = document.getElementById('pricingToggle');
    if (toggle) {
        toggle.addEventListener('change', updatePricing);
    }

    document.querySelectorAll('[data-plan]').forEach(button => {
        button.addEventListener('click', selectPlan);
    });
}

function updatePricing(e) {
    const isYearly = e.target.checked;
    const prices = {
        basic: { monthly: '49.99', yearly: '479.99' },
        professional: { monthly: '149.99', yearly: '1439.99' },
        enterprise: { monthly: '299.99', yearly: '2879.99' }
    };

    // Update all price displays
    document.querySelectorAll('[data-plan]').forEach(card => {
        const plan = card.getAttribute('data-plan');
        const priceElement = card.querySelector('.text-4xl');
        const periodElement = card.querySelector('.text-xl');
        
        if (priceElement && periodElement) {
            priceElement.textContent = '€' + prices[plan][isYearly ? 'yearly' : 'monthly'];
            periodElement.textContent = isYearly ? '/year' : '/month';
        }
    });
}

function selectPlan(e) {
    const button = e.currentTarget;
    const card = button.closest('.pricing-card');
    
    // Remove selection from all cards
    document.querySelectorAll('.pricing-card').forEach(c => {
        c.classList.remove('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600');
    });
    
    // Add selection to clicked card
    card.classList.add('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600');
    
    // Store selected plan data
    state.selectedPlan = button.dataset.plan;
    state.selectedAmount = parseInt(button.dataset.amount);
    
    // Show continue button
    const continuePayment = document.querySelector('.continue-payment');
    if (continuePayment) {
        continuePayment.classList.remove('hidden');
    }
}

// Live Preview Management
function updateLivePrompt() {
    const livePrompt = document.getElementById('livePrompt');
    if (!livePrompt) return;

    const formData = new FormData(document.getElementById('createBotForm'));
    const data = Object.fromEntries(formData.entries());
    
    let promptText = '';
    switch (data.botType) {
        case 'hotel':
            promptText = generateHotelPrompt(data);
            break;
        case 'hospital':
            promptText = generateHospitalPrompt(data);
            break;
        case 'custom':
            promptText = generateCustomPrompt(data);
            break;
        default:
            promptText = 'Select a bot type to see the preview...';
    }

    livePrompt.innerHTML = promptText;
}

// Deployment Management
async function startDeployment() {
    const deploymentSection = document.getElementById('deploymentProgress');
    deploymentSection.classList.remove('hidden');
    
    initializeProgressSteps();
    await startBotCreation();
}

function initializeProgressSteps() {
    const steps = [
        { title: 'Initializing', description: 'Setting up your AI receptionist' },
        { title: 'Creating Knowledge Base', description: 'Building information database' },
        { title: 'Training AI', description: 'Teaching your AI assistant' },
        { title: 'Cloud Setup', description: 'Preparing cloud infrastructure' },
        { title: 'Deployment', description: 'Launching your AI receptionist' }
    ];

    const container = document.getElementById('progressSteps');
    if (container) {
        container.innerHTML = steps.map((step, index) => `
            <div class="progress-step ${index === 0 ? 'active' : ''}" data-step-index="${index}">
                <div class="flex items-center">
                    <div class="step-number">${index + 1}</div>
                    <div class="step-content">
                        <h4 class="step-title">${step.title}</h4>
                        <p class="step-description">${step.description}</p>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
            </div>
        `).join('');
    }
}

// Utility Functions
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toastContainer');
    container.appendChild(toast);
    
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

    const sessionSettings = sessionStorage.getItem('sessionSettings');
    if (sessionSettings) {
        headers['X-Session-Settings'] = sessionSettings;
    }

    return headers;
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('createBotForm')?.addEventListener('submit', handleFormSubmit);
    document.querySelectorAll('input, select, textarea').forEach(element => {
        element.addEventListener('input', updateLivePrompt);
    });
}

// Function to start bot creation flow
function startBotCreation() {
    // Hide hero section
    document.querySelector('section.bg-white.py-20').classList.add('hidden');
    
    // Show bot creation wizard
    const wizard = document.getElementById('botCreationWizard');
    wizard.classList.remove('hidden');
    
    // Scroll to wizard
    wizard.scrollIntoView({ behavior: 'smooth' });
    
    // Initialize first step
    showStep(1);
}

// Update the showStep function
function showStep(stepNumber) {
    // Update step indicators
    const steps = document.querySelectorAll('[data-step]');
    steps.forEach(step => {
        const isActive = parseInt(step.dataset.step) === stepNumber;
        step.classList.toggle('active', isActive);
        if (isActive) {
            step.classList.add('bg-koko-purple-600', 'text-white');
        } else {
            step.classList.remove('bg-koko-purple-600', 'text-white');
        }
    });

    // Show/hide appropriate content
    if (stepNumber === 1) {
        // Show bot type selection
        document.getElementById('createBotForm').classList.remove('hidden');
        document.getElementById('pricing').classList.add('hidden');
        document.getElementById('deploymentProgress').classList.add('hidden');
    } else if (stepNumber === 2) {
        // Show pricing section
        document.getElementById('createBotForm').classList.add('hidden');
        document.getElementById('pricing').classList.remove('hidden');
        document.getElementById('deploymentProgress').classList.add('hidden');
        // Initialize pricing toggle if not already done
        initializePricing();
    } else if (stepNumber === 3) {
        // Show deployment progress
        document.getElementById('createBotForm').classList.add('hidden');
        document.getElementById('pricing').classList.add('hidden');
        document.getElementById('deploymentProgress').classList.remove('hidden');
        startDeployment();
    }

    state.currentStep = stepNumber;
}

// Update the pricing toggle function
function updatePricing(e) {
    const isYearly = e.target.checked;
    const prices = {
        basic: { monthly: '49.99', yearly: '479.99' },
        professional: { monthly: '149.99', yearly: '1439.99' },
        enterprise: { monthly: '299.99', yearly: '2879.99' }
    };

    // Update all price displays
    document.querySelectorAll('[data-plan]').forEach(card => {
        const plan = card.getAttribute('data-plan');
        const priceElement = card.querySelector('.text-4xl');
        const periodElement = card.querySelector('.text-xl');
        
        if (priceElement && periodElement) {
            priceElement.textContent = '€' + prices[plan][isYearly ? 'yearly' : 'monthly'];
            periodElement.textContent = isYearly ? '/year' : '/month';
        }
    });
}

// Update form submission handler
async function handleFormSubmit(e) {
    e.preventDefault();
    
    // Validate form
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    if (!data.botType) {
        showToast('Please select a bot type', 'error');
        return;
    }

    // Store form data in state
    state.formData = data;
    
    // Move to pricing step
    showStep(2);
}

// Update plan selection handler
function selectPlan(e) {
    const button = e.currentTarget;
    const card = button.closest('.pricing-card');
    
    // Remove selection from all cards
    document.querySelectorAll('.pricing-card').forEach(c => {
        c.classList.remove('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600');
    });
    
    // Add selection to clicked card
    card.classList.add('border-koko-purple-600', 'ring-2', 'ring-koko-purple-600');
    
    // Store selected plan data
    state.selectedPlan = button.dataset.plan;
    state.selectedAmount = parseInt(button.dataset.amount);
    
    // Show continue button
    const continuePayment = document.querySelector('.continue-payment');
    if (continuePayment) {
        continuePayment.classList.remove('hidden');
    }
}

// Add deployment progress update function
function updateDeploymentProgress(status, progress) {
    const steps = document.querySelectorAll('.progress-step');
    const currentStep = Array.from(steps).find(step => 
        step.querySelector('.step-title').textContent === status
    );
    
    if (currentStep) {
        // Update progress bar
        const progressBar = currentStep.querySelector('.progress-fill');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        // Update step status
        currentStep.classList.add('active');
        
        // Mark previous steps as completed
        let prevStep = currentStep.previousElementSibling;
        while (prevStep) {
            prevStep.classList.add('completed');
            prevStep.classList.remove('active');
            prevStep = prevStep.previousElementSibling;
        }
    }
}

// Add context actions management
function showContextAction(text, action) {
    const contextBar = document.getElementById('contextActions');
    contextBar.innerHTML = `
        <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <button class="btn-primary" onclick="handleContextAction()">
                ${text}
                <i class="fas fa-arrow-right ml-2"></i>
            </button>
        </div>
    `;
    contextBar.classList.remove('hidden');
    window.handleContextAction = action;
}

// Export for use in other modules if needed
export const botCreation = {
    state,
    showStep,
    startDeployment
};
