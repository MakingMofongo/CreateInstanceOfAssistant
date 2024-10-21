require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const multer = require('multer');
const { clone, generateCredentials } = require('./cloner');
const { deployment, sanitizeServiceName, generateRandomString, authenticateServiceAccount } = require('./deployment');
const { updatePhoneNumber } = require('./Twilio_Number_Routing/change_existing_url');

const app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const IS_MOCK = process.env.IS_MOCK === 'true';

const openai = new OpenAI();

const upload = multer({ dest: 'uploads/' });

const botCreationProgress = new Map();

let lastDeploymentTime = 300000; // Default to 5 minutes

if (!IS_MOCK) {
  authenticateServiceAccount()
    .then(() => {
      console.log('Service account authenticated successfully');
      startServer();
    })
    .catch((error) => {
      console.error('Failed to authenticate service account:', error);
      process.exit(1);
    });
} else {
  console.log('Mock mode: Skipping service account authentication');
  startServer();
}

function startServer() {
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.post('/create-bot', upload.single('additionalInfo'), async (req, res) => {
    const requestId = generateRandomString();
    botCreationProgress.set(requestId, { 
      sendUpdate: (data) => console.log(`Update for ${requestId}:`, data)
    });
    res.json({ requestId });

    try {
      const { botType } = req.body;
      let serviceName, name, finalPrompt;

      if (botType === 'Hotel') {
        serviceName = req.body.hotelName;
        name = req.body.hotelName;
        finalPrompt = generateHotelPrompt(req.body);
      } else if (botType === 'Hospital') {
        serviceName = req.body.hospitalName;
        name = req.body.hospitalName;
        finalPrompt = generateHospitalPrompt(req.body);
      } else if (botType === 'Custom') {
        serviceName = req.body.assistantName;
        name = req.body.assistantName;
        finalPrompt = req.body.customPrompt || generateCustomPrompt(req.body);
      }

      // Handle file upload and parsing
      let additionalInfo = '';
      if (req.file) {
        const filePath = path.join(__dirname, req.file.path);
        additionalInfo = await parseUploadedFile(filePath);
        fs.unlinkSync(filePath); // Delete the temporary file after parsing
      }

      processBotCreation(requestId, { 
        serviceName, 
        name, 
        formData: req.body,
        finalPrompt,
        additionalInfo,
        botType
      });
    } catch (error) {
      console.error('Error initiating bot creation:', error);
      botCreationProgress.get(requestId).sendUpdate({ error: 'Failed to initiate bot creation' });
    }
  });

  app.get('/create-bot', (req, res) => {
    const requestId = req.query.requestId;
    if (!requestId || !botCreationProgress.has(requestId)) {
      return res.status(400).send('Invalid or missing requestId');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendUpdate = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    botCreationProgress.get(requestId).sendUpdate = sendUpdate;
    sendUpdate({ status: 'Connected' });

    res.on('close', () => {
      botCreationProgress.delete(requestId);
      res.end();
    });
  });

  app.post('/change-hilton-url', async (req, res) => {
    const hiltonUrl = 'https://asstsax8ovokdczjq5xxivn2wnmw-6qwubf-316685833651.asia-south1.run.app/twiml';
    try {
        const result = await updatePhoneNumber(hiltonUrl);
        console.log("Phone number update result:", result);
        res.json({ success: true, message: 'URL changed successfully', result });
    } catch (error) {
        console.error('Error changing Hilton URL:', error);
        res.status(500).json({ success: false, message: 'Failed to change URL', error: error.message });
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server is running on port ${port}`));
}

function generateHotelPrompt(data) {
  return `You are the AI receptionist for ${data.hotelName}, fluent in every language. Speak in a ${data.hotelTone || 'friendly'} tone, and keep your responses short, precise, and conversational. Guide the caller with kindness, offering helpful advice to ensure they choose the best room.

Our policies include: ${data.hotelPolicies || 'standard hotel policies'}

Do not invent information—use only what's provided. When asked about prices, share them and aim to complete the booking, mentioning you'll send a booking link at the end.

Start by asking the caller's name, and good luck!`;
}

function generateHospitalPrompt(data) {
  return `You are the AI receptionist for ${data.hospitalName}, fluent in every language. Maintain a ${data.hospitalTone || 'compassionate and professional'} tone, ensuring clear and concise communication.

Do not provide medical advice—refer to professionals when necessary. Ensure all interactions are respectful and adhere to patient privacy guidelines.

Begin by greeting the caller and asking how you can assist them today.`;
}

function generateCustomPrompt(data) {
  return `You are ${data.assistantName}, a customized AI assistant for the ${data.customIndustry} industry, designed to ${data.customPurpose}. Your knowledge base is tailored to provide assistance in designated areas as specified by the user. Maintain a ${data.customTone || 'professional'} tone that aligns with the brand and purpose you are created for.

${data.customKnowledgeBase ? 'Your knowledge base includes: ' + data.customKnowledgeBase : ''}
${data.customGuidelines ? 'Please follow these guidelines: ' + data.customGuidelines : ''}

Ensure all responses are accurate, helpful, and aligned with the provided guidelines. Feel free to ask clarifying questions to better assist the user.

Start by introducing yourself and asking how you can help today.`;
}

function generateKnowledgeBaseContent(data, botType, additionalInfo) {
  let content = '';
  if (botType === 'Hotel') {
    content += `Hotel Name: ${data.hotelName}\n`;
    content += `Email: ${data.email}\n`;
    content += `Country: ${data.country}\n`;
    content += `Star Rating: ${data.hotelStars}\n`;
    content += `Number of Rooms: ${data.hotelRooms}\n`;
    content += `Amenities: ${data.hotelAmenities}\n`;
    content += `Description: ${data.hotelDescription}\n`;
    content += `Policies: ${data.hotelPolicies}\n`;
    content += `Location: ${data.hotelLocation}\n`;
  } else if (botType === 'Hospital') {
    content += `Hospital Name: ${data.hospitalName}\n`;
    content += `Email: ${data.email}\n`;
    content += `Country: ${data.country}\n`;
    content += `Hospital Type: ${data.hospitalType}\n`;
    content += `Departments: ${data.hospitalDepartments}\n`;
    content += `Number of Beds: ${data.hospitalBeds}\n`;
    content += `Description: ${data.hospitalDescription}\n`;
    content += `Services: ${data.hospitalServices}\n`;
    content += `Location: ${data.hospitalLocation}\n`;
  } else if (botType === 'Custom') {
    content += `Assistant Name: ${data.assistantName}\n`;
    content += `Email: ${data.email}\n`;
    content += `Country: ${data.country}\n`;
    content += `Industry: ${data.customIndustry}\n`;
    content += `Purpose: ${data.customPurpose}\n`;
    content += `Tone: ${data.customTone}\n`;
    content += `Knowledge Base: ${data.customKnowledgeBase}\n`;
    content += `Guidelines: ${data.customGuidelines}\n`;
  }

  // Append additional info from uploaded file
  if (additionalInfo) {
    content += '\nAdditional Information:\n' + additionalInfo;
  }

  return content;
}

async function processBotCreation(requestId, { serviceName, name, formData, finalPrompt, additionalInfo, botType }) {
  const sendUpdate = (data) => {
    const progress = botCreationProgress.get(requestId);
    if (progress && progress.sendUpdate) {
      try {
        progress.sendUpdate(data);
      } catch (error) {
        console.error('Error sending update:', error);
      }
    }
  };

  try {
    const { username, password } = generateCredentials();

    const startTime = Date.now();

    const deploymentPromise = (async () => {
      // Save all form data and additional info to the text file
      const fileName = `${serviceName.replace(/\s+/g, '_').toLowerCase()}_data.txt`;
      const filePath = path.join(__dirname, 'hotel_data', fileName);
      const fileContent = generateKnowledgeBaseContent(formData, botType, additionalInfo);
      fs.writeFileSync(filePath, fileContent, 'utf8');

      // Step 1: Create a new Assistant with File Search Enabled
      const assistant = await openai.beta.assistants.create({
        name: name,
        instructions: finalPrompt,
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      });

      // Step 2: Upload files and add them to a Vector Store
      const fileStream = fs.createReadStream(filePath);
      const vectorStore = await openai.beta.vectorStores.create({
        name: `${serviceName}_VectorStore`,
      });
      
      await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, {
        files: [fileStream],
      });

      // Step 3: Update the assistant to use the new Vector Store
      await openai.beta.assistants.update(assistant.id, {
        tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
      });

      const randomSuffix = generateRandomString();
      
      // Use the assistant.id for the actual deployment
      const deploymentName = IS_MOCK ? `tester-${randomSuffix}` : `${assistant.id}-${randomSuffix}`;
      
      sendUpdate({ status: 'Deployment', progress: 10 });
      const emptyServiceResult = await deployment(deploymentName, null, randomSuffix);
      if (!emptyServiceResult.serviceUrl) throw new Error('Failed to obtain service URL from empty deployment');
      
      sendUpdate({ status: 'Deployment', progress: 40 });
      const cloneResult = clone(assistant.id, emptyServiceResult.serviceUrl);
      
      sendUpdate({ status: 'Deployment', progress: 70 });
      const clonedServiceResult = await deployment(deploymentName, cloneResult.folderName, randomSuffix);
      if (!clonedServiceResult.serviceUrl) throw new Error('Failed to obtain service URL from cloned deployment');
      
      sendUpdate({ status: 'Deployment', progress: 100 });
      return { clonedServiceResult, assistant, username: cloneResult.username, password: cloneResult.password };
    })();

    const steps = ['Initializing', 'Creating Knowledge Base', 'Training AI', 'Cloud Setup', 'Deployment', 'Phone Configuration'];
    const baseTimings = IS_MOCK ? [2000, 2000, 2000, 2000, 2000, 2000] : [10000, 20000, 30000, 20000, 300000, 10000];
    const adjustedDurations = IS_MOCK ? baseTimings : baseTimings.map(timing => Math.round(timing * (lastDeploymentTime / 300000)));

    for (let i = 0; i < steps.length; i++) {
      sendUpdate({ status: steps[i], progress: 0 });
      try {
        if (i === steps.length - 2) { // Deployment step
          const deploymentTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Deployment timeout')), adjustedDurations[i])
          );

          // Simulate progress for deployment step
          const simulateDeploymentProgress = async () => {
            for (let progress = 0; progress <= 100; progress += 5) {
              await new Promise(resolve => setTimeout(resolve, adjustedDurations[i] / 20));
              sendUpdate({ status: 'Deployment', progress });
            }
          };

          await Promise.race([
            Promise.all([deploymentPromise, simulateDeploymentProgress()]),
            deploymentTimeout
          ]);
        } else {
          await simulateProgress(sendUpdate, steps[i], adjustedDurations[i]);
        }
      } catch (error) {
        if (error.message === 'Deployment timeout') {
          sendUpdate({ error: 'Deployment is taking longer than expected. Please check back later.' });
          // Continue with deployment in the background
          deploymentPromise.then(() => {
            sendUpdate({ status: 'completed', message: 'Your AI receptionist is ready!' });
          }).catch((err) => {
            console.error('Background deployment failed:', err);
            sendUpdate({ error: 'Deployment failed. Please try again.' });
          });
          return;
        }
        throw error;
      }
    }

    const endTime = Date.now();
    lastDeploymentTime = endTime - startTime;
    console.log(`Deployment completed in ${lastDeploymentTime}ms`);

    const { clonedServiceResult, assistant, username: deployedUsername, password: deployedPassword } = await deploymentPromise;

    sendUpdate({ status: 'Phone Configuration', progress: 0 });
    let phoneNumberInfo;
    try {
      phoneNumberInfo = await updatePhoneNumber(clonedServiceResult.serviceUrl);
      await simulateProgress(sendUpdate, 'Phone Configuration', IS_MOCK ? 2000 : 10000);
    } catch (error) {
      console.error('Error in phone configuration:', error);
      phoneNumberInfo = { phoneNumber: 'Configuration failed. Please contact support.' };
    }

    const finalData = {
      status: 'completed',
      message: 'Your AI receptionist is ready!',
      assistantId: assistant.id,
      phoneNumber: phoneNumberInfo.phoneNumber,
      serviceUrl: clonedServiceResult.serviceUrl,
      username: deployedUsername,
      password: deployedPassword
    };

    // Attempt to send the final update multiple times
    for (let i = 0; i < 3; i++) {
      try {
        sendUpdate(finalData);
        break; // If successful, exit the loop
      } catch (error) {
        console.error(`Attempt ${i + 1} to send final update failed:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
      }
    }

    // Store the final data in case the client needs to retrieve it later
    botCreationProgress.set(requestId, { ...botCreationProgress.get(requestId), finalData });

  } catch (error) {
    console.error('Error in processBotCreation:', error);
    sendUpdate({ error: 'An error occurred while creating your AI receptionist. Please try again or contact support.' });
  } finally {
    sendUpdate({ status: 'end' });
    // Keep the finalData in botCreationProgress for a while, in case the client needs to retrieve it
    setTimeout(() => botCreationProgress.delete(requestId), 300000); // Remove after 5 minutes
  }
}

async function simulateProgress(sendUpdate, status, duration) {
  const steps = 20;
  const stepDuration = duration / steps;
  for (let i = 1; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, stepDuration));
    sendUpdate({ status, progress: (i / steps) * 100 });
  }
}

// New function to parse uploaded files
async function parseUploadedFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      // Simple parsing logic - you might want to enhance this based on your needs
      const lines = data.split('\n');
      const parsedData = lines.map(line => {
        const [key, value] = line.split(':').map(item => item.trim());
        return `${key}: ${value}`;
      }).join('\n');

      resolve(parsedData);
    });
  });
}

// Add a new endpoint to retrieve the final data if the client lost connection
app.get('/retrieve-bot-data', (req, res) => {
  const requestId = req.query.requestId;
  const botData = botCreationProgress.get(requestId);
  if (botData && botData.finalData) {
    res.json(botData.finalData);
  } else {
    res.status(404).json({ error: 'Bot data not found or not ready yet' });
  }
});
