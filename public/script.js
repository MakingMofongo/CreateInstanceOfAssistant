function changeHiltonUrl() {
    console.log("Initiating Hilton URL change");
    fetch('/change-hilton-url', {
        method: 'POST',
    })
    .then(response => {
        console.log("Response status:", response.status);
        return response.json();
    })
    .then(data => {
        console.log("Response data:", data);
        if (data.success) {
            alert('Successfully changed URL for +13394997114 to Hilton Edinburgh Assistant');
        } else {
            alert(`Failed to change URL. Error: ${data.error || 'Unknown error'}`);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred. Please check the console for details.');
    });
}

// Add this new function for the DEV button functionality
function setupRevealButton() {
    const revealButton = document.querySelector('.reveal-button');
    const container = document.querySelector('.reveal-button-container');

    revealButton.addEventListener('click', () => {
        container.classList.toggle('active');
    });

    // Close the hidden content when clicking outside
    document.addEventListener('click', (event) => {
        if (!container.contains(event.target)) {
            container.classList.remove('active');
        }
    });
}

// Make sure this function is called when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupRevealButton();
    document.getElementById('changeHiltonUrl').addEventListener('click', changeHiltonUrl);
});
