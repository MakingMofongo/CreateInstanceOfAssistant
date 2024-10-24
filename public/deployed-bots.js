async function fetchDeployedBots() {
    try {
        // Remove the token check
        // const token = localStorage.getItem('token');
        // if (!token) {
        //     throw new Error('No authentication token found');
        // }

        const response = await fetch('/api/bots');

        if (!response.ok) {
            throw new Error('Failed to fetch bots');
        }

        const bots = await response.json();
        displayBots(bots);
    } catch (error) {
        console.error('Error fetching bots:', error);
        // Display error message to user
        document.getElementById('bot-list').innerHTML = `<p>Error loading bots: ${error.message}</p>`;
    }
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', fetchDeployedBots);
