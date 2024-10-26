// Form Submission Handler
let currentRequestId = null;
let isDeploymentOngoing = false;

// Add these variables at the top of your script
let isPersistentPromptOpen = false;
let userClosedPrompt = false;
let selectedPlan = null;
let selectedAmount = 0;

// Add this near the top of your script.js file
let eventSource = null;

// Add these variables at the top with other global variables
let currentMode = 'global';
let sessionId = null;

// Add this function to handle admin settings
function initializeAdminSettings() {
    // Mode selection handling
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            loadSettings(currentMode);
        });
    });

    // Initialize switches
    initializeSwitch('mockMode', 'IS_MOCK');
    initializeSwitch('skipPayment', 'SKIP_PAYMENT');
    initializeSwitch('disableFauxTimers', 'DISABLE_FAUX_TIMERS');

    // Load initial settings
    loadSettings('global');
}

function initializeSwitch(elementId, settingKey) {
    const switchElement = document.getElementById(elementId);
    const statusElement = document.getElementById(`${elementId}Status`);
    
    if (switchElement && statusElement) {
        switchElement.addEventListener('change', async () => {
            const isEnabled = switchElement.checked;
            statusElement.textContent = isEnabled ? 'Enabled' : 'Disabled';
            
            try {
                if (currentMode === 'session') {
                    // Handle session-specific settings
                    if (!sessionId) {
                        sessionId = 'session_' + Math.random().toString(36).substring(7);
                    }
                    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
                    sessionSettings[settingKey] = isEnabled;
                    sessionSettings.isActive = true;
                    sessionSettings.sessionId = sessionId;
                    sessionStorage.setItem('sessionSettings', JSON.stringify(sessionSettings));
                    
                    // Show session indicator
                    showSessionIndicator(sessionId);
                } else {
                    // Handle global settings
                    await updateGlobalSetting(settingKey, isEnabled);
                }
                
                // Notify other windows/tabs about the change
                window.postMessage({
                    type: 'settingsUpdated',
                    mode: currentMode,
                    settings: currentMode === 'session' ? 
                        JSON.parse(sessionStorage.getItem('sessionSettings')) :
                        { [settingKey]: isEnabled }
                }, '*');
                
                showToast(`${settingKey} ${isEnabled ? 'enabled' : 'disabled'} (${currentMode} mode)`, 'success');
            } catch (error) {
                console.error('Error updating setting:', error);
                showToast('Failed to update setting', 'error');
                // Revert switch state
                switchElement.checked = !isEnabled;
                statusElement.textContent = !isEnabled ? 'Enabled' : 'Disabled';
            }
        });
    }
}

async function loadSettings(mode) {
    if (mode === 'session') {
        const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
        updateSwitchesFromSettings(sessionSettings);
        if (sessionSettings.isActive && sessionSettings.sessionId) {
            showSessionIndicator(sessionSettings.sessionId);
        }
    } else {
        try {
            const response = await fetch('/api/admin/settings');
            const settings = await response.json();
            updateSwitchesFromSettings(settings);
            hideSessionIndicator();
        } catch (error) {
            console.error('Error loading settings:', error);
            showToast('Failed to load settings', 'error');
        }
    }
}

function updateSwitchesFromSettings(settings) {
    Object.entries(settings).forEach(([key, value]) => {
        const switchElement = document.getElementById(key.toLowerCase());
        const statusElement = document.getElementById(`${key.toLowerCase()}Status`);
        if (switchElement && statusElement) {
            switchElement.checked = value;
            statusElement.textContent = value ? 'Enabled' : 'Disabled';
        }
    });
}

function showSessionIndicator(sessionId) {
    // Remove existing indicator if any
    hideSessionIndicator();
    
    const indicator = document.createElement('div');
    indicator.id = 'session-indicator';
    indicator.className = 'session-indicator';
    indicator.innerHTML = `
        <i class="fas fa-user-clock"></i>
        <span>Session Mode Active</span>
        <span id="mainSessionId">${sessionId.split('_').pop()}</span>
    `;
    document.body.appendChild(indicator);
}

function hideSessionIndicator() {
    const indicator = document.getElementById('session-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    const container = document.getElementById('toast-container') || createToastContainer();
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
        if (container.children.length === 0) {
            container.remove();
        }
    }, 3000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

async function updateGlobalSetting(key, value) {
    const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
    });
    
    if (!response.ok) {
        throw new Error('Failed to update setting');
    }
}

// Add this at the start of your script
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/check-mock-mode');
        const { isMock } = await response.json();
        if (isMock) {
            document.getElementById('mock-mode-indicator').style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking mock mode:', error);
    }
});

document.getElementById('createBotForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const botType = document.getElementById('botType').value;
    if (!botType) {
        alert('Please select an Assistant Type');
        return;
    }
    
    const formData = new FormData(this);
    
    // Add the file to formData if it exists
    const fileInput = document.getElementById('fileUpload');
    if (fileInput.files[0]) {
        formData.append('additionalInfo', fileInput.files[0]);
    }
    
    // Show the pricing step
    showStep(2);
});

async function retrieveFinalData(requestId) {
    while (isDeploymentOngoing) {
        try {
            const response = await fetch(`/retrieve-bot-data?requestId=${requestId}`);
            if (response.ok) {
                const data = await response.json();
                updateProgressUI(data);
                if (data.status === 'completed' || data.error) {
                    isDeploymentOngoing = false;
                    return;
                }
            }
        } catch (error) {
            console.error('Failed to retrieve final data:', error);
        }
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
    }
}

// Update Progress UI
function updateProgressUI(data) {
    console.log('Updating progress UI with data:', data);
    
    const progressSteps = document.getElementById('progress-steps');
    if (!progressSteps) {
        console.error('Progress steps container not found');
        return;
    }

    // Skip the initial connection message
    if (data.status === 'Connected') {
        return;
    }

    if (data.error) {
        console.error('Received error:', data.error);
        showErrorMessage(data.error);
        return;
    }

    if (data.status === 'completed') {
        console.log('Received completion data:', data);
        // Handle completion
        const steps = progressSteps.querySelectorAll('.progress-step');
        steps.forEach(step => {
            step.classList.add('completed');
            step.classList.remove('active');
            step.querySelector('.progress-bar-fill').style.width = '100%';
            step.querySelector('.progress-step-icon').textContent = '✓';
        });

        // Show completion details
        const completionDetails = document.getElementById('completion-details');
        if (data.serviceUrl && data.phoneNumber && data.username && data.password) {
            console.log('All required completion data present, showing success UI');
            // ... (rest of the success UI code)
        } else {
            console.error('Missing completion data:', {
                serviceUrl: !!data.serviceUrl,
                phoneNumber: !!data.phoneNumber,
                username: !!data.username,
                password: !!data.password
            });
            completionDetails.innerHTML = `
                <div class="error-section">
                    <p>⚠️ Deployment completed but some information is missing.</p>
                    <p>Missing data: ${Object.entries({
                        'Service URL': !data.serviceUrl,
                        'Phone Number': !data.phoneNumber,
                        'Username': !data.username,
                        'Password': !data.password
                    }).filter(([_, missing]) => missing).map(([key]) => key).join(', ')}</p>
                    <p>Please contact support if this persists.</p>
                </div>`;
        }
    } else if (data.status) {
        // Update current step
        const steps = progressSteps.querySelectorAll('.progress-step');
        const currentStepIndex = Array.from(steps).findIndex(step => 
            step.querySelector('.progress-step-title').textContent.toLowerCase() === data.status.toLowerCase()
        );
        
        if (currentStepIndex !== -1) {
            steps.forEach((step, index) => {
                if (index < currentStepIndex) {
                    // Completed steps
                    step.classList.add('completed');
                    step.classList.remove('active');
                    step.querySelector('.progress-bar-fill').style.width = '100%';
                    step.querySelector('.progress-step-icon').textContent = '✓';
                } else if (index === currentStepIndex) {
                    // Current step
                    step.classList.add('active');
                    step.classList.remove('completed');
                    step.querySelector('.progress-bar-fill').style.width = `${data.progress || 0}%`;
                } else {
                    // Future steps
                    step.classList.remove('active', 'completed');
                    step.querySelector('.progress-bar-fill').style.width = '0%';
                    step.querySelector('.progress-step-icon').textContent = index + 1;
                }
            });
        }
    }
}

// Create Step HTML
function createStepHTML(step, status, progress, substep) {
    return `
        <div class="progress-step ${status}">
            <div class="progress-step-header">
                <div class="progress-step-icon">${status === 'completed' ? '✓' : ''}</div>
                <div class="progress-step-title">${step.title}</div>
            </div>
            <div class="progress-step-description">${step.description}</div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: ${progress}%"></div>
            </div>
            <div class="progress-step-time">${step.time}</div>
            ${substep ? `<div class="progress-substep">${substep}</div>` : ''}
        </div>
    `;
}

// Update Step Progress
function updateStepProgress(stepElement, status, progress, substep) {
    stepElement.className = `progress-step ${status}`;
    stepElement.querySelector('.progress-step-icon').textContent = status === 'completed' ? '✓' : '';
    stepElement.querySelector('.progress-bar-fill').style.width = `${progress}%`;
    if (substep) {
        let substepElement = stepElement.querySelector('.progress-substep');
        if (!substepElement) {
            substepElement = document.createElement('div');
            substepElement.className = 'progress-substep';
            stepElement.appendChild(substepElement);
        }
        substepElement.textContent = substep;
    }
}

// Toggle Password Visibility
function togglePassword() {
    const passwordElement = document.getElementById('password-value');
    const toggleButton = document.querySelector('.password-toggle');
    
    if (passwordElement.classList.contains('password-hidden')) {
        passwordElement.textContent = window.generatedPassword;
        passwordElement.classList.remove('password-hidden');
        toggleButton.textContent = 'Hide';
    } else {
        passwordElement.textContent = '••••••••';
        passwordElement.classList.add('password-hidden');
        toggleButton.textContent = 'Show';
    }
}

// Show Step
function showStep(stepNumber) {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`step${stepNumber}-content`).classList.add('active');
    document.getElementById(`step${stepNumber}`).classList.add('active');

    console.log(`Showing step ${stepNumber}`); // Add this line for debugging

    // If it's step 2 (pricing), initialize the pricing toggle
    if (stepNumber === 2) {
        initializePricingToggle();
    }
}

// Celebration Animation
function celebrate() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF3E3E', '#FF7676', '#4CAF50', '#FFFFFF'],
    });

    setTimeout(() => {
        confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#FF3E3E', '#FF7676', '#4CAF50', '#FFFFFF'],
        });
    }, 250);

    setTimeout(() => {
        confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#FF3E3E', '#FF7676', '#4CAF50', '#FFFFFF'],
        });
    }, 400);
}

// Toggle Assistant Forms Based on Selection
document.getElementById('botType').addEventListener('change', function() {
    const selectedType = this.value;
    document.querySelectorAll('.assistant-form').forEach(form => {
        form.style.display = 'none';
        form.querySelectorAll('input, select').forEach(input => {
            input.required = false;
        });
    });
    if (selectedType) {
        const selectedForm = document.getElementById(`${selectedType.toLowerCase()}Form`);
        selectedForm.style.display = 'block';
        selectedForm.querySelectorAll('input[required], select[required]').forEach(input => {
            input.required = true;
        });
    }
    updateLivePrompt();
});

// Update Live Prompt as User Fills the Form
document.querySelectorAll('#createBotForm input, #createBotForm select, #createBotForm textarea').forEach(element => {
    element.addEventListener('input', updateLivePrompt);
    element.addEventListener('focus', () => {
        if (!userClosedPrompt) {
            const persistentPrompt = document.getElementById('persistentPrompt');
            persistentPrompt.classList.remove('closed');
            persistentPrompt.classList.add('open');
            document.getElementById('togglePrompt').textContent = '▼';
            isPersistentPromptOpen = true;
        }
    });
});

function updateLivePrompt() {
    const botType = document.getElementById('botType').value;
    let promptTemplate = '';

    function highlight(text, placeholder, value) {
        if (value && value !== placeholder) {
            return text.replace(new RegExp(placeholder, 'g'), `<span style="background-color: yellow; color: black;">${value}</span>`);
        }
        return text;
    }

    if (botType === 'Hotel') {
        const hotelName = document.getElementById('hotelName').value || '{HOTEL_NAME}';
        const stars = document.getElementById('hotelStars').value || '{STAR_RATING}';
        const rooms = document.getElementById('hotelRooms').value || '{NUMBER_OF_ROOMS}';
        const amenities = document.getElementById('hotelAmenities').value || '{AMENITIES}';
        const policies = document.getElementById('hotelPolicies').value || '{HOTEL_POLICIES}';

        promptTemplate = `You are the AI receptionist for {HOTEL_NAME}, a {STAR_RATING}-star hotel with {NUMBER_OF_ROOMS} rooms, fluent in every language. The hotel offers amenities such as {AMENITIES}. Speak in a friendly tone, and keep your responses short, precise, and conversational. Guide the caller with kindness, offering helpful advice to ensure they choose the best room.

Our policies include: {HOTEL_POLICIES}

Do not invent information—use only what's provided. When asked about prices, share them and aim to complete the booking, mentioning you'll send a booking link at the end.

Start by asking the caller's name, and good luck!`;

        promptTemplate = highlight(promptTemplate, '{HOTEL_NAME}', hotelName);
        promptTemplate = highlight(promptTemplate, '{STAR_RATING}', stars);
        promptTemplate = highlight(promptTemplate, '{NUMBER_OF_ROOMS}', rooms);
        promptTemplate = highlight(promptTemplate, '{AMENITIES}', amenities);
        promptTemplate = highlight(promptTemplate, '{HOTEL_POLICIES}', policies);

    } else if (botType === 'Hospital') {
        const hospitalName = document.getElementById('hospitalName').value || '{HOSPITAL_NAME}';
        const hospitalType = document.getElementById('hospitalType').value || '{HOSPITAL_TYPE}';
        const departments = document.getElementById('hospitalDepartments').value || '{DEPARTMENTS}';
        const beds = document.getElementById('hospitalBeds').value || '{NUMBER_OF_BEDS}';

        promptTemplate = `You are the AI receptionist for {HOSPITAL_NAME}, a {HOSPITAL_TYPE} with {NUMBER_OF_BEDS} beds, fluent in every language. The hospital has departments including {DEPARTMENTS}. Maintain a compassionate and professional tone, ensuring clear and concise communication.

Do not provide medical advice—refer to professionals when necessary. Ensure all interactions are respectful and adhere to patient privacy guidelines.

Begin by greeting the caller and asking how you can assist them today.`;

        promptTemplate = highlight(promptTemplate, '{HOSPITAL_NAME}', hospitalName);
        promptTemplate = highlight(promptTemplate, '{HOSPITAL_TYPE}', hospitalType);
        promptTemplate = highlight(promptTemplate, '{DEPARTMENTS}', departments);
        promptTemplate = highlight(promptTemplate, '{NUMBER_OF_BEDS}', beds);

    } else if (botType === 'Custom') {
        const assistantName = document.getElementById('customAssistantName').value || '{ASSISTANT_NAME}';
        const industry = document.getElementById('customIndustry').value || '{INDUSTRY}';
        const purpose = document.getElementById('customPurpose').value || '{PURPOSE}';
        const tone = document.getElementById('customTone').value || '{TONE}';
        const knowledgeBase = document.getElementById('customKnowledgeBase').value || '{KNOWLEDGE_BASE}';
        const guidelines = document.getElementById('customGuidelines').value || '{GUIDELINES}';

        promptTemplate = document.getElementById('customPrompt').value || 
`You are {ASSISTANT_NAME}, a customized AI assistant for the {INDUSTRY} industry, designed to {PURPOSE}. Your knowledge base is tailored to provide assistance in designated areas as specified by the user. Maintain a {TONE} tone that aligns with the brand and purpose you are created for.

Your knowledge base includes: {KNOWLEDGE_BASE}

Please follow these guidelines: {GUIDELINES}

Ensure all responses are accurate, helpful, and aligned with the provided guidelines. Feel free to ask clarifying questions to better assist the user.

Start by introducing yourself and asking how you can help today.`;

        promptTemplate = highlight(promptTemplate, '{ASSISTANT_NAME}', assistantName);
        promptTemplate = highlight(promptTemplate, '{INDUSTRY}', industry);
        promptTemplate = highlight(promptTemplate, '{PURPOSE}', purpose);
        promptTemplate = highlight(promptTemplate, '{TONE}', tone);
        promptTemplate = highlight(promptTemplate, '{KNOWLEDGE_BASE}', knowledgeBase);
        promptTemplate = highlight(promptTemplate, '{GUIDELINES}', guidelines);

    } else {
        promptTemplate = 'Please select an assistant type to see the prompt.';
    }

    document.getElementById('livePrompt').innerHTML = promptTemplate;
    document.getElementById('persistentPromptContent').innerHTML = promptTemplate;
}

// Collapsible sections
var coll = document.getElementsByClassName("collapsible");
for (var i = 0; i < coll.length; i++) {
    coll[i].addEventListener("click", function() {
        this.classList.toggle("active-collapsible");
        var content = this.nextElementSibling;
        if (content.style.maxHeight){
            content.style.maxHeight = null;
        } else {
            content.style.maxHeight = content.scrollHeight + "px";
        }
    });
}

// File upload
function handleFileSelect(input) {
    if (input.files && input.files[0]) {
        var fileName = input.files[0].name;
        document.querySelector('.image-upload-wrap').style.display = 'none';
        document.querySelector('.file-upload-content').style.display = 'block';
        document.querySelector('.uploaded-file-name').textContent = fileName;
    } else {
        removeUpload();
    }
}

function removeUpload() {
    document.getElementById('fileUpload').value = '';
    document.querySelector('.file-upload-content').style.display = 'none';
    document.querySelector('.image-upload-wrap').style.display = 'block';
}

document.querySelector('.image-upload-wrap').addEventListener('dragover', function () {
    this.classList.add('image-dropping');
});

document.querySelector('.image-upload-wrap').addEventListener('dragleave', function () {
    this.classList.remove('image-dropping');
});

// Persistent Prompt Functionality
const persistentPrompt = document.getElementById('persistentPrompt');
const promptHeader = document.getElementById('promptHeader');
const togglePrompt = document.getElementById('togglePrompt');
let isPromptVisible = false;

promptHeader.addEventListener('click', () => {
    isPromptVisible = !isPromptVisible;
    persistentPrompt.style.transform = isPromptVisible ? 'translateY(0)' : 'translateY(calc(100% - 40px))';
    togglePrompt.textContent = isPromptVisible ? '▼' : '▲';
});

// Show the prompt when any form field is focused
document.querySelectorAll('input, select, textarea').forEach(element => {
    element.addEventListener('focus', () => {
        if (!isPromptVisible) {
            isPromptVisible = true;
            persistentPrompt.style.transform = 'translateY(0)';
            togglePrompt.textContent = '▼';
        }
    });
});

// Initial update of the persistent prompt
updateLivePrompt();

// Load countries and set up country selection
fetch('countries.json')
    .then(response => response.json())
    .then(countries => {
        setupCountrySelect('hotelCountry', countries);
        setupCountrySelect('hospitalCountry', countries);
        setupCountrySelect('customCountry', countries);
    });

function setupCountrySelect(inputId, countries) {
    const input = document.getElementById(inputId);
    const optionsContainer = document.getElementById(inputId + 'Options');

    input.addEventListener('input', () => {
        const value = input.value.toLowerCase();
        const filteredCountries = countries.filter(country => 
            country.name.toLowerCase().includes(value)
        );
        
        optionsContainer.innerHTML = '';
        filteredCountries.forEach(country => {
            const option = document.createElement('div');
            option.classList.add('country-option');
            option.textContent = country.name;
            option.addEventListener('click', () => {
                input.value = country.name;
                optionsContainer.style.display = 'none';
            });
            optionsContainer.appendChild(option);
        });

        optionsContainer.style.display = filteredCountries.length > 0 ? 'block' : 'none';
    });

    input.addEventListener('focus', () => {
        if (input.value === '') {
            const allCountries = countries.slice(0, 10); // Show first 10 countries
            optionsContainer.innerHTML = '';
            allCountries.forEach(country => {
                const option = document.createElement('div');
                option.classList.add('country-option');
                option.textContent = country.name;
                option.addEventListener('click', () => {
                    input.value = country.name;
                    optionsContainer.style.display = 'none';
                });
                optionsContainer.appendChild(option);
            });
            optionsContainer.style.display = 'block';
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !optionsContainer.contains(e.target)) {
            optionsContainer.style.display = 'none';
        }
    });
}

// Add this new function at the end of the file
function changeHiltonUrl() {
    fetch('/change-hilton-url', {
        method: 'POST',
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Successfully changed URL for +13394997114 to Hilton Edinburgh Assistant');
        } else {
            alert('Failed to change URL. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred. Please try again.');
    });
}

// Add this event listener at the end of the file
document.getElementById('changeHiltonUrl').addEventListener('click', changeHiltonUrl);

// Replace the existing setupRevealButton function with this:
function setupRevealButton() {
    const revealButton = document.querySelector('.reveal-button');
    const container = document.querySelector('.reveal-button-container');

    revealButton.addEventListener('click', () => {
        container.classList.toggle('active');
    });

    // Close the hidden content when clicking outside
    document.addEventListener('click', (event) => {
        if (!container.contains(event.target)) {
            container.classList.remove('active');
        }
    });
}

// Make sure this function is called when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupRevealButton();
    document.getElementById('changeHiltonUrl').addEventListener('click', changeHiltonUrl);
});

// Add this new function to handle the persistent prompt toggle
function togglePersistentPrompt() {
    const persistentPrompt = document.getElementById('persistentPrompt');
    const toggleButton = document.getElementById('togglePrompt');

    if (persistentPrompt.classList.contains('open')) {
        persistentPrompt.classList.remove('open');
        persistentPrompt.classList.add('closed');
        toggleButton.textContent = '▲';
        isPersistentPromptOpen = false;
        userClosedPrompt = true;
    } else {
        persistentPrompt.classList.remove('closed');
        persistentPrompt.classList.add('open');
        toggleButton.textContent = '▼';
        isPersistentPromptOpen = true;
        userClosedPrompt = false;
    }
}

// Add this event listener for the toggle button
document.getElementById('togglePrompt').addEventListener('click', togglePersistentPrompt);

// Add this new function to handle the pricing toggle
function initializePricingToggle() {
    const toggle = document.getElementById('pricingToggle');
    const priceElements = document.querySelectorAll('.price .amount');
    const periodElements = document.querySelectorAll('.price .period');

    const monthlyPrices = ['49.99', '149.99', '299.99'];
    const yearlyPrices = ['499.99', '1499.99', '2999.99'];

    toggle.addEventListener('change', function() {
        const isYearly = this.checked;
        priceElements.forEach((el, index) => {
            el.textContent = isYearly ? yearlyPrices[index] : monthlyPrices[index];
        });
        periodElements.forEach(el => {
            el.textContent = isYearly ? '/year' : '/month';
        });
        
        // Update the data-amount attribute for both select-plan and continue-payment buttons
        document.querySelectorAll('.select-plan, .continue-payment').forEach((button, index) => {
            const newAmount = isYearly ? parseFloat(yearlyPrices[index]) * 100 : parseFloat(monthlyPrices[index]) * 100;
            button.setAttribute('data-amount', newAmount.toFixed(0));
        });
    });
}

// Modify the event listeners for the select plan buttons
document.querySelectorAll('.select-plan').forEach(button => {
    button.addEventListener('click', function() {
        // Remove selected class from all cards and buttons
        document.querySelectorAll('.pricing-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelectorAll('.select-plan').forEach(btn => {
            btn.classList.remove('selected');
        });

        // Add selected class to clicked button and its parent card
        this.classList.add('selected');
        this.closest('.pricing-card').classList.add('selected');
        
        // Store the selected plan and amount
        selectedPlan = this.getAttribute('data-plan');
        selectedAmount = parseInt(this.getAttribute('data-amount'));
        
        // Show and update the continue payment button
        const continuePaymentContainer = document.querySelector('.continue-payment-container');
        const continuePaymentButton = document.querySelector('.continue-payment');
        continuePaymentButton.setAttribute('data-amount', selectedAmount);
        
        // Show the continue payment container with animation
        continuePaymentContainer.style.display = 'block';
        setTimeout(() => {
            continuePaymentContainer.classList.add('visible');
        }, 50);
        
        console.log(`Selected plan: ${selectedPlan}, Amount: ${selectedAmount}`);
    });
});

// Add event listener for the continue-payment button
document.querySelector('.continue-payment').addEventListener('click', function() {
    const amount = parseInt(this.getAttribute('data-amount'));
    createRazorpayOrder(amount);
});

// Function to create a Razorpay order
async function createRazorpayOrder(amount) {
    try {
        // Get headers with session settings
        const headers = {
            'Content-Type': 'application/json',
            ...getRequestHeaders()
        };

        console.log('Creating order with headers:', headers);

        const response = await fetch('/create-order', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                amount, 
                currency: 'EUR', 
                receipt: `receipt_${Date.now()}`, 
                notes: {} 
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create order');
        }

        const order = await response.json();
        console.log('Order created:', order);
        
        // Check if it's a mock order
        if (order.mock) {
            openMockPayment(order);
        } else {
            openRazorpayCheckout(order);
        }
    } catch (error) {
        console.error('Error creating order:', error);
        alert(`Failed to create order. Error: ${error.message}`);
    }
}

// Function to open Razorpay checkout
function openRazorpayCheckout(order) {
    const options = {
        key: 'rzp_test_nsT1ElDtX6gLGd', // Replace with your Razorpay key_id
        amount: order.amount,
        currency: order.currency,
        name: 'KOKOAI',
        description: `${selectedPlan} Plan Subscription`,
        order_id: order.id,
        handler: function (response) {
            verifyPayment(response);
        },
        prefill: {
            name: 'John Doe',
            email: 'john@example.com',
            contact: '9999999999'
        },
        theme: {
            color: '#FF3E3E'
        },
    };

    const rzp = new Razorpay(options);
    rzp.open();
}

// Update the verifyPayment function to properly trigger bot creation
async function verifyPayment(response) {
    console.log('Starting payment verification with response:', response);
    try {
        const verificationResponse = await fetch('/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getRequestHeaders()
            },
            body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
            })
        });

        const data = await verificationResponse.json();
        console.log('Payment verification response:', data);
        
        if (data.status === 'ok') {
            console.log('Payment verification successful, starting bot creation...');
            // Move to step 3 immediately
            showStep(3);
            
            // Initialize progress steps
            initializeProgressSteps();
            
            // Start the actual bot creation
            await startBotCreation();
        } else {
            console.error('Payment verification failed:', data);
            alert('Payment verification failed. Please contact support.');
        }
    } catch (error) {
        console.error('Error during payment verification:', error);
        alert('Error verifying payment. Please contact support.');
    }
}

// Add new function to initialize progress steps
function initializeProgressSteps() {
    console.log('Initializing progress steps...');
    const progressSteps = document.getElementById('progress-steps');
    progressSteps.innerHTML = ''; // Clear existing steps
    
    const steps = [
        { title: 'Initializing', description: 'Setting up your AI receptionist' },
        { title: 'Creating Knowledge Base', description: 'Building information database' },
        { title: 'Training AI', description: 'Teaching your AI assistant' },
        { title: 'Cloud Setup', description: 'Preparing cloud infrastructure' },
        { title: 'Deployment', description: 'Launching your AI receptionist' },
        { title: 'Phone Configuration', description: 'Setting up your phone number' }
    ];

    steps.forEach((step, index) => {
        progressSteps.innerHTML += `
            <div class="progress-step ${index === 0 ? 'active' : ''}">
                <div class="progress-step-header">
                    <div class="progress-step-icon">${index + 1}</div>
                    <div class="progress-step-title">${step.title}</div>
                </div>
                <div class="progress-step-description">${step.description}</div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${index === 0 ? '0%' : '0%'}"></div>
                </div>
            </div>
        `;
    });
}

// Add new function to handle the actual bot creation
async function startBotCreation() {
    try {
        console.log('Starting bot creation process...');
        const formData = new FormData(document.getElementById('createBotForm'));
        
        // Get session settings and auth token
        const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
        const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
        const token = localStorage.getItem('token');
        
        // Prepare headers
        const headers = {
            'Authorization': `Bearer ${token}` // Add authorization header
        };

        if (isSessionEnabled && sessionSettings.isActive) {
            headers['X-Session-Settings'] = JSON.stringify(sessionSettings);
            console.log('Including session settings in request:', sessionSettings);
        }

        console.log('Making create-bot POST request with headers:', headers);
        const response = await fetch('/create-bot', {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create bot');
        }

        const { requestId } = await response.json();
        console.log('Received requestId:', requestId);
        
        // Connect to SSE endpoint
        await connectToEventSource(requestId, sessionSettings);
        
    } catch (error) {
        console.error('Error in startBotCreation:', error);
        showErrorMessage('Failed to create bot: ' + error.message);
    }
}

// Update the connectToEventSource function to include auth token
async function connectToEventSource(requestId, sessionSettings) {
    console.log('Connecting to EventSource with requestId:', requestId);
    
    if (window.eventSource) {
        console.log('Closing existing EventSource');
        window.eventSource.close();
    }

    const token = localStorage.getItem('token');
    let url = `/create-bot?requestId=${requestId}&token=${token}`; // Add token to URL

    if (sessionSettings?.isActive) {
        url += `&sessionSettings=${encodeURIComponent(JSON.stringify(sessionSettings))}`;
    }
    console.log('SSE URL:', url);

    window.eventSource = new EventSource(url);
    
    window.eventSource.onopen = () => {
        console.log('SSE connection opened');
    };
    
    window.eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Received SSE update:', data);
            updateProgressUI(data);
        } catch (error) {
            console.error('Error parsing SSE data:', error);
        }
    };
    
    window.eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        window.eventSource.close();
        showErrorMessage('Lost connection to server. Please try again.');
    };
}

// Make sure to call initializePricingToggle when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializePricingToggle();
});

// Update your form submission handler
document.getElementById('createBotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Show deployment progress
    const deploymentProgress = document.querySelector('.deployment-progress');
    deploymentProgress.style.display = 'block';
    
    // Get form data and submit as before
    const formData = new FormData(e.target);
    
    try {
        const response = await fetch('/create-bot', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (!response.ok) throw new Error('Failed to create bot');
        
        const { requestId } = await response.json();
        
        // Connect to SSE endpoint
        connectToEventSource(requestId);
        
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to create bot: ' + error.message);
    }
});

function connectToEventSource(requestId, sessionSettings) {
    if (eventSource) {
        eventSource.close();
    }

    let url = `/create-bot?requestId=${requestId}`;
    if (sessionSettings) {
        url += `&sessionSettings=${encodeURIComponent(JSON.stringify(sessionSettings))}`;
    }

    eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            updateProgressUI(data);
        } catch (error) {
            console.error('Error parsing SSE data:', error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        eventSource.close();
    };
}

function updateProgress(data) {
    const progressFill = document.querySelector('.progress-fill');
    const progressStep = document.querySelector('.progress-step');
    
    if (data.error) {
        progressStep.textContent = `Error: ${data.error}`;
        progressStep.style.color = 'red';
        return;
    }

    if (data.status === 'completed') {
        progressFill.style.width = '100%';
        progressStep.textContent = 'Deployment Complete!';
        
        // Display completion details
        const completionDetails = document.getElementById('completion-details');
        completionDetails.innerHTML = `
            <div class="completion-info">
                <p><strong>Phone Number:</strong> ${data.phoneNumber}</p>
                <p><strong>Service URL:</strong> ${data.serviceUrl}</p>
                <p><strong>Username:</strong> ${data.username}</p>
                <p><strong>Password:</strong> ${data.password}</p>
            </div>
        `;
        
        // Move to the completion step
        showStep(3);
        
        // Close the EventSource
        if (eventSource) {
            eventSource.close();
        }
        
        return;
    }

    // Update progress bar and step text
    if (data.progress !== undefined) {
        progressFill.style.width = `${data.progress}%`;
    }
    
    if (data.status) {
        let statusText = data.status;
        if (data.substep) {
            statusText += ` - ${data.substep}`;
        }
        progressStep.textContent = statusText;
    }
}

// Update the mock payment functions
function openMockPayment(order) {
    console.log('Opening mock payment modal for order:', order);
    // Create and show the mock payment modal
    const mockPaymentModal = document.createElement('div');
    mockPaymentModal.className = 'modal';
    mockPaymentModal.style.display = 'block';
    
    mockPaymentModal.innerHTML = `
        <div class="modal-content" style="text-align: center; padding: 2rem;">
            <h2>Mock Payment</h2>
            <p>Amount: €${(order.amount / 100).toFixed(2)}</p>
            <p>Plan: ${selectedPlan}</p>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                <button onclick="handleMockPayment('success', '${order.id}')" 
                    style="background: var(--success-color); padding: 1rem 2rem;">
                    Success
                </button>
                <button onclick="handleMockPayment('failure', '${order.id}')" 
                    style="background: var(--error-color); padding: 1rem 2rem;">
                    Failure
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(mockPaymentModal);
}

// Update handleMockPayment function
async function handleMockPayment(result, orderId) {
    console.log('Handling mock payment:', { result, orderId });
    try {
        // Remove the mock payment modal
        document.querySelector('.modal').remove();
        
        if (result === 'success') {
            const mockResponse = {
                razorpay_order_id: orderId,
                razorpay_payment_id: 'mock_pay_' + Math.random().toString(36).substr(2, 9),
                razorpay_signature: 'mock_sig_' + Math.random().toString(36).substr(2, 9)
            };
            
            console.log('Mock payment successful, verifying...');
            const verificationResponse = await fetch('/verify-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getRequestHeaders()
                },
                body: JSON.stringify(mockResponse)
            });

            if (!verificationResponse.ok) {
                throw new Error('Failed to verify mock payment');
            }

            const data = await verificationResponse.json();
            console.log('Mock payment verification response:', data);
            
            if (data.status === 'ok') {
                console.log('Mock payment verified successfully, starting bot creation...');
                // Move to step 3 immediately
                showStep(3);
                
                // Initialize progress steps
                initializeProgressSteps();
                
                // Start the actual bot creation
                await startBotCreation();
            } else {
                throw new Error('Mock payment verification failed');
            }
        } else {
            throw new Error('Mock payment cancelled');
        }
    } catch (error) {
        console.error('Error processing mock payment:', error);
        alert(error.message);
    }
}

// Add these event listeners to the existing DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if session mode is active
    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    if (sessionSettings.isActive && sessionSettings.sessionId) {
        showSessionIndicator(sessionSettings.sessionId);
    }

    // Initialize admin settings if we're on the admin page
    if (document.querySelector('.admin-container')) {
        initializeAdminSettings();
    }
});

// Add this at the start of your script
document.addEventListener('DOMContentLoaded', () => {
    // Check for session mode
    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    
    if (isSessionEnabled && sessionSettings.isActive && sessionSettings.sessionId) {
        showSessionIndicator(sessionSettings.sessionId);
    }

    // Check for mock mode only if not in session mode
    if (!isSessionEnabled) {
        checkMockMode();
    }
});

// Separate the mock mode check
async function checkMockMode() {
    try {
        const response = await fetch('/api/check-mock-mode');
        const { isMock } = await response.json();
        if (isMock) {
            document.getElementById('mock-mode-indicator').style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking mock mode:', error);
    }
}

// Add session cleanup on window unload
window.addEventListener('unload', () => {
    // Only clean up if it's a full browser close, not navigation
    if (performance.navigation.type === 2) {
        sessionStorage.removeItem('sessionEnabled');
        sessionStorage.removeItem('sessionSettings');
    }
});

// Add these utility functions to script.js so they're available everywhere
function showSessionIndicator(sessionId) {
    hideSessionIndicator(); // Remove any existing indicator
    
    const indicator = document.createElement('div');
    indicator.id = 'session-indicator';
    indicator.className = 'session-indicator';
    indicator.innerHTML = `
        <i class="fas fa-user-clock"></i>
        <span>Session Mode Active</span>
        <span id="mainSessionId">${sessionId.split('_').pop()}</span>
    `;
    document.body.appendChild(indicator);
}

function hideSessionIndicator() {
    const indicator = document.getElementById('session-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Add this function to check session settings before making API calls
function getEffectiveSettings() {
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    if (isSessionEnabled) {
        const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
        return {
            IS_MOCK: sessionSettings.IS_MOCK || false,
            SKIP_PAYMENT: sessionSettings.SKIP_PAYMENT || false,
            DISABLE_FAUX_TIMERS: sessionSettings.DISABLE_FAUX_TIMERS || false
        };
    }
    return null; // Let the server use global settings
}

// Add this function to handle admin panel navigation
function navigateToAdmin(e) {
    e.preventDefault(); // Prevent default navigation
    
    // Store current page URL to return to it later
    sessionStorage.setItem('previousPage', window.location.href);
    
    // Navigate to admin panel without reloading
    window.location.replace('admin.html');
}

// Update the admin button in the HTML to use onclick instead of direct navigation
document.querySelector('.admin-button').onclick = navigateToAdmin;

// Add this to the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    // Check for session mode
    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    
    if (isSessionEnabled && sessionSettings.isActive && sessionSettings.sessionId) {
        showSessionIndicator(sessionSettings.sessionId);
    }

    // Check for mock mode only if not in session mode
    if (!isSessionEnabled) {
        checkMockMode();
    }

    // Add click handler for admin button if it exists
    const adminButton = document.querySelector('.admin-button');
    if (adminButton) {
        adminButton.onclick = navigateToAdmin;
    }
});

// Update the window unload event to only clean up on browser close, not navigation
window.addEventListener('beforeunload', (e) => {
    // Check if this is a page navigation or browser close
    if (e.clientY < 0) { // Browser close
        sessionStorage.removeItem('sessionEnabled');
        sessionStorage.removeItem('sessionSettings');
    }
});

// Add this function to check settings with proper priority
async function getEffectiveSettings() {
    // First check if session mode is enabled and has settings
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    if (isSessionEnabled) {
        const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
        if (sessionSettings.isActive) {
            return {
                isMock: sessionSettings.IS_MOCK ?? false,
                skipPayment: sessionSettings.SKIP_PAYMENT ?? false,
                disableFauxTimers: sessionSettings.DISABLE_FAUX_TIMERS ?? false
            };
        }
    }

    // If no session settings, fall back to global settings
    try {
        const response = await fetch('/api/admin/settings');
        const settings = await response.json();
        return {
            isMock: settings.IS_MOCK,
            skipPayment: settings.SKIP_PAYMENT,
            disableFauxTimers: settings.DISABLE_FAUX_TIMERS
        };
    } catch (error) {
        console.error('Error fetching settings:', error);
        return null;
    }
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async () => {
    // Check for session mode first
    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    
    if (isSessionEnabled && sessionSettings.isActive) {
        // Show session indicator
        if (sessionSettings.sessionId) {
            showSessionIndicator(sessionSettings.sessionId);
        }
        
        // Show mock mode indicator if enabled in session
        if (sessionSettings.IS_MOCK) {
            document.getElementById('mock-mode-indicator').style.display = 'block';
        }
    } else {
        // Fall back to checking global settings
        try {
            const response = await fetch('/api/check-mock-mode');
            const { isMock } = await response.json();
            if (isMock) {
                document.getElementById('mock-mode-indicator').style.display = 'block';
            }
        } catch (error) {
            console.error('Error checking mock mode:', error);
        }
    }
});

// Add this function to include session settings in fetch calls
function getFetchOptions() {
    const options = {
        headers: {}
    };

    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    if (isSessionEnabled) {
        const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
        if (sessionSettings.isActive) {
            options.headers['X-Session-Settings'] = JSON.stringify({
                IS_MOCK: sessionSettings.IS_MOCK,
                SKIP_PAYMENT: sessionSettings.SKIP_PAYMENT,
                DISABLE_FAUX_TIMERS: sessionSettings.DISABLE_FAUX_TIMERS
            });
        }
    }

    return options;
}

// Update all fetch calls to use these options
async function checkMockMode() {
    try {
        const response = await fetch('/api/check-mock-mode', getFetchOptions());
        const { isMock } = await response.json();
        if (isMock) {
            document.getElementById('mock-mode-indicator').style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking mock mode:', error);
    }
}

// Add this function to get headers with session settings
function getRequestHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };

    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';

    if (isSessionEnabled && sessionSettings.isActive) {
        headers['X-Session-Settings'] = JSON.stringify(sessionSettings);
    }

    return headers;
}

// Update all fetch calls to use these headers
async function checkMockMode() {
    try {
        const response = await fetch('/api/check-mock-mode', {
            headers: getRequestHeaders()
        });
        const { isMock } = await response.json();
        if (isMock) {
            document.getElementById('mock-mode-indicator').style.display = 'block';
        } else {
            document.getElementById('mock-mode-indicator').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking mock mode:', error);
    }
}

// Add this function to periodically check settings
function startSettingsCheck() {
    setInterval(checkMockMode, 1000); // Check every second
}

// Call this on page load
document.addEventListener('DOMContentLoaded', () => {
    checkMockMode();
    startSettingsCheck();
});

// Add this function to handle error messages
function showErrorMessage(message) {
    // Remove any existing error message
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Create new error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <p>${message}</p>
        <p>An error occurred during the bot creation process. Please check the console for more details.</p>
        <button onclick="retryCreation()">Try Again</button>
    `;

    // Find the appropriate container to show the error
    const container = document.getElementById('progress-steps') || 
                     document.getElementById('step3-content') ||
                     document.querySelector('.deployment-container');
    
    if (container) {
        container.appendChild(errorDiv);
    } else {
        // Fallback to appending to body if no container found
        document.body.appendChild(errorDiv);
    }

    // Log error to console
    console.error('Bot creation error:', message);
}

// Add the retry function
function retryCreation() {
    // Remove error message
    document.querySelector('.error-message')?.remove();
    
    // Clear progress steps
    const progressSteps = document.getElementById('progress-steps');
    if (progressSteps) {
        progressSteps.innerHTML = '';
    }
    
    // Go back to step 1
    showStep(1);
}
