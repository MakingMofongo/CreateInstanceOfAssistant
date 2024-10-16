const { exec } = require('child_process');
const { log } = require('console');

function deployment(serviceName, folder_name) {
    // Add random hash to the service name
    serviceName = serviceName + Math.random().toString(36).substring(7);
    log('serviceName:', serviceName);

    // Variables for name, source, and region
    const sourcePath = folder_name; // Use the folder_name parameter for the source path
    const region = 'asia-south1';

    // Construct the gcloud command using the variables
    const command = `gcloud run deploy ${serviceName} --source ${sourcePath} --region=${region} --allow-unauthenticated`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ success: false, message: error.message });
                return;
            }

            // Combine stdout and stderr to search for the URL
            const combinedOutput = `${stdout}\n${stderr}`;

            // Enhanced regex to capture the Service URL
            const urlMatch = combinedOutput.match(/Service URL:\s*(https:\/\/[^\s]+)/);

            if (urlMatch) {
                resolve({ success: true, serviceUrl: urlMatch[1], message: combinedOutput });
            } else {
                reject({ success: false, message: 'Service URL not found in the output.' });
            }
        });
    });
}

// Export the deployment function
module.exports = { deployment };

// // Example usage with async/await
// (async () => {
//     try {
//         const result = await deployment('scripttest', 'clone_asst_sAx8OVokdCzjQ5xXivN2wNmw');
//         console.log('Deployment Success:', result);
//     } catch (error) {
//         console.error('Deployment Failed:', error);
//     }
// })();
