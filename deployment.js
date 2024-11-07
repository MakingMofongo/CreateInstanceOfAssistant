const { spawn } = require('child_process');
const { log } = require('console');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const { writeFile } = require('fs').promises;
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

const IS_WINDOWS = process.platform === 'win32';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'canvas-replica-402316';

const deploymentEmitter = new EventEmitter();

function sanitizeServiceName(name) {
    if (!name) return 'service-' + generateRandomString();
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

async function authenticateServiceAccount(keyFilePath) {
    if (!keyFilePath) {
        throw new Error('Key file path is required');
    }

    if (process.env.IS_MOCK === 'true') {
        console.log('Mock: Authenticating service account');
        return Promise.resolve('Mock authentication successful');
    }

    try {
        // Verify key file exists
        if (!fs.existsSync(keyFilePath)) {
            throw new Error(`Service account key file not found at: ${keyFilePath}`);
        }

        // Read and validate key file content
        const keyFileContent = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
        if (!keyFileContent.client_email) {
            throw new Error('Invalid service account key file: missing client_email');
        }

        const serviceAccountEmail = keyFileContent.client_email;
        
        // Normalize path and wrap in quotes if it contains spaces
        const normalizedPath = keyFilePath.replace(/\\/g, '/');
        const quotedPath = `"${normalizedPath}"`;
        
        // Construct command with proper path formatting
        const command = IS_WINDOWS ? 
            `gcloud auth activate-service-account ${serviceAccountEmail} --key-file=${quotedPath}` :
            `gcloud auth activate-service-account ${serviceAccountEmail} --key-file=${quotedPath}`;

        console.log('Executing auth command:', command);

        const result = await executeCommand(command);
        
        // Check for successful activation in both output and errorOutput
        const outputText = (result.output || '').toLowerCase();
        const errorText = (result.errorOutput || '').toLowerCase();
        
        // More lenient success check - look for various success indicators
        const successIndicators = [
            'activated service account credentials',
            'activated credentials',
            'successfully activated'
        ];
        
        const isSuccess = successIndicators.some(indicator => 
            outputText.includes(indicator.toLowerCase()) || 
            errorText.includes(indicator.toLowerCase())
        );

        if (isSuccess) {
            console.log('Service account authenticated successfully');
            return 'Authentication successful';
        }

        // If we got output but no success indicators, log it for debugging
        if (outputText || errorText) {
            console.log('Authentication output:', outputText);
            console.log('Authentication errors:', errorText);
        }

        // Verify authentication status directly
        try {
            const verifyCommand = 'gcloud auth list --filter=status:ACTIVE --format="value(account)"';
            const verifyResult = await executeCommand(verifyCommand);
            const activeAccounts = verifyResult.output.trim().split('\n');
            
            if (activeAccounts.includes(serviceAccountEmail)) {
                console.log('Service account verified as active');
                return 'Authentication successful';
            }
        } catch (verifyError) {
            console.error('Failed to verify authentication status:', verifyError);
        }

        throw new Error('Authentication status could not be confirmed');
    } catch (error) {
        console.error('Authentication failed:', error);
        // Add more context to the error
        throw new Error(`Authentication failed: ${error.message}\nCommand output: ${error.output || 'No output'}\nError output: ${error.errorOutput || 'No error output'}`);
    }
}

// Update executeCommand to be simpler and more reliable
function executeCommand(command, folder_name) {
    return new Promise((resolve, reject) => {
        console.log(`[${new Date().toISOString()}] Executing command:`, command);
        
        let cmdProcess;
        const processEnv = { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' };

        // For tracking build progress
        let isCompleted = false;
        
        // Emit heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
            if (!isCompleted && command.includes('gcloud builds submit')) {
                const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
                deploymentEmitter.emit('heartbeat', {
                    status: 'Deploying',
                    message: `Build in progress - ${elapsedMinutes}m elapsed`,
                    elapsedMinutes
                });
            }
        }, 30000);

        const startTime = Date.now();

        // Create process based on platform
        if (IS_WINDOWS) {
            const args = command.match(/(?:[^\s"]+|"[^"]*")+/g);
            const cmd = args.shift();
            cmdProcess = spawn(cmd, args, { 
                shell: true,
                cwd: folder_name || undefined,
                env: processEnv
            });
        } else {
            cmdProcess = spawn('/bin/bash', ['-c', command], {
                cwd: folder_name || undefined,
                env: processEnv
            });
        }

        let output = '';
        let errorOutput = '';

        cmdProcess.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            console.log(`[${new Date().toISOString()}] ${text.trim()}`);
        });

        cmdProcess.stderr.on('data', (data) => {
            const text = data.toString();
            errorOutput += text;
            console.error(text.trim());
        });

        cmdProcess.on('close', (code) => {
            clearInterval(heartbeatInterval);
            isCompleted = true;

            if (code !== 0) {
                const error = new Error(`Command failed with code ${code}`);
                error.code = code;
                error.output = output;
                error.errorOutput = errorOutput;
                error.cmd = command;
                reject(error);
                return;
            }

            // If this was a build command, emit completion
            if (command.includes('gcloud builds submit')) {
                deploymentEmitter.emit('progress', {
                    status: 'Final Configuration',
                    stage: 'Deployment complete!',
                    progress: 100,
                    buildMessage: 'Deployment successful'
                });
            }

            resolve({ success: true, output, message: 'Command successful' });
        });

        cmdProcess.on('error', (error) => {
            clearInterval(heartbeatInterval);
            isCompleted = true;
            error.output = output;
            error.errorOutput = errorOutput;
            error.cmd = command;
            reject(error);
        });
    });
}

// Update deployment function to be simpler
async function deployment(serviceName, folderName, randomSuffix, settings = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            const isMockMode = settings.IS_MOCK || process.env.IS_MOCK === 'true';
            
            if (isMockMode) {
                const mockResult = await mockDeployment(serviceName);
                resolve(mockResult);
                return;
            }

            // Emit initial progress
            deploymentEmitter.emit('progress', {
                status: 'Final Configuration',
                stage: 'Starting deployment...',
                progress: 10
            });

            // Configure Docker and prepare deployment
            await configureDockerAuth();
            
            const baseServiceName = sanitizeServiceName(serviceName.split('-')[0]);
            const finalServiceName = `${baseServiceName}-${randomSuffix}`;
            const truncatedServiceName = finalServiceName.slice(0, 63);
            
            let sourceDir = folderName;
            if (!folderName) {
                sourceDir = await createEmptyService();
            }

            try {
                // Execute build command
                const command = `gcloud builds submit "${sourceDir}" --config="${sourceDir}/cloudbuild.yaml" --substitutions=_SERVICE_NAME=${truncatedServiceName} --timeout=600s --verbosity=info`;
                const result = await executeCommand(command);

                // Extract service URL
                const urlMatch = result.output.match(/Service URL:\s*(https:\/\/[^\s]+)/);
                const serviceUrl = urlMatch ? `${urlMatch[1]}/login` : null;

                if (!serviceUrl) {
                    throw new Error('Failed to obtain service URL');
                }

                resolve({
                    success: true,
                    serviceUrl,
                    output: result.output
                });
            } finally {
                // Clean up temp directory if created
                if (!folderName && sourceDir) {
                    fs.rmSync(sourceDir, { recursive: true, force: true });
                }
            }
        } catch (error) {
            console.error('Deployment error:', error);
            reject(error);
        }
    });
}

// Add function to configure Docker authentication
async function configureDockerAuth() {
    try {
        const result = await executeCommand('gcloud auth configure-docker asia-south1-docker.pkg.dev --quiet');
        console.log('Docker authentication configured:', result);
    } catch (error) {
        console.error('Failed to configure Docker auth:', error);
        // Continue anyway as it might already be configured
    }
}

async function createEmptyService() {
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
    await writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Copy package-lock.json from Source directory
    try {
        await fs.promises.copyFile(
            path.join(__dirname, 'Source', 'package-lock.json'),
            path.join(tempDir, 'package-lock.json')
        );
        console.log('Successfully copied package-lock.json from Source');
    } catch (error) {
        console.error('Error copying package-lock.json:', error);
        // If copy fails, generate package-lock.json using npm install
        console.log('Generating package-lock.json using npm install...');
        await executeCommand('npm install', tempDir);
    }

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
    await writeFile(path.join(tempDir, 'server.js'), serverContent);

    // Create Dockerfile
    const dockerfileContent = `
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first to leverage cache
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy rest of the application
COPY . .

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/*.js ./

# Expose port
EXPOSE 8080

# Start the application
CMD [ "node", "server.js" ]
`;
    await writeFile(path.join(tempDir, 'Dockerfile'), dockerfileContent);

    // Create cloudbuild.yaml with enhanced logging
    const cloudBuildContent = `steps:
  - name: 'gcr.io/kaniko-project/executor:latest'
    args:
      - '--destination=asia-south1-docker.pkg.dev/\${PROJECT_ID}/docker-repo/\${_SERVICE_NAME}'
      - '--cache=true'
      - '--cache-ttl=24h'
      - '--context=.'
      - '--dockerfile=./Dockerfile'
      - '--build-arg=PORT=8080'
      - '--verbosity=info'
      - '--log-format=text'
      - '--log-timestamp'

  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    id: 'deploy-service'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        echo "Starting temporary service deployment..."
        echo "Service name: \${_SERVICE_NAME}"
        echo "Region: asia-south1"
        
        gcloud run deploy \${_SERVICE_NAME} \\
          --image=asia-south1-docker.pkg.dev/\${PROJECT_ID}/docker-repo/\${_SERVICE_NAME} \\
          --region=asia-south1 \\
          --platform=managed \\
          --allow-unauthenticated \\
          --project=\${PROJECT_ID} \\
          --format=json \\
          --verbosity=info

        echo "Temporary service deployment completed"

substitutions:
  _SERVICE_NAME: default-service-name`;
    
    await writeFile(path.join(tempDir, 'cloudbuild.yaml'), cloudBuildContent.replace(/\${PROJECT_ID}/g, PROJECT_ID));
    
    return tempDir;
}

// Add retry logic and proxy handling
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Add a function to check network connectivity
async function checkNetworkConnectivity() {
    try {
        const result = await executeCommand('gcloud info --run-diagnostics');
        return result.output.includes('Network diagnostic passed') || 
               result.output.includes('Compute Engine API') ||  // Additional success indicators
               result.output.includes('Cloud Run API');
    } catch (error) {
        console.error('Network diagnostic failed:', error);
        // If we can execute the command but get an error, we still have connectivity
        if (error.output || error.errorOutput) {
            return true;
        }
        return false;
    }
}

function mockDeployment(serviceName) {
    console.log('Mock: Deploying service', serviceName);
    
    // Emit initial progress
    deploymentEmitter.emit('progress', {
        status: 'Final Configuration',
        stage: 'Starting mock deployment...',
        progress: 10,
        buildMessage: 'Initializing mock deployment'
    });

    // Return a promise that resolves after simulating deployment steps
    return new Promise((resolve) => {
        // Simulate deployment steps with timeouts
        setTimeout(() => {
            deploymentEmitter.emit('progress', {
                status: 'Final Configuration',
                stage: 'Building mock container...',
                progress: 30,
                buildMessage: 'Building mock container'
            });
        }, 1000);

        setTimeout(() => {
            deploymentEmitter.emit('progress', {
                status: 'Final Configuration',
                stage: 'Configuring mock service...',
                progress: 60,
                buildMessage: 'Configuring mock service'
            });
        }, 2000);

        setTimeout(() => {
            deploymentEmitter.emit('progress', {
                status: 'Final Configuration',
                stage: 'Finalizing mock deployment...',
                progress: 90,
                buildMessage: 'Finalizing mock deployment'
            });
        }, 3000);

        // Resolve with mock data after all steps
        setTimeout(() => {
            // Emit final progress update
            deploymentEmitter.emit('progress', {
                status: 'Final Configuration',
                stage: 'Deployment complete!',
                progress: 100,
                buildMessage: 'Mock deployment successful'
            });

            // Generate mock credentials
            const mockCredentials = {
                username: 'mock_user_' + Math.random().toString(36).substring(7),
                password: 'mock_pass_' + Math.random().toString(36).substring(7)
            };

            // Resolve with mock data
            resolve({
                success: true,
                serviceUrl: `https://${serviceName}-mock-url.asia-south1.run.app/login`,
                fullServiceName: serviceName,
                message: 'Mock deployment successful',
                ...mockCredentials
            });
        }, 4000);
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
