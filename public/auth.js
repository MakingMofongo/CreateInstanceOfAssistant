function handleAuth(endpoint) {
    return async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const name = document.getElementById('name')?.value;

        try {
            const response = await fetch(`/api/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });

            if (!response.ok) throw new Error('Authentication failed');

            const { token } = await response.json();
            localStorage.setItem('token', token);
            window.location.href = 'index.html'; // Redirect to main page
        } catch (error) {
            alert(error.message);
        }
    };
}

document.getElementById('loginForm')?.addEventListener('submit', handleAuth('login'));
document.getElementById('signupForm')?.addEventListener('submit', handleAuth('signup'));
