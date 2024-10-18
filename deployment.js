const { spawn } = require('child_process');
const { log } = require('console');
const path = require('path');
const fs = require('fs');

function sanitizeServiceName(name) {
    let sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    return sanitized.slice(0, 63);
}

function generateRandomString() {
    return Math.random().toString(36).substring(2, 8);
}

function deployment(serviceName, folder_name, randomSuffix) {
    serviceName = sanitizeServiceName(serviceName + '-' + randomSuffix);
    log('serviceName:', serviceName);

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
        
        command = `gcloud run deploy ${serviceName} --source ${tempDir} --region=asia-south1 --allow-unauthenticated`;
    } else {
        command = `gcloud run deploy ${serviceName} --source ${folder_name} --region=asia-south1 --allow-unauthenticated`;
    }

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
            log('Deployment Info:', chunk);
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

            // Clean up temporary directory if it was created
            if (folder_name === null) {
                fs.rmSync('temp_empty_service', { recursive: true, force: true });
            }
        });
    });
}

module.exports = { deployment, sanitizeServiceName, generateRandomString };

// Example usage with async/await
// (async () => {
//     try {
//         const result = await deployment('scripttest', 'clone_asst_sAx8OVokdCzjQ5xXivN2wNmw');
//         console.log('Deployment Success:', result);
//     } catch (error) {
//         console.error('Deployment Failed:', error);
//     }
// })();
