let currentMode = 'global';
let sessionId = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeAdminSettings();
    updateSystemStatus();
    setInterval(updateSystemStatus, 30000);

    // Add event listeners for mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Update current mode
            currentMode = btn.dataset.mode;
            // Store current mode in sessionStorage
            sessionStorage.setItem('currentMode', currentMode);
            // Load appropriate settings
            loadSettings(currentMode);
        });
    });

    // Check if session mode was previously set
    const storedMode = sessionStorage.getItem('currentMode');
    if (storedMode) {
        currentMode = storedMode;
        document.querySelector(`.mode-btn[data-mode="${currentMode}"]`).classList.add('active');
        loadSettings(currentMode);
    }

    // Add back button functionality
    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back';
    backButton.onclick = () => {
        const previousPage = sessionStorage.getItem('previousPage') || 'index.html';
        window.location.replace(previousPage);
    };
    document.querySelector('.admin-header').prepend(backButton);

    // Ensure admin button visibility
    ensureAdminButtonVisibility();
    
    // Add periodic check for admin button visibility
    setInterval(ensureAdminButtonVisibility, 1000);
});

async function loadSettings(mode) {
    try {
        if (mode === 'session') {
            // Show session enable button
            const sessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
            const sessionEnableBtn = document.getElementById('sessionEnableBtn');
            if (sessionEnableBtn) {
                sessionEnableBtn.style.display = 'block';
                sessionEnableBtn.textContent = sessionEnabled ? 'Disable Session Mode' : 'Enable Session Mode';
            }
            
            // Get session settings
            const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
            
            // Update switches based on session settings
            updateSwitchesFromSettings({
                mockMode: sessionSettings.IS_MOCK || false,
                skipPayment: sessionSettings.SKIP_PAYMENT || false,
                disableFauxTimers: sessionSettings.DISABLE_FAUX_TIMERS || false
            });

            // Enable/disable switches based on session state
            const switches = document.querySelectorAll('.setting-card input[type="checkbox"]');
            switches.forEach(sw => {
                sw.disabled = !sessionEnabled;
            });

        } else {
            // Hide session enable button for global mode
            const sessionEnableBtn = document.getElementById('sessionEnableBtn');
            if (sessionEnableBtn) {
                sessionEnableBtn.style.display = 'none';
            }

            // Enable all switches in global mode
            const switches = document.querySelectorAll('.setting-card input[type="checkbox"]');
            switches.forEach(sw => {
                sw.disabled = false;
            });

            // Load global settings from server
            const response = await fetch('/api/admin/settings');
            if (!response.ok) {
                throw new Error('Failed to fetch settings');
            }
            const settings = await response.json();
            console.log('Received global settings:', settings);
            
            // Update switches based on global settings
            const switchSettings = {
                mockMode: settings.IS_MOCK,
                skipPayment: settings.SKIP_PAYMENT,
                disableFauxTimers: settings.DISABLE_FAUX_TIMERS
            };
            console.log('Updating switches with:', switchSettings);
            updateSwitchesFromSettings(switchSettings);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Failed to load settings: ' + error.message, 'error');
    }
}

function updateSwitchesFromSettings(settings) {
    console.log('Updating switches with settings:', settings);
    Object.entries(settings).forEach(([key, value]) => {
        const switchElement = document.getElementById(key);
        // Fix the status element ID mapping
        const statusElementId = key === 'disableFauxTimers' ? 'disableFauxTimersStatus' : `${key}Status`;
        const statusElement = document.getElementById(statusElementId);
        
        if (switchElement && statusElement) {
            switchElement.checked = value;
            statusElement.textContent = value ? 'Enabled' : 'Disabled';
            console.log(`Updated switch ${key} to ${value}`);
        } else {
            console.warn(`Could not find elements for ${key}`, {
                switchFound: !!switchElement,
                statusFound: !!statusElement,
                statusId: statusElementId
            });
        }
    });
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

// Update the initializeSwitch function
function initializeSwitch(elementId, settingKey) {
    const switchElement = document.getElementById(elementId);
    // Fix the status element ID mapping
    const statusElementId = elementId === 'disableFauxTimers' ? 'disableFauxTimersStatus' : `${elementId}Status`;
    const statusElement = document.getElementById(statusElementId);
    
    if (switchElement && statusElement) {
        switchElement.addEventListener('change', async () => {
            const isEnabled = switchElement.checked;
            console.log(`Switch ${elementId} (${settingKey}) changed to ${isEnabled}`);
            
            try {
                if (currentMode === 'session') {
                    if (sessionStorage.getItem('sessionEnabled') !== 'true') {
                        throw new Error('Session mode is not enabled');
                    }

                    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
                    sessionSettings[settingKey] = isEnabled;
                    sessionStorage.setItem('sessionSettings', JSON.stringify(sessionSettings));
                    
                    updateSessionIndicatorSettings();
                    
                    statusElement.textContent = isEnabled ? 'Enabled' : 'Disabled';
                    showToast(`${settingKey} ${isEnabled ? 'enabled' : 'disabled'} (session mode)`, 'success');
                } else {
                    // Handle global settings
                    const settingToUpdate = {
                        [settingKey]: isEnabled
                    };
                    console.log('Updating global setting:', settingToUpdate);

                    const response = await fetch('/api/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(settingToUpdate)
                    });

                    if (!response.ok) {
                        throw new Error('Failed to update setting');
                    }

                    const result = await response.json();
                    console.log('Server response:', result);
                    
                    if (result.success) {
                        statusElement.textContent = isEnabled ? 'Enabled' : 'Disabled';
                        showToast(`${settingKey} ${isEnabled ? 'enabled' : 'disabled'} (global mode)`, 'success');
                    } else {
                        throw new Error('Failed to update setting');
                    }
                }
            } catch (error) {
                console.error('Error updating setting:', error);
                showToast(error.message, 'error');
                // Revert switch state
                switchElement.checked = !isEnabled;
                statusElement.textContent = !isEnabled ? 'Enabled' : 'Disabled';
            }
        });
    } else {
        console.error(`Could not find elements for ${elementId}`, {
            switchFound: !!switchElement,
            statusFound: !!statusElement,
            statusId: statusElementId
        });
    }
}

// Update the initializeAdminSettings function
function initializeAdminSettings() {
    // Initialize switches with correct environment variable names
    initializeSwitch('mockMode', 'IS_MOCK');
    initializeSwitch('skipPayment', 'SKIP_PAYMENT');
    initializeSwitch('disableFauxTimers', 'DISABLE_FAUX_TIMERS');
    
    // Load initial settings
    loadSettings(currentMode);
    
    // Add periodic refresh for global settings
    setInterval(() => {
        if (currentMode === 'global') {
            loadSettings('global');
        }
    }, 5000);
}

async function updateSystemStatus() {
    try {
        const [apiResponse, dbResponse] = await Promise.all([
            fetch('/test-json'),
            fetch('/api/check-mock-mode')
        ]);

        // Update API status
        const apiStatus = document.querySelector('.status-card:nth-child(1) .status-indicator');
        apiStatus.className = `status-indicator ${apiResponse.ok ? 'online' : 'offline'}`;
        apiStatus.querySelector('.status-text').textContent = apiResponse.ok ? 'Online' : 'Offline';

        // Update DB status
        const dbStatus = document.querySelector('.status-card:nth-child(2) .status-indicator');
        dbStatus.className = `status-indicator ${dbResponse.ok ? 'online' : 'offline'}`;
        dbStatus.querySelector('.status-text').textContent = dbResponse.ok ? 'Connected' : 'Disconnected';

        // Update active users (mock data for now)
        document.getElementById('activeUsers').textContent = Math.floor(Math.random() * 20) + 1;
    } catch (error) {
        console.error('Error updating system status:', error);
    }
}

function savePhoneNumber() {
    const phoneNumber = document.getElementById('defaultPhone').value;
    localStorage.setItem('defaultPhoneNumber', phoneNumber);
    showToast('Default phone number saved', 'success');
}

function saveMockDuration() {
    const duration = document.getElementById('mockTimerDuration').value;
    localStorage.setItem('mockTimerDuration', duration);
    showToast('Mock timer duration saved', 'success');
}

function clearCache() {
    if (confirm('Are you sure you want to clear all cached data?')) {
        localStorage.clear();
        sessionStorage.clear();
        showToast('Cache cleared successfully', 'success');
    }
}

// Rest of the admin.js code remains the same as in script.js

// Add this function to handle session mode toggle
function toggleSessionMode() {
    const isEnabled = sessionStorage.getItem('sessionEnabled') !== 'true';
    
    if (!isEnabled) {
        // Clear session settings when disabling
        sessionStorage.removeItem('sessionSettings');
        sessionStorage.removeItem('sessionEnabled');
        hideSessionIndicator();
        
        // Reset all switches to disabled state
        const switches = document.querySelectorAll('.setting-card input[type="checkbox"]');
        switches.forEach(sw => {
            sw.disabled = true;
            sw.checked = false;
            const statusElement = document.getElementById(`${sw.id}Status`);
            if (statusElement) {
                statusElement.textContent = 'Disabled';
            }
        });

        // Ensure admin button is visible
        const adminButton = document.querySelector('.admin-button');
        if (adminButton) {
            adminButton.style.display = 'flex';
        }
    } else {
        // Initialize session settings when enabling
        const sessionId = 'session_' + Math.random().toString(36).substring(7);
        const sessionSettings = {
            isActive: true,
            sessionId: sessionId,
            IS_MOCK: false,
            SKIP_PAYMENT: false,
            DISABLE_FAUX_TIMERS: false,
            startTime: Date.now()
        };
        
        // Set session storage values
        sessionStorage.setItem('sessionEnabled', 'true');
        sessionStorage.setItem('sessionSettings', JSON.stringify(sessionSettings));
        
        // Enable switches but keep them unchecked
        const switches = document.querySelectorAll('.setting-card input[type="checkbox"]');
        switches.forEach(sw => {
            sw.disabled = false;
            sw.checked = false;
            const statusElement = document.getElementById(`${sw.id}Status`);
            if (statusElement) {
                statusElement.textContent = 'Disabled';
            }
        });

        // Ensure admin button is visible
        const adminButton = document.querySelector('.admin-button');
        if (adminButton) {
            adminButton.style.display = 'flex';
        }

        // Show session indicator after a short delay
        setTimeout(() => {
            showSessionIndicator(sessionId);
        }, 100);
    }
    
    // Update button text
    const sessionEnableBtn = document.getElementById('sessionEnableBtn');
    if (sessionEnableBtn) {
        sessionEnableBtn.textContent = isEnabled ? 'Disable Session Mode' : 'Enable Session Mode';
    }
    
    showToast(`Session mode ${isEnabled ? 'enabled' : 'disabled'}`, 'success');
}

// Add session check on page load
window.addEventListener('load', () => {
    // Check session age and clean up if too old (e.g., 24 hours)
    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    if (sessionSettings.startTime) {
        const sessionAge = Date.now() - sessionSettings.startTime;
        if (sessionAge > 24 * 60 * 60 * 1000) { // 24 hours
            sessionStorage.removeItem('sessionEnabled');
            sessionStorage.removeItem('sessionSettings');
            window.location.reload();
        }
    }
});

// Add this function to ensure admin button visibility
function ensureAdminButtonVisibility() {
    const adminButton = document.querySelector('.admin-button');
    if (adminButton) {
        adminButton.style.display = 'flex';
    }
}
