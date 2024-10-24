async function fetchDeployedBots() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html'; // Redirect to login if no token
            return;
        }

        const response = await fetch('/api/bots', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('token');
                window.location.href = 'login.html';
                return;
            }
            throw new Error('Failed to fetch bots');
        }

        const bots = await response.json();
        displayBots(bots);
    } catch (error) {
        console.error('Error fetching bots:', error);
        document.getElementById('bot-list').innerHTML = `
            <div class="error-message">
                <p>Error loading bots: ${error.message}</p>
                <button onclick="fetchDeployedBots()">Try Again</button>
            </div>`;
    }
}

function displayBots(bots) {
    const botList = document.getElementById('bot-list');
    if (!bots.length) {
        botList.innerHTML = `
            <div class="no-bots-message">
                <p>You haven't created any bots yet.</p>
                <button onclick="window.location.href='index.html'">Create Your First Bot</button>
            </div>`;
        return;
    }

    botList.innerHTML = bots.map(bot => `
        <div class="bot-card" onclick="showBotDetails('${bot._id}')">
            <h3>${bot.name}</h3>
            <p>Type: ${bot.type}</p>
            <p>Phone: ${bot.phoneNumber}</p>
            <div class="bot-actions">
                <button class="view-details-btn">View Details</button>
            </div>
        </div>
    `).join('');
}

async function showBotDetails(botId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/bots/${botId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch bot details');

        const bot = await response.json();
        
        // Show modal with bot details
        const modal = document.getElementById('botDetailsModal') || createModal();
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>${bot.name}</h2>
                <div class="bot-details">
                    <p><strong>Type:</strong> ${bot.type}</p>
                    <p><strong>Phone Number:</strong> ${bot.phoneNumber}</p>
                    <p><strong>Service URL:</strong> <a href="${bot.serviceUrl}" target="_blank">${bot.serviceUrl}</a></p>
                    <div class="credentials-section">
                        <h3>Access Credentials</h3>
                        <p><strong>Username:</strong> ${bot.username}</p>
                        <p><strong>Password:</strong> ********</p>
                        <button onclick="togglePassword(this)" data-password="${bot.password}">Show Password</button>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = "block";

        // Close modal functionality
        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => modal.style.display = "none";
        window.onclick = (event) => {
            if (event.target === modal) modal.style.display = "none";
        };
    } catch (error) {
        console.error('Error showing bot details:', error);
        alert('Failed to load bot details. Please try again.');
    }
}

function createModal() {
    const modal = document.createElement('div');
    modal.id = 'botDetailsModal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function togglePassword(button) {
    const password = button.getAttribute('data-password');
    if (button.textContent === 'Show Password') {
        button.previousElementSibling.textContent = `Password: ${password}`;
        button.textContent = 'Hide Password';
    } else {
        button.previousElementSibling.textContent = 'Password: ********';
        button.textContent = 'Show Password';
    }
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', fetchDeployedBots);
