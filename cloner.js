const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sourceFiles = [
    'ElevenLabsTTS.js',
    'LLM.js',
    'receptionist.js',
    '.env',
    'transcription-service.js',
    '.dockerfile',
    'package.json',
    'google_creds.json'
];

function generateCredentials() {
    const username = `user_${crypto.randomBytes(3).toString('hex')}`;
    const password = crypto.randomBytes(8).toString('hex');
    return { username, password };
}

function clone(assistant_id, serviceUrl) {
    const newFolderName = `clone_${assistant_id}`;
    const folderPath = path.join(__dirname, newFolderName);

    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
    }

    fs.mkdirSync(newFolderName);
    fs.mkdirSync(path.join(__dirname, newFolderName, 'templates'));
    
    fs.copyFileSync(path.join(__dirname, 'Source', 'templates', 'streams.xml'), path.join(__dirname, newFolderName, 'templates', 'streams.xml'));

    const streamsXmlPath = path.join(__dirname, newFolderName, 'templates', 'streams.xml');
    let streamsXmlContent = fs.readFileSync(streamsXmlPath, 'utf8');
    
    if (serviceUrl) {
        const wssUrl = serviceUrl.replace('https://', 'wss://') + '/streams';
        streamsXmlContent = streamsXmlContent.replace(/wss:\/\/[^"]+/g, wssUrl);
        fs.writeFileSync(streamsXmlPath, streamsXmlContent);
    }

    sourceFiles.forEach((file) => {
        const sourceFilePath = path.join(__dirname, 'Source', file);
        const destinationFilePath = path.join(__dirname, newFolderName, file);
        fs.copyFileSync(sourceFilePath, destinationFilePath);
    });

    const publicSourcePath = path.join(__dirname, 'Source', 'public');
    const publicDestPath = path.join(__dirname, newFolderName, 'public');
    
    if (fs.existsSync(publicSourcePath)) {
        fs.mkdirSync(publicDestPath);
        fs.readdirSync(publicSourcePath).forEach((file) => {
            const srcFile = path.join(publicSourcePath, file);
            const destFile = path.join(publicDestPath, file);
            fs.copyFileSync(srcFile, destFile);
        });
    }

    const { username, password } = generateCredentials();

    const envFilePath = path.join(__dirname, newFolderName, '.env');
    let envFileContent = fs.readFileSync(envFilePath, 'utf8');
    envFileContent = envFileContent.replace('OPENAI_ASSISTANT_ID=asst_sAx8OVokdCzjQ5xXivN2wNmw #English', `OPENAI_ASSISTANT_ID=${assistant_id}`);
    envFileContent = envFileContent.replace(/DEV_CONSOLE_USERNAME=.+/, `DEV_CONSOLE_USERNAME=${username}`);
    envFileContent = envFileContent.replace(/DEV_CONSOLE_PASSWORD=.+/, `DEV_CONSOLE_PASSWORD=${password}`);
    fs.writeFileSync(envFilePath, envFileContent);

    return { folderName: newFolderName, username, password };
}

module.exports = { clone, generateCredentials };
