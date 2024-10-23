const { spawn } = require('child_process');
const { log } = require('console');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

const IS_MOCK = process.env.IS_MOCK === 'true';
const IS_WINDOWS = process.platform === 'win32';

class DeploymentEmitter extends EventEmitter {}

const deploymentEmitter = new DeploymentEmitter();

function sanitizeServiceName(name) {
    // Remove any non-alphanumeric characters except dashes
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    // Remove any leading or trailing dashes
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    // Ensure it doesn't start with 'goog'
    if (sanitized.startsWith('goog')) {
        sanitized = 'service-' + sanitized;
    }
    // Truncate to 63 characters if longer
    return sanitized.slice(0, 63);
}

function generateRandomString() {
    return Math.random().toString(36).substring(2, 8);
}

async function authenticateServiceAccount() {
    if (IS_MOCK) {
        console.log('Mock: Authenticating service account');
        return Promise.resolve('Mock authentication successful');
    }

    const keyFilePath = path.join(__dirname, 'google_creds.json');
    const keyFileContent = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
    const serviceAccountEmail = keyFileContent.client_email;

    const command = `gcloud auth activate-service-account ${serviceAccountEmail} --key-file=${keyFilePath}`;

    try {
        const result = await executeCommand(command);
        if (result.output.includes('Activated service account credentials')) {
            console.log('Service account authenticated successfully');
            return 'Authentication successful';
        } else {
            throw new Error('Unexpected authentication output');
        }
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
}

async function deployment(serviceName, folderName, randomSuffix) {
    console.log('Original serviceName:', serviceName);
    
    // Sanitize the base service name
    const baseServiceName = sanitizeServiceName(serviceName.split('-')[0]);
    
    // Add the random suffix
    const finalServiceName = `${baseServiceName}-${randomSuffix}`;

    // Ensure the final name is not longer than 63 characters
    const truncatedServiceName = finalServiceName.slice(0, 63);

    console.log('Final sanitized service name:', truncatedServiceName);

    const projectId = 'canvas-replica-402316';

    let command;
    if (folderName === null) {
        // For empty deployment, create a simple Express server
        const tempDir = 'temp_empty_service';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
        
        // Create package.json
        const packageJson = {
            "name": "empty-service",
            "version": "1.0.0",
            "main": "server.js",
            "dependencies": {
                "express": "^4.17.1"
            }
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

        // Create server.js
        const serverContent = `
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Empty Service Running');
});

app.listen(port, () => {
    console.log(\`Server running on port \${port}\`);
});
`;
        fs.writeFileSync(path.join(tempDir, 'server.js'), serverContent);

        // Create Dockerfile
        const dockerfileContent = `
FROM node:14
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD [ "node", "server.js" ]
`;
        fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfileContent);
        
        command = `gcloud run deploy ${truncatedServiceName} --source ${tempDir} --region=asia-south1 --allow-unauthenticated --project=${projectId}`;
    } else {
        command = `gcloud run deploy ${truncatedServiceName} --source ${folderName} --region=asia-south1 --allow-unauthenticated --project=${projectId}`;
    }

    console.log('Executing command:', command);

    if (IS_MOCK) {
        return mockDeployment(finalServiceName);
    }

    try {
        const result = await executeCommand(command, folderName);
        console.log('Deployment result:', result);
        
        // Extract the URL from the deployment output
        const urlMatch = result.output.match(/Service URL:\s*(https:\/\/[^\s]+)/);
        const serviceUrl = urlMatch ? urlMatch[1] : null;

        console.log('Extracted Service URL:', serviceUrl);

        return {
            ...result,
            serviceUrl: serviceUrl
        };
    } catch (error) {
        console.log('Deployment error:', error);
        throw error;
    }
}

function executeCommand(command, folder_name) {
    return new Promise((resolve, reject) => {
        console.log('Starting command execution:', command);
        const process = IS_WINDOWS ? spawn('cmd', ['/c', command]) : spawn('sh', ['-c', command]);
        let output = '';
        let currentStep = '';
        let buildingContainerProgress = 0;

        process.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log('Deployment output:', chunk.trim());

            if (chunk.includes('Building using Dockerfile')) {
                currentStep = 'Building using Dockerfile';
                deploymentEmitter.emit('progress', { step: currentStep, progress: 0 });
            } else if (chunk.includes('Uploading sources')) {
                currentStep = 'Uploading sources';
                deploymentEmitter.emit('progress', { step: currentStep, progress: 10 });
            } else if (chunk.includes('Building Container')) {
                currentStep = 'Building Container';
                buildingContainerProgress += 1;
                deploymentEmitter.emit('progress', { step: currentStep, progress: 10 + (buildingContainerProgress * 0.5) });
            } else if (chunk.includes('Setting IAM Policy')) {
                currentStep = 'Setting IAM Policy';
                deploymentEmitter.emit('progress', { step: currentStep, progress: 70 });
            } else if (chunk.includes('Creating Revision')) {
                currentStep = 'Creating Revision';
                deploymentEmitter.emit('progress', { step: currentStep, progress: 80 });
            } else if (chunk.includes('Routing traffic')) {
                currentStep = 'Routing traffic';
                deploymentEmitter.emit('progress', { step: currentStep, progress: 90 });
            } else if (chunk.includes('Service URL:')) {
                currentStep = 'Deployment complete';
                deploymentEmitter.emit('progress', { step: currentStep, progress: 100 });
            }
        });

        process.stderr.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log('Deployment error output:', chunk.trim()); // Live logging of stderr
        });

        process.on('close', (code) => {
            console.log(`Deployment process exited with code ${code}`);
            if (code !== 0) {
                reject({ success: false, message: `Command failed with code ${code}`, output });
                return;
            }

            resolve({ 
                success: true, 
                output: output,
                message: 'Deployment successful'
            });

            // Clean up temporary directory if it was created
            if (folder_name === null) {
                fs.rmSync('temp_empty_service', { recursive: true, force: true });
            }
        });
    });
}

function mockDeployment(serviceName) {
    console.log('Mock: Deploying service', serviceName);
    return Promise.resolve({
        success: true,
        serviceUrl: `https://${serviceName}-mock-url.asia-south1.run.app`,
        fullServiceName: serviceName,
        message: 'Mock deployment successful'
    });
}

module.exports = { deployment, sanitizeServiceName, generateRandomString, authenticateServiceAccount, deploymentEmitter };

// // Example usage with async/await
// (async () => {
//     try {
//         const result = await deployment('scripttest', 'clone_asst_sAx8OVokdCzjQ5xXivN2wNmw');
//         console.log('Deployment Success:', result);
//     } catch (error) {
//         console.error('Deployment Failed:', error);
//     }
// })();
