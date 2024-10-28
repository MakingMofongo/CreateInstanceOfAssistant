// Shared authentication functions
function handleLogout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

// Check auth status on page load
function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (!token && process.env.IS_MOCK !== 'true') {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Update user display
async function updateUserDisplay() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const userData = await response.json();
        
        const userSection = document.getElementById('userSection');
        const userName = document.getElementById('userName');
        const authButtons = document.getElementById('authButtons');

        if (userSection && userName) {
            if (userData.name) {
                userSection.classList.remove('hidden');
                userName.textContent = userData.name;
                if (authButtons) {
                    authButtons.classList.add('hidden');
                }
            } else {
                userSection.classList.add('hidden');
                if (authButtons) {
                    authButtons.classList.remove('hidden');
                }
            }
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}
