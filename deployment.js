const { spawn } = require('child_process');
const { log } = require('console');

function sanitizeServiceName(name) {
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    return sanitized.slice(0, 63);
}

function deployment(serviceName, folder_name) {
    serviceName = sanitizeServiceName(serviceName + Math.random().toString(36).substring(7));
    log('serviceName:', serviceName);

    const sourcePath = folder_name;
    const region = 'asia-south1';

    const command = `gcloud run deploy ${serviceName} --source ${sourcePath} --region=${region} --allow-unauthenticated`;
    log('Executing command:', command);

    return new Promise((resolve, reject) => {
        const process = spawn('cmd', ['/c', command], { shell: true });
        let output = '';

        process.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            log('Deployment output:', chunk);
        });

        process.stderr.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            log('Deployment:', chunk);
        });

        process.on('close', (code) => {
            log(`Deployment process exited with code ${code}`);
            if (code !== 0) {
                reject({ success: false, message: `Command failed with code ${code}`, output });
                return;
            }

            const urlMatch = output.match(/Service URL:\s*(https:\/\/[^\s]+)/);
            const fullServiceNameMatch = output.match(/Service \[([^\]]+)\] revision/);

            if (urlMatch && fullServiceNameMatch) {
                resolve({ 
                    success: true, 
                    serviceUrl: urlMatch[1], 
                    fullServiceName: fullServiceNameMatch[1],
                    message: output 
                });
            } else {
                reject({ success: false, message: 'Service URL or full service name not found in the output.', output });
            }
        });
    });
}

module.exports = { deployment, sanitizeServiceName };

// Example usage with async/await
(async () => {
    try {
        const result = await deployment('scripttest', 'clone_asst_sAx8OVokdCzjQ5xXivN2wNmw');
        console.log('Deployment Success:', result);
    } catch (error) {
        console.error('Deployment Failed:', error);
    }
})();
