const assert = require('assert');
const { deployment } = require('../deployment');
const { clone } = require('../cloner');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

describe('Live Deployment Test', function() {
    this.timeout(600000); // 10 minutes timeout

    let testFolderName;
    let fullServiceName;

    before(function() {
        testFolderName = clone('asst_sAx8OVokdCzjQ5xXivN2wNmw');
        console.log(`Created test folder: ${testFolderName}`);
    });

    after(async function() {
        // Clean up the test folder
        if (testFolderName) {
            const testFolderPath = path.join(__dirname, '..', testFolderName);
            if (fs.existsSync(testFolderPath)) {
                fs.rmSync(testFolderPath, { recursive: true, force: true });
                console.log(`Removed test folder: ${testFolderName}`);
            }
        }

        // Delete the deployed service
        if (fullServiceName) {
            try {
                const region = 'asia-south1'; // Make sure this matches the region in deployment.js
                const { stdout, stderr } = await execPromise(`gcloud run services delete ${fullServiceName} --region=${region} --quiet`);
                console.log(`Deleted service ${fullServiceName}:`, stdout);
                if (stderr) console.error('Deletion stderr:', stderr);
            } catch (error) {
                console.error(`Failed to delete service ${fullServiceName}:`, error);
            }
        }
    });

    it('should deploy and return a valid URL', async function() {
        const serviceName = `test-service-${Date.now()}`; // Use a unique service name
        const result = await deployment(serviceName, testFolderName);

        console.log('Live deployment result:', result);

        assert.strictEqual(result.success, true, 'Deployment should be successful');
        assert(result.serviceUrl.startsWith('https://'), 'Should return a valid service URL');
        assert(result.fullServiceName, 'Should return the full service name');
        
        fullServiceName = result.fullServiceName; // Store the full service name for cleanup
        
        // Additional checks you might want to add:
        // - Make an HTTP request to the deployed service to ensure it's responding
        // - Check if the deployed service has the expected content or behavior
        // - Verify that the service appears in your GCloud project's list of services
    });

    // You might want to add more tests here, such as:
    // - Deploying with different configuration options
    // - Updating an existing deployment
    // - Testing deployment to different regions
    // - Testing deployment failure scenarios (e.g., with invalid configurations)
});
