const { spawn } = require('child_process');
const { log } = require('console');
const path = require('path');
const fs = require('fs');

const IS_MOCK = process.env.IS_MOCK === 'true';
const IS_WINDOWS = process.platform === 'win32';

function sanitizeServiceName(name) {
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    sanitized = sanitized.replace(/^-+|-+$/g, '');
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

async function deployment(serviceName, folder_name, randomSuffix) {
    serviceName = sanitizeServiceName(serviceName + '-' + randomSuffix);
    log('serviceName:', serviceName);

    const projectId = 'canvas-replica-402316';

    let command;
    if (folder_name === null) {
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
        
        command = `gcloud run deploy ${serviceName} --source ${tempDir} --region=asia-south1 --allow-unauthenticated --project=${projectId}`;
    } else {
        command = `gcloud run deploy ${serviceName} --source ${folder_name} --region=asia-south1 --allow-unauthenticated --project=${projectId}`;
    }

    log('Executing command:', command);

    if (IS_MOCK) {
        return mockDeployment(serviceName);
    }

    const result = await executeCommand(command, folder_name);
    
    // Extract the URL from the deployment output
    const urlMatch = result.output.match(/Service URL:\s*(https:\/\/[^\s]+)/);
    const serviceUrl = urlMatch ? urlMatch[1] : null;

    return {
        ...result,
        serviceUrl: serviceUrl
    };
}

function executeCommand(command, folder_name) {
    return new Promise((resolve, reject) => {
        const process = IS_WINDOWS ? spawn('cmd', ['/c', command]) : spawn('sh', ['-c', command]);
        let output = '';

        process.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            log('Deployment output:', chunk);
        });

        process.stderr.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            log('Deployment Info:', chunk);
        });

        process.on('close', (code) => {
            log(`Deployment process exited with code ${code}`);
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

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        const process = IS_WINDOWS ? spawn('cmd', ['/c', command]) : spawn('sh', ['-c', command]);
        let output = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            output += data.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                reject({ success: false, message: `Command failed with code ${code}`, output });
            } else {
                resolve({ success: true, output });
            }
        });
    });
}

module.exports = { deployment, sanitizeServiceName, generateRandomString, authenticateServiceAccount };

// // Example usage with async/await
// (async () => {
//     try {
//         const result = await deployment('scripttest', 'clone_asst_sAx8OVokdCzjQ5xXivN2wNmw');
//         console.log('Deployment Success:', result);
//     } catch (error) {
//         console.error('Deployment Failed:', error);
//     }
// })();
