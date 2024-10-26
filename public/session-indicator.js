// Add this initialization code at the top
document.addEventListener('DOMContentLoaded', async () => {
    await showUserInfo();
    checkAndShowSessionIndicator();
});

// Update showUserInfo to handle potential duplicate calls
async function showUserInfo() {
    const existingBar = document.getElementById('user-info-bar');
    if (existingBar) {
        existingBar.remove();
    }

    const userData = await getUserData();
    const userInfo = document.createElement('div');
    userInfo.id = 'user-info-bar';
    userInfo.className = 'user-info-bar';
    
    const content = `
        <div class="user-info-content">
            <div class="user-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="user-details">
                <span class="user-welcome">Welcome back,</span>
                <span class="user-name">${userData.name}</span>
            </div>
            <div class="user-actions">
                <button class="logout-btn" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Logout</span>
                </button>
            </div>
        </div>
    `;
    
    userInfo.innerHTML = content;
    document.body.appendChild(userInfo);
    
    // Show expanded version
    setTimeout(() => {
        userInfo.classList.add('visible');
    }, 100);

    // Collapse after 2 seconds
    setTimeout(() => {
        userInfo.classList.add('compact');
    }, 2000);

    // Add click handler to toggle compact mode
    userInfo.addEventListener('click', () => {
        userInfo.classList.toggle('compact');
    });

    return userInfo;
}

// Add logout handler
function handleLogout() {
    // Clear any stored data
    localStorage.clear();
    sessionStorage.clear();
    
    // Redirect to login page
    window.location.href = '/login.html';
}

// Create a consistent session indicator across all pages
async function showSessionIndicator(sessionId) {
    // Remove any existing indicators
    hideSessionIndicator();
    
    const indicator = document.createElement('div');
    indicator.id = 'session-indicator';
    indicator.className = 'session-indicator';
    
    const mainContent = `
        <div class="session-main">
            <i class="fas fa-user-clock"></i>
            <span>Session Mode</span>
            <span class="session-id">${sessionId.split('_').pop()}</span>
            <i class="fas fa-chevron-down session-toggle"></i>
        </div>
        <div class="session-details">
            <div class="session-settings">
                <div class="setting-item">
                    <span class="setting-label">Mock Mode</span>
                    <span class="setting-value" data-setting="IS_MOCK">❌</span>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Skip Payment</span>
                    <span class="setting-value" data-setting="SKIP_PAYMENT">❌</span>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Disable Timers</span>
                    <span class="setting-value" data-setting="DISABLE_FAUX_TIMERS">❌</span>
                </div>
            </div>
        </div>
    `;
    
    indicator.innerHTML = mainContent;
    document.body.appendChild(indicator);

    // Add click handler for toggle
    const toggle = indicator.querySelector('.session-toggle');
    const handleToggle = (e) => {
        e.stopPropagation();
        indicator.classList.toggle('expanded');
        toggle.classList.toggle('rotated');
    };

    // Add click handlers
    toggle.addEventListener('click', handleToggle);
    indicator.querySelector('.session-main').addEventListener('click', handleToggle);

    // Update settings display
    updateSessionIndicatorSettings();

    // Force visibility after a short delay
    setTimeout(() => {
        indicator.classList.add('visible');
    }, 50);

    return indicator;
}

function hideSessionIndicator() {
    const indicator = document.getElementById('session-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function updateSessionIndicatorSettings() {
    const indicator = document.getElementById('session-indicator');
    if (!indicator) return; // Exit if no indicator exists

    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const settingValues = indicator.querySelectorAll('.setting-value');
    
    settingValues.forEach(value => {
        const setting = value.dataset.setting;
        value.textContent = sessionSettings[setting] ? '✅' : '❌';
        value.className = `setting-value ${sessionSettings[setting] ? 'enabled' : 'disabled'}`;
    });
}

// Add this function to fetch user data
async function getUserData() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }
        const userData = await response.json();
        return userData;
    } catch (error) {
        console.error('Error fetching user data:', error);
        // Always return mock data if fetch fails
        return { 
            name: 'Test User',
            email: 'test@example.com',
            isMock: true
        };
    }
}

// Add this helper function to check if session is active
function isSessionActive() {
    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    return isSessionEnabled && sessionSettings.isActive && sessionSettings.sessionId;
}

// Add this function to handle visibility changes
function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && isSessionActive()) {
        const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings'));
        showSessionIndicator(sessionSettings.sessionId);
    }
}

// Add visibility change listener
document.addEventListener('visibilitychange', handleVisibilityChange);

// Update the checkAndShowSessionIndicator function
function checkAndShowSessionIndicator() {
    const existingIndicator = document.getElementById('session-indicator');
    if (existingIndicator) {
        return;
    }

    const sessionSettings = JSON.parse(sessionStorage.getItem('sessionSettings') || '{}');
    const isSessionEnabled = sessionStorage.getItem('sessionEnabled') === 'true';
    
    if (isSessionEnabled && sessionSettings.isActive && sessionSettings.sessionId) {
        showSessionIndicator(sessionSettings.sessionId);
    }
}

// Remove the MutationObserver and use a simpler approach
let checkTimeout;
function scheduleIndicatorCheck() {
    if (checkTimeout) {
        clearTimeout(checkTimeout);
    }
    checkTimeout = setTimeout(checkAndShowSessionIndicator, 100);
}

// Add event listeners for important state changes
window.addEventListener('load', scheduleIndicatorCheck);
window.addEventListener('pageshow', scheduleIndicatorCheck);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        scheduleIndicatorCheck();
    }
});

// Clean up function
function cleanup() {
    if (checkTimeout) {
        clearTimeout(checkTimeout);
    }
}

// Add cleanup on page unload
window.addEventListener('unload', cleanup);
