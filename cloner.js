const fs = require('fs');
const path = require('path');

const sourceFiles = [
    'ElevenLabsTTS.js',
    'LLM.js',
    'receptionist.js',
    '.env',
    'transcription-service.js',
    '.dockerfile',
    'package.json'
];

function clone(assistant_id) {
    const newFolderName = `clone_${assistant_id}`;
    
    // Create the new folder
    fs.mkdirSync(newFolderName);
    // create 'templates' folder in the new folder
    fs.mkdirSync(path.join(__dirname, newFolderName, 'templates'));
    // Copy the 'streams.xml' file to the 'templates' folder
    fs.copyFileSync(path.join(__dirname, 'Source', 'templates', 'streams.xml'), path.join(__dirname, newFolderName, 'templates', 'streams.xml'));

    // Copy each source file to the new folder
    sourceFiles.forEach((file) => {
        // use source folder
        const sourceFilePath = path.join(__dirname,'Source', file);
        const destinationFilePath = path.join(__dirname, newFolderName, file);

        fs.copyFileSync(sourceFilePath, destinationFilePath);
    });

    // modify cloned .env file with the new assistant_id value in the OPENAI_ASSISTANT_ID key
    const envFilePath = path.join(__dirname, newFolderName, '.env');
    const envFileContent = fs.readFileSync(envFilePath, 'utf8');
    const updatedEnvFileContent = envFileContent.replace('OPENAI_ASSISTANT_ID=asst_sAx8OVokdCzjQ5xXivN2wNmw #English', `OPENAI_ASSISTANT_ID=${assistant_id}`);
    fs.writeFileSync(envFilePath, updatedEnvFileContent);


    console.log(`Cloning complete! Folder created: ${newFolderName}`);
    return newFolderName;
}

// Export the clone function
module.exports = { clone };
clone('asst_sAx8OVokdCzjQ5xXivN2wNmw');  // Example usage of the clone function