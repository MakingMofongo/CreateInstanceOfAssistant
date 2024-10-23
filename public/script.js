// Form Submission Handler
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
    
    showStep(2);
    
    try {
        const response = await fetch('/create-bot', {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error('Failed to initiate bot creation');
        }
        
        const { requestId } = await response.json();
        const eventSource = new EventSource(`/create-bot?requestId=${requestId}`);
        
        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            updateProgressUI(data);
            if (data.status === 'end' || data.error) {
                eventSource.close();
            }
        };
        
        eventSource.onerror = function(error) {
            console.error('EventSource failed:', error);
            updateProgressUI({ error: 'Connection lost. Please try again.' });
            eventSource.close();
        };
    } catch (error) {
        console.error('Fetch error:', error);
        updateProgressUI({ error: 'Failed to send data. Please try again.' });
    }
});

// Update Progress UI
function updateProgressUI(data) {
    const progressSteps = document.getElementById('progress-steps');
    const steps = [
        { title: 'Initializing', description: 'Setting up your AI receptionist', time: '~10 sec' },
        { title: 'Creating Knowledge Base', description: 'Building hotel information database', time: '~20 sec' },
        { title: 'Training AI', description: 'Teaching your AI about your hotel', time: '~30 sec' },
        { title: 'Cloud Setup', description: 'Preparing cloud infrastructure', time: '~20 sec' },
        { title: 'Deployment', description: 'Launching your AI receptionist', time: '~5 min' },
        { title: 'Phone Configuration', description: 'Setting up your phone number', time: '~10 sec' }
    ];

    if (data.status === 'completed') {
        steps.forEach((step, index) => {
            updateStepProgress(progressSteps.querySelector(`.progress-step:nth-child(${index + 1})`), 'completed', 100);
        });
        
        window.generatedPassword = data.password;
        
        document.getElementById('completion-details').innerHTML = `
            <div class="credentials-section">
                <div class="credentials-title">🎉 Your AI Receptionist is Ready! 🎉</div>
                <div class="credential-item">
                    <span class="credential-label">📞 Phone Number:</span>
                    <span class="credential-value">${data.phoneNumber}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">🌐 Service URL:</span>
                    <span class="credential-value clickable-url" onclick="window.open('${data.serviceUrl}/login', '_blank')">${data.serviceUrl}/login</span>
                    <br><small>(Click to open the CONSOLE for this agent)</small>
                </div>
                <div class="credential-item">
                    <span class="credential-label">👤 Username:</span>
                    <span class="credential-value">${data.username}</span>
                </div>
                <div class="credential-item">
                    <span class="credential-label">🔑 Password:</span>
                    <span class="credential-value password-hidden" id="password-value">•••••••</span>
                    <button class="password-toggle" onclick="togglePassword()">Show</button>
                </div>
                <p class="password-warning">🔒 Keep these credentials safe and secure!</p>
            </div>`;
        
        showStep(3);
        celebrate();
    } else if (data.error) {
        progressSteps.innerHTML += `
            <div class="progress-step error">
                <div class="progress-step-header">
                    <div class="progress-step-icon">❌</div>
                    <div class="progress-step-title">Error</div>
                </div>
                <div class="progress-step-description">${data.error}</div>
            </div>
        `;
        showErrorMessage(data.error);
    } else if (data.status !== 'end' && data.status !== 'Connected') {
        const currentStep = steps.findIndex(step => step.title.toLowerCase() === data.status.toLowerCase());
        if (currentStep !== -1) {
            steps.forEach((step, index) => {
                const stepElement = progressSteps.querySelector(`.progress-step:nth-child(${index + 1})`);
                const stepStatus = index < currentStep ? 'completed' : index === currentStep ? 'active' : '';
                const stepProgress = index < currentStep ? 100 : (index === currentStep ? data.progress : 0);
                if (stepElement) {
                    updateStepProgress(stepElement, stepStatus, stepProgress);
                } else {
                    progressSteps.innerHTML += createStepHTML(step, stepStatus, stepProgress);
                }
            });
        }
    }
}

// Create Step HTML
function createStepHTML(step, status, progress) {
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
        </div>
    `;
}

// Update Step Progress
function updateStepProgress(stepElement, status, progress) {
    if (stepElement) {
        stepElement.className = `progress-step ${status}`;
        stepElement.querySelector('.progress-step-icon').textContent = status === 'completed' ? '✓' : '';
        stepElement.querySelector('.progress-bar-fill').style.width = `${progress}%`;
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
    
    if (stepNumber === 1) {
        document.getElementById('step1-content').style.display = 'block';
        document.getElementById('paymentSection').style.display = 'none';
    } else {
        document.getElementById(`step${stepNumber}-content`).classList.add('active');
    }
    document.getElementById(`step${stepNumber}`).classList.add('active');
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

// Add this new function to handle errors
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <p>${message}</p>
        <button onclick="retryCreation()">Try Again</button>
    `;
    document.getElementById('step2-content').appendChild(errorDiv);
}

// Add this new function to retry the creation process
function retryCreation() {
    document.querySelector('.error-message').remove();
    document.getElementById('progress-steps').innerHTML = '';
    showStep(1);
}

// Show payment section after form submission
document.getElementById('createBotForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Check if a pricing plan is selected
    const selectedCard = document.querySelector('.pricing-card.selected');
    if (!selectedCard) {
        alert('Please select a pricing plan before proceeding.');
        return;
    }
    
    const tier = selectedCard.getAttribute('data-tier');
    const isAnnual = document.getElementById('billingToggle').checked;
    const amount = parseInt(selectedCard.querySelector('.amount').textContent);
    const finalAmount = isAnnual ? amount * 10 : amount;

    // Initiate Razorpay payment
    payNow(finalAmount, tier);
});

async function payNow(amount, tier) {
    const amountInCents = Math.round(amount * 100);

    const response = await fetch('/create-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: amountInCents, currency: 'INR', receipt: tier, notes: {} })
    });

    const order = await response.json();

    const options = {
        key: 'rzp_test_nsT1ElDtX6gLGd', // Replace with your Razorpay key
        amount: order.amount,
        currency: order.currency,
        name: 'Your Company Name',
        description: `Payment for ${tier}`,
        order_id: order.id,
        callback_url: '/payment-success',
        prefill: {
            name: 'Your Name',
            email: 'your.email@example.com',
            contact: '9999999999'
        },
        theme: {
            color: '#F37254'
        },
        handler: function (response) {
            fetch('/verify-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature
                })
            }).then(res => res.json())
              .then(data => {
                  if (data.status === 'ok') {
                      alert('Payment successful! Proceeding with deployment.');
                      // Proceed with deployment
                      document.getElementById('paymentSection').style.display = 'none';
                      showStep(2);
                  } else {
                      alert('Payment verification failed. Please try again.');
                  }
              }).catch(error => {
                  console.error('Error:', error);
                  alert('Error verifying payment');
              });
        }
    };

    const rzp = new Razorpay(options);
    rzp.open();
}

// Toggle between monthly and annual billing
document.getElementById('billingToggle').addEventListener('change', function() {
    const isAnnual = this.checked;
    const cards = document.querySelectorAll('.pricing-card');
    cards.forEach(card => {
        const amountElement = card.querySelector('.amount');
        let amount = parseInt(amountElement.textContent);
        if (isAnnual) {
            amount = Math.round(amount * 10); // 2 months free for annual
        } else {
            amount = Math.round(amount / 10);
        }
        amountElement.textContent = amount;
        card.querySelector('.price').innerHTML = `$<span class="amount">${amount}</span>/${isAnnual ? 'year' : 'month'}`;
    });
});

// Handle card selection
document.querySelectorAll('.select-plan').forEach(button => {
    button.addEventListener('click', function() {
        document.querySelectorAll('.pricing-card').forEach(card => {
            card.classList.remove('selected');
        });
        this.closest('.pricing-card').classList.add('selected');
    });
});

// Continue to deployment
document.getElementById('continueToDeployment').addEventListener('click', function() {
    const selectedCard = document.querySelector('.pricing-card.selected');
    if (!selectedCard) {
        alert('Please select a plan before continuing.');
        return;
    }
    const tier = selectedCard.getAttribute('data-tier');
    const isAnnual = document.getElementById('billingToggle').checked;
    const amount = selectedCard.querySelector('.amount').textContent;
    console.log(`Selected plan: ${tier}, Billing: ${isAnnual ? 'Annual' : 'Monthly'}, Amount: $${amount}`);
    
    // Here you would typically send this information to your server
    // For now, we'll just move to the next step
    document.getElementById('paymentSection').style.display = 'none';
    showStep(2);
});

