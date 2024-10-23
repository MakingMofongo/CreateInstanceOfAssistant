async function fetchBots() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch('/api/bots', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch bots');

        const bots = await response.json();
        const botList = document.getElementById('botList');
        botList.innerHTML = bots.map(bot => `
            <div class="bot-item">
                <h3>${bot.name}</h3>
                <p>Type: ${bot.type}</p>
                <button onclick="viewBotDetails('${bot._id}')">View Details</button>
            </div>
        `).join('');
    } catch (error) {
        alert(error.message);
    }
}

async function viewBotDetails(botId) {
    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`/api/bots/${botId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch bot details');

        const bot = await response.json();
        alert(`
            Bot Name: ${bot.name}
            Type: ${bot.type}
            Phone Number: ${bot.phoneNumber}
            Service URL: ${bot.serviceUrl}
            Username: ${bot.username}
            Password: ${bot.password}
        `);
    } catch (error) {
        alert(error.message);
    }
}

fetchBots();
