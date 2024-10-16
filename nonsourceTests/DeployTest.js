const assert = require('assert');
const sinon = require('sinon');
const { deployment } = require('../deployment');
const childProcess = require('child_process');
const { clone } = require('../cloner');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

describe('Deployment Test', function() {
    this.timeout(300000); // 5 minutes timeout

    let spawnStub;
    let testFolderName;

    before(function() {
        testFolderName = clone('asst_sAx8OVokdCzjQ5xXivN2wNmw');
        console.log(`Created test folder: ${testFolderName}`);
    });

    after(function() {
        if (testFolderName) {
            const testFolderPath = path.join(__dirname, '..', testFolderName);
            if (fs.existsSync(testFolderPath)) {
                fs.rmSync(testFolderPath, { recursive: true, force: true });
                console.log(`Removed test folder: ${testFolderName}`);
            }
        }
    });

    beforeEach(function() {
        spawnStub = sinon.stub(childProcess, 'spawn');
    });

    afterEach(function() {
        spawnStub.restore();
    });

    it('should deploy and return a URL', async function() {
        const mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();

        spawnStub.returns(mockProcess);

        const deploymentPromise = deployment('test-service', testFolderName);

        // Simulate a successful deployment process
        setTimeout(() => {
            console.log('Simulating deployment process...');
            mockProcess.stdout.emit('data', 'Deploying... \n');
            mockProcess.stdout.emit('data', 'Service URL: https://test-service-abc123.run.app\n');
            mockProcess.emit('close', 0); // Simulate successful completion with exit code 0
        }, 100);

        const result = await deploymentPromise;

        console.log('Deployment result:', result);

        assert(spawnStub.calledOnce, 'spawn should be called once');
        assert(spawnStub.calledWith(
            sinon.match(/^(cmd|gcloud)$/),
            sinon.match.array.deepEquals([
                '/c',
                sinon.match(/^gcloud run deploy test-service.+ --source .+ --region=asia-south1 --allow-unauthenticated$/)
            ])
        ), 'spawn should be called with correct arguments');
        assert.strictEqual(result.success, true, 'Deployment should be successful');
        assert(result.serviceUrl.startsWith('https://'), 'Should return a valid service URL');
    });
});