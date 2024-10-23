document.addEventListener('DOMContentLoaded', () => {
    fetchDeployedBots();
});

async function fetchDeployedBots() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No token found');
        return;
    }

    try {
        const response = await fetch('/api/bots', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch bots');
        }

        const bots = await response.json();
        displayBots(bots);
    } catch (error) {
        console.error('Error fetching bots:', error);
    }
}

function displayBots(bots) {
    const botList = document.getElementById('bot-list');
    botList.innerHTML = '';

    bots.forEach(bot => {
        const botCard = document.createElement('div');
        botCard.className = 'bot-card';
        botCard.innerHTML = `
            <h3>${bot.name}</h3>
            <p>Type: ${bot.type}</p>
            <p>Created: ${new Date(bot.createdAt).toLocaleDateString()}</p>
        `;
        botCard.addEventListener('click', () => showBotDetails(bot));
        botList.appendChild(botCard);
    });
}

function showBotDetails(bot) {
    const modal = document.getElementById('bot-details-modal');
    const botDetails = document.getElementById('bot-details');
    botDetails.innerHTML = `
        <h3>${bot.name}</h3>
        <p><strong>Type:</strong> ${bot.type}</p>
        <p><strong>Assistant ID:</strong> ${bot.assistantId}</p>
        <p><strong>Phone Number:</strong> ${bot.phoneNumber}</p>
        <p><strong>Dev Console:</strong> <a href="${bot.serviceUrl}/login" target="_blank">${bot.serviceUrl}/login</a></p>
        <p><strong>Username:</strong> ${bot.username}</p>
        <p>
            <strong>Password:</strong> 
            <span id="bot-password" style="display: none;">${bot.password}</span>
            <span id="bot-password-hidden">********</span>
            <button id="toggle-password" class="password-toggle">Show</button>
        </p>
        <p><strong>Created:</strong> ${new Date(bot.createdAt).toLocaleString()}</p>
    `;
    modal.style.display = 'block';

    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => {
        modal.style.display = 'none';
    };

    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordSpan = document.getElementById('bot-password');
    const passwordHiddenSpan = document.getElementById('bot-password-hidden');

    togglePasswordBtn.onclick = () => {
        if (passwordSpan.style.display === 'none') {
            passwordSpan.style.display = 'inline';
            passwordHiddenSpan.style.display = 'none';
            togglePasswordBtn.textContent = 'Hide';
        } else {
            passwordSpan.style.display = 'none';
            passwordHiddenSpan.style.display = 'inline';
            togglePasswordBtn.textContent = 'Show';
        }
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}
