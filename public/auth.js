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
                // In mock mode, use test credentials
                localStorage.setItem('token', 'mock_token');
                // Check for redirect after login
                const redirectTo = sessionStorage.getItem('redirectAfterLogin');
                if (redirectTo === '/new') {
                    sessionStorage.removeItem('redirectAfterLogin');
                    window.location.href = '/new';
                } else {
                    window.location.href = 'index.html';
                }
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
            
            // Check for redirect after login
            const redirectTo = sessionStorage.getItem('redirectAfterLogin');
            if (redirectTo === '/new') {
                sessionStorage.removeItem('redirectAfterLogin');
                window.location.href = `/new?token=${token}`;
            } else {
                window.location.href = 'index.html';
            }
        } catch (error) {
            alert(error.message);
        }
    };
}

document.getElementById('loginForm')?.addEventListener('submit', handleAuth('login'));
document.getElementById('signupForm')?.addEventListener('submit', handleAuth('signup'));
