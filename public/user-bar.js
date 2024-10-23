document.addEventListener('DOMContentLoaded', () => {
    const userBar = document.getElementById('user-bar');
    const container = document.querySelector('.container');
    const accountModal = document.getElementById('account-modal');
    const closeModal = document.getElementById('close-modal');
    const modalUserName = document.getElementById('modal-user-name');
    const modalUserEmail = document.getElementById('modal-user-email');

    // Function to show user bar
    function showUserBar(userData) {
        userBar.querySelector('.user-name').textContent = userData.name;
        userBar.querySelector('.user-avatar').src = `https://api.dicebear.com/6.x/initials/svg?seed=${userData.name}&backgroundColor=ff3e3e`;
        userBar.classList.add('visible');
        container.classList.add('user-bar-visible');
    }

    // Function to hide user bar
    function hideUserBar() {
        userBar.classList.remove('visible');
        container.classList.remove('user-bar-visible');
    }

    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        fetch('/api/user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(userData => {
            showUserBar(userData);
        })
        .catch(error => {
            console.error('Error fetching user data:', error);
            localStorage.removeItem('token');
        });
    }

    // Handle user bar actions
    userBar.addEventListener('click', (e) => {
        const action = e.target.closest('.nav-item')?.dataset.action;
        switch (action) {
            case 'account':
                fetch('/api/user', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                .then(response => response.json())
                .then(userData => {
                    modalUserName.textContent = userData.name;
                    modalUserEmail.textContent = userData.email;
                    accountModal.style.display = 'block';
                });
                break;
            case 'settings':
                // Implement settings functionality
                break;
            case 'logout':
                localStorage.removeItem('token');
                hideUserBar();
                window.location.href = 'login.html';
                break;
        }
    });

    // Close modal
    closeModal.addEventListener('click', () => {
        accountModal.style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === accountModal) {
            accountModal.style.display = 'none';
        }
    });
});
