const fs = require('fs');
const path = require('path');

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

function clone(assistant_id, serviceUrl) {
    const newFolderName = `clone_${assistant_id}`;
    const folderPath = path.join(__dirname, newFolderName);

    // Check if the folder already exists
    if (fs.existsSync(folderPath)) {
        // If it exists, remove it and all its contents
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`Existing folder ${newFolderName} has been removed.`);
    }

    // Create the new folder
    fs.mkdirSync(newFolderName);
    
    // Create 'templates' folder in the new folder
    fs.mkdirSync(path.join(__dirname, newFolderName, 'templates'));
    
    // Copy the 'streams.xml' file to the 'templates' folder
    fs.copyFileSync(path.join(__dirname, 'Source', 'templates', 'streams.xml'), path.join(__dirname, newFolderName, 'templates', 'streams.xml'));

    // Modify streams.xml with the provided serviceUrl
    const streamsXmlPath = path.join(__dirname, newFolderName, 'templates', 'streams.xml');
    let streamsXmlContent = fs.readFileSync(streamsXmlPath, 'utf8');
    
    if (serviceUrl) {
        // Convert https:// to wss:// and add /streams at the end
        const wssUrl = serviceUrl.replace('https://', 'wss://') + '/streams';
        streamsXmlContent = streamsXmlContent.replace(/wss:\/\/[^"]+/g, wssUrl);
        
        fs.writeFileSync(streamsXmlPath, streamsXmlContent);
        console.log(`streams.xml has been updated with service URL: ${wssUrl}`);
    } else {
        console.log('No serviceUrl provided. streams.xml was not modified.');
    }

    // Copy each source file to the new folder
    sourceFiles.forEach((file) => {
        const sourceFilePath = path.join(__dirname, 'Source', file);
        const destinationFilePath = path.join(__dirname, newFolderName, file);

        fs.copyFileSync(sourceFilePath, destinationFilePath);
    });

    // Clone the public folder
    const publicSourcePath = path.join(__dirname, 'Source', 'public');
    const publicDestPath = path.join(__dirname, newFolderName, 'public');
    
    if (fs.existsSync(publicSourcePath)) {
        fs.mkdirSync(publicDestPath);
        fs.readdirSync(publicSourcePath).forEach((file) => {
            const srcFile = path.join(publicSourcePath, file);
            const destFile = path.join(publicDestPath, file);
            fs.copyFileSync(srcFile, destFile);
        });
        console.log('Public folder has been cloned.');
    } else {
        console.log('Public folder not found in the source. Skipping...');
    }

    // Modify the cloned .env file with the new assistant_id value in the OPENAI_ASSISTANT_ID key
    const envFilePath = path.join(__dirname, newFolderName, '.env');
    const envFileContent = fs.readFileSync(envFilePath, 'utf8');
    const updatedEnvFileContent = envFileContent.replace('OPENAI_ASSISTANT_ID=asst_sAx8OVokdCzjQ5xXivN2wNmw #English', `OPENAI_ASSISTANT_ID=${assistant_id}`);
    fs.writeFileSync(envFilePath, updatedEnvFileContent);

    console.log(`Cloning complete! Folder created: ${newFolderName}`);
    return newFolderName;
}

// Export the clone function
module.exports = { clone };

// Remove or comment out the following line to prevent automatic execution
clone('asst_sAx8OVokdCzjQ5xXivN2wNmw')  // Example usage of the clone function
