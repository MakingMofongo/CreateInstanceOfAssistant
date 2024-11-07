function handleAuth(endpoint) {
    return async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const name = document.getElementById('name')?.value;

        try {
            // Check if we're in mock mode
            const response = await fetch('/api/check-mock');
            const { isMock } = await response.json();

            if (isMock) {
                localStorage.setItem('token', 'mock_token');
                handlePostLoginNavigation();
                return;
            }

            // Regular authentication flow
            const authResponse = await fetch(`/api/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });

            if (!authResponse.ok) {
                const error = await authResponse.json();
                throw new Error(error.message || 'Authentication failed');
            }

            const { token } = await authResponse.json();
            localStorage.setItem('token', token);
            handlePostLoginNavigation();
        } catch (error) {
            alert(error.message);
        }
    };
}

function handlePostLoginNavigation() {
    const useClassicVersion = sessionStorage.getItem('useClassicVersion') === 'true';
    const token = localStorage.getItem('token');
    
    if (useClassicVersion) {
        window.location.href = '/dashboard';
    } else {
        // Add token to the URL when redirecting to new version
        window.location.href = `/new?token=${token}`;
    }
}

// Make sure we have one single event listener for the form
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleAuth('login'));
    }
    
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleAuth('signup'));
    }
});
