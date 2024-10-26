const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const IS_WINDOWS = process.platform === 'win32';

function sanitizeServiceName(name) {
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    if (sanitized.startsWith('goog')) {
        sanitized = 'service-' + sanitized;
    }
    return sanitized.slice(0, 63);
}

function generateRandomString() {
    return Math.random().toString(36).substring(2, 8);
}

async function deployment(serviceName, folderName, randomSuffix, settings = {}) {
    console.log('Deployment called with:', {
        serviceName,
        folderName,
        randomSuffix,
        settings
    });

    if (!serviceName) {
        throw new Error('Service name is required for deployment');
    }

    const isMockMode = settings.IS_MOCK || process.env.IS_MOCK === 'true';
    console.log('Deployment starting with settings:', settings);
    console.log('Original serviceName:', serviceName);
    
    const baseServiceName = sanitizeServiceName(serviceName.split('-')[0]);
    const finalServiceName = `${baseServiceName}-${randomSuffix}`;
    const truncatedServiceName = finalServiceName.slice(0, 63);
    console.log('Final sanitized service name:', truncatedServiceName);

    const projectId = 'canvas-replica-402316';
    let tempDir;
    let tempConfigFile;

    try {
        if (isMockMode) {
            return mockDeployment(finalServiceName);
        }

        // Create single temporary directory for all cases
        tempDir = path.join(os.tmpdir(), `deployment-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('Created temporary directory:', tempDir);

        if (folderName === null) {
            // Empty service deployment
            console.log('Creating empty service deployment');
            
            // Create minimal files for empty service
            const packageJson = {
                "name": "empty-service",
                "version": "1.0.0",
                "main": "server.js",
                "dependencies": { "express": "^4.17.1" }
            };
            fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

            const serverContent = `
                const express = require('express');
                const app = express();
                const port = process.env.PORT || 8080;
                app.get('/', (req, res) => { res.send('Empty Service Running'); });
                app.listen(port, () => { console.log(\`Server running on port \${port}\`); });
            `;
            fs.writeFileSync(path.join(tempDir, 'server.js'), serverContent);

            const dockerfileContent = `
                FROM node:14
                WORKDIR /app
                COPY package*.json ./
                RUN npm install
                COPY . .
                CMD [ "node", "server.js" ]
            `;
            fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfileContent);
        } else {
            // Actual service deployment
            console.log('Copying files from:', folderName, 'to:', tempDir);
            
            // Copy all files from the source folder
            fs.readdirSync(folderName).forEach(file => {
                const sourcePath = path.join(folderName, file);
                const destPath = path.join(tempDir, file);
                if (file === '.dockerfile') {
                    const dockerfileContent = fs.readFileSync(sourcePath, 'utf8')
                        .replace('COPY Source /app/Source', 'COPY . /app')
                        .replace('COPY Source/public /app/Source/public', 'COPY public /app/public');
                    fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfileContent);
                } else {
                    if (fs.lstatSync(sourcePath).isDirectory()) {
                        fs.cpSync(sourcePath, destPath, { recursive: true });
                    } else {
                        fs.copyFileSync(sourcePath, destPath);
                    }
                }
            });
        }

        // Modify .dockerignore to NOT ignore .env
        const dockerignoreContent = `
.git
.gitignore
node_modules
npm-debug.log
Dockerfile*
.dockerignore
*.md
.DS_Store
# Note: .env is intentionally NOT ignored to ensure environment variables are available
`;
        fs.writeFileSync(path.join(tempDir, '.dockerignore'), dockerignoreContent);

        // Log the contents of the deployment directory
        console.log('Contents of deployment directory before build:');
        const listFiles = (dir) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const fullPath = path.join(dir, file);
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    console.log(`Directory: ${fullPath}`);
                    listFiles(fullPath);
                } else {
                    console.log(`File: ${fullPath}`);
                }
            });
        };
        listFiles(tempDir);

        // Create cloud build config
        tempConfigFile = path.join(tempDir, 'cloudbuild.yaml');
        const cloudBuildConfig = generateCloudBuildConfig(projectId, truncatedServiceName, folderName === null);
        fs.writeFileSync(tempConfigFile, cloudBuildConfig);

        console.log('Contents of deployment directory:', fs.readdirSync(tempDir));

        // Execute the deployment
        const result = await executeGcloudCommand(tempDir, tempConfigFile, projectId);
        console.log('Deployment result:', result);

        const serviceUrl = extractServiceUrl(result.output);
        console.log('Extracted Service URL:', serviceUrl);

        return { ...result, serviceUrl };
    } catch (error) {
        console.error('Deployment error:', error);
        throw error;
    } finally {
        if (tempDir && fs.existsSync(tempDir)) {
            console.log('Cleaning up temporary directory:', tempDir);
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

function generateCloudBuildConfig(projectId, serviceName, isEmptyService) {
    if (isEmptyService) {
        return `
steps:
- name: 'gcr.io/cloud-builders/docker'
  entrypoint: 'bash'
  args: ['-c', 'docker pull gcr.io/${projectId}/${serviceName}:latest || exit 0']
- name: 'gcr.io/cloud-builders/docker'
  args: [
    'build',
    '-t', 'gcr.io/${projectId}/${serviceName}:latest',
    '--cache-from', 'gcr.io/${projectId}/${serviceName}:latest',
    '.'
  ]
- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/${projectId}/${serviceName}:latest']
- name: 'gcr.io/cloud-builders/gcloud'
  args: [
    'run', 'deploy', '${serviceName}', 
    '--image', 'gcr.io/${projectId}/${serviceName}:latest',
    '--region', 'asia-south1', 
    '--allow-unauthenticated', 
    '--project', '${projectId}'
  ]
options:
  machineType: 'E2_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY
  env:
    - 'DOCKER_BUILDKIT=1'
images:
- 'gcr.io/${projectId}/${serviceName}:latest'
`;
    } else {
        return `
steps:
- name: 'gcr.io/cloud-builders/docker'
  entrypoint: 'bash'
  args: ['-c', 'docker pull gcr.io/${projectId}/${serviceName}:latest || exit 0']
- name: 'gcr.io/cloud-builders/docker'
  args: [
    'build',
    '-t', 'gcr.io/${projectId}/${serviceName}:latest',
    '--cache-from', 'gcr.io/${projectId}/${serviceName}:latest',
    '--build-arg', 'PROJECT_ID=${projectId}',
    '--build-arg', 'SERVICE_NAME=${serviceName}',
    '-f', 'Dockerfile',
    '--no-cache=false',
    '.'
  ]
- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/${projectId}/${serviceName}:latest']
- name: 'gcr.io/cloud-builders/gcloud'
  args: [
    'run', 'deploy', '${serviceName}', 
    '--image', 'gcr.io/${projectId}/${serviceName}:latest',
    '--region', 'asia-south1', 
    '--allow-unauthenticated', 
    '--project', '${projectId}',
    '--set-env-vars', 'DEPLOYMENT_ID=${serviceName}'
  ]
options:
  machineType: 'E2_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY
  env:
    - 'DOCKER_BUILDKIT=1'
images:
- 'gcr.io/${projectId}/${serviceName}:latest'
`;
    }
}

function executeGcloudCommand(tempDir, configFile, projectId) {
    return new Promise((resolve, reject) => {
        let command, args;
        if (IS_WINDOWS) {
            command = 'cmd';
            // Remove 'beta' from the command
            args = ['/c', 'gcloud', 'builds', 'submit', tempDir, '--config', configFile, '--project', projectId];
        } else {
            command = 'gcloud';
            args = ['builds', 'submit', tempDir, '--config', configFile, '--project', projectId];
        }

        console.log('Executing build command:', command, args.join(' '));
        const process = spawn(command, args, { shell: true });

        let output = '';
        process.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log('Command output:', chunk.trim());
        });

        process.stderr.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.error('Command error:', chunk.trim());
        });

        process.on('close', async (code) => {
            console.log(`Build process exited with code ${code}`);
            if (code !== 0) {
                console.error('Full build output:', output);
                reject({ success: false, message: `Command failed with code ${code}`, output });
                return;
            }

            // After successful build, get the service URL using a separate command
            try {
                const describeCommand = IS_WINDOWS ?
                    `cmd /c gcloud run services describe ${truncatedServiceName} --region=asia-south1 --project=${projectId} --format="value(status.url)"` :
                    `gcloud run services describe ${truncatedServiceName} --region=asia-south1 --project=${projectId} --format="value(status.url)"`;

                console.log('Executing describe command:', describeCommand);
                const describeProcess = spawn(IS_WINDOWS ? 'cmd' : 'sh', 
                    IS_WINDOWS ? ['/c', describeCommand] : ['-c', describeCommand], 
                    { shell: true });

                let describeOutput = '';
                describeProcess.stdout.on('data', (data) => {
                    describeOutput += data.toString();
                });

                describeProcess.stderr.on('data', (data) => {
                    console.error('Describe command error:', data.toString());
                });

                await new Promise((resolveDescribe, rejectDescribe) => {
                    describeProcess.on('close', (describeCode) => {
                        if (describeCode === 0) {
                            resolveDescribe();
                        } else {
                            console.warn('Service describe command failed, will try to extract URL from build output');
                            resolveDescribe();
                        }
                    });
                });

                let serviceUrl = describeOutput.trim();
                if (!serviceUrl) {
                    // Try to extract URL from the build output if describe command failed
                    serviceUrl = extractServiceUrl(output);
                }

                console.log('Retrieved service URL:', serviceUrl);

                resolve({ 
                    success: true, 
                    output, 
                    message: 'Command successful',
                    serviceUrl
                });
            } catch (error) {
                console.error('Error getting service URL:', error);
                // Still resolve but with null serviceUrl if URL fetch fails
                resolve({ 
                    success: true, 
                    output, 
                    message: 'Command successful but failed to get service URL',
                    serviceUrl: null 
                });
            }
        });
    });
}

function extractServiceUrl(output) {
    console.log('Extracting URL from output:', output);
    // Try multiple patterns since the output format might vary
    const patterns = [
        /Service URL:\s*(https:\/\/[^\s]+)/i,
        /Service \[.*?\] revision \[.*?\] has been deployed.*\n.*?Service URL: (https:\/\/[^\s]+)/i,
        /Successfully deployed.*\n.*?Service URL: (https:\/\/[^\s]+)/i,
        /status\.url:\s*(https:\/\/[^\s]+)/i,
        /(https:\/\/[^"\s]+\.run\.app)/i
    ];

    for (const pattern of patterns) {
        const match = output.match(pattern);
        if (match && match[1]) {
            console.log('Found service URL:', match[1]);
            return match[1];
        }
    }

    // If no URL found in the output, try to construct it
    if (output.includes('SUCCESS') && output.includes('gcr.io')) {
        const serviceName = output.match(/gcr\.io\/[^/]+\/([^:]+):/)?.[1];
        if (serviceName) {
            const constructedUrl = `https://${serviceName}-316685833651.asia-south1.run.app`;
            console.log('Constructed service URL:', constructedUrl);
            return constructedUrl;
        }
    }

    console.error('No service URL found in output. Full output:', output);
    return null;
}

function mockDeployment(serviceName) {
    console.log('Mock: Deploying service', serviceName);
    // Add a flag to prevent duplicate mock deployments
    if (global.mockDeploymentInProgress) {
        console.log('Mock deployment already in progress, skipping');
        return null;
    }
    global.mockDeploymentInProgress = true;

    return Promise.resolve({
        success: true,
        serviceUrl: `https://${serviceName}-mock-url.asia-south1.run.app`,
        fullServiceName: serviceName,
        message: 'Mock deployment successful'
    }).finally(() => {
        global.mockDeploymentInProgress = false;
    });
}

module.exports = { deployment, sanitizeServiceName, generateRandomString };
