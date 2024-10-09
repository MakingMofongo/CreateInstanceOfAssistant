const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { clone } = require('../cloner');

describe('Cloner Tests', function() {
    const testAssistantId = 'test_assistant_id_123';
    const cloneFolderName = `clone_${testAssistantId}`;
    const cloneFolderPath = path.join(__dirname, '..', cloneFolderName);
    const sourceFolderPath = path.join(__dirname, '..', 'Source');

    // Helper function to check if a file exists
    function fileExists(filePath) {
        return fs.existsSync(filePath);
    }

    // Helper function to read file content
    function readFileContent(filePath) {
        return fs.readFileSync(filePath, 'utf8');
    }

    afterEach(function() {
        // Clean up: remove the cloned folder after each test
        if (fs.existsSync(cloneFolderPath)) {
            fs.rmSync(cloneFolderPath, { recursive: true, force: true });
        }
    });

    it('should create a new folder with the correct name', function() {
        clone(testAssistantId);
        assert(fs.existsSync(cloneFolderPath), 'Cloned folder should exist');
    });

    it('should remove existing folder if it already exists', function() {
        // Create a dummy file in the clone folder
        fs.mkdirSync(cloneFolderPath, { recursive: true });
        const dummyFilePath = path.join(cloneFolderPath, 'dummy.txt');
        fs.writeFileSync(dummyFilePath, 'dummy content');

        clone(testAssistantId);

        // Check if the dummy file is removed
        assert(!fileExists(dummyFilePath), 'Existing files should be removed');
    });

    it('should create a templates subfolder', function() {
        clone(testAssistantId);
        const templatesFolderPath = path.join(cloneFolderPath, 'templates');
        assert(fs.existsSync(templatesFolderPath), 'Templates subfolder should exist');
    });

    it('should copy streams.xml to the templates folder', function() {
        clone(testAssistantId);
        const streamsXmlPath = path.join(cloneFolderPath, 'templates', 'streams.xml');
        assert(fileExists(streamsXmlPath), 'streams.xml should be copied to templates folder');
    });

    it('should copy all required files', function() {
        const requiredFiles = [
            'ElevenLabsTTS.js',
            'LLM.js',
            'receptionist.js',
            '.env',
            'transcription-service.js',
            '.dockerfile',
            'package.json'
        ];

        clone(testAssistantId);

        requiredFiles.forEach(file => {
            const filePath = path.join(cloneFolderPath, file);
            assert(fileExists(filePath), `${file} should be copied to the cloned folder`);
        });
    });

    it('should update the OPENAI_ASSISTANT_ID in the .env file', function() {
        clone(testAssistantId);
        const envFilePath = path.join(cloneFolderPath, '.env');
        const envContent = readFileContent(envFilePath);
        assert(envContent.includes(`OPENAI_ASSISTANT_ID=${testAssistantId}`), 'OPENAI_ASSISTANT_ID should be updated in .env file');
    });

    it('should return the name of the cloned folder', function() {
        const result = clone(testAssistantId);
        assert.strictEqual(result, cloneFolderName, 'Should return the correct cloned folder name');
    });

    it('should handle special characters in assistant ID', function() {
        const specialId = 'test!@#$%^&*()';
        const sanitizedId = specialId.replace(/[<>:"/\\|?*]/g, '_');
        const specialFolderName = `clone_${sanitizedId}`;
        const result = clone(specialId);
        assert.strictEqual(result, specialFolderName, 'Should handle special characters correctly');
        assert(fs.existsSync(path.join(__dirname, '..', specialFolderName)), 'Folder with sanitized special characters should exist');
    });

    it('should throw an error if source files are missing', function() {
        // Temporarily rename a source file to simulate missing file
        const tempFile = path.join(sourceFolderPath, 'ElevenLabsTTS.js');
        const renamedFile = path.join(sourceFolderPath, 'ElevenLabsTTS.js.bak');

        fs.renameSync(tempFile, renamedFile);

        assert.throws(() => {
            clone(testAssistantId);
        }, Error, 'Should throw an error when source files are missing');

        // Restore the file
        fs.renameSync(renamedFile, tempFile);
    });
});