require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { clone, generateCredentials } = require('./cloner');
const { deployment, sanitizeServiceName, generateRandomString, authenticateServiceAccount } = require('./deployment');
const { updatePhoneNumber } = require('./Twilio_Number_Routing/change_existing_url');

const app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const IS_MOCK = process.env.IS_MOCK === 'true';

const openai = new OpenAI();

const defaultPromptTemplate = `You are the AI receptionist for {HOTEL_NAME}, fluent in every language. You know everything about the hotel and can assist with any inquiries. Speak in a friendly, human tone, and keep your responses short, precise, and conversational. Guide the caller with kindness, offering helpful advice to ensure they choose the best room.

Do not invent information—use only what's provided. When asked about prices, share them and aim to complete the booking, mentioning you'll send a booking link at the end.

Start by asking the caller's name, and good luck!`;

const botCreationProgress = new Map();

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

  app.post('/create-bot', async (req, res) => {
    const requestId = generateRandomString();
    botCreationProgress.set(requestId, { 
      sendUpdate: (data) => console.log(`Update for ${requestId}:`, data)
    });
    res.json({ requestId });

    try {
      const { hotelName, email, country } = req.body;
      processBotCreation(requestId, { hotelName, email, country });
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

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server is running on port ${port}`));
}

async function processBotCreation(requestId, { hotelName, email, country }) {
  const sendUpdate = (data) => {
    const progress = botCreationProgress.get(requestId);
    if (progress && progress.sendUpdate) progress.sendUpdate(data);
  };

  try {
    const { username, password } = generateCredentials();

    const deploymentPromise = (async () => {
      sendUpdate({ status: 'Initializing', progress: 0 });
      const fileName = `${hotelName.replace(/\s+/g, '_').toLowerCase()}_data.txt`;
      const filePath = path.join(__dirname, 'hotel_data', fileName);
      fs.writeFileSync(filePath, JSON.stringify({ hotelName, email, country }, null, 2), 'utf8');

      sendUpdate({ status: 'Creating Knowledge Base', progress: 0 });
      const vectorStore = await openai.beta.vectorStores.create({ name: `${hotelName}_VectorStore` });

      sendUpdate({ status: 'Training AI', progress: 0 });
      const assistant = await openai.beta.assistants.create({
        name: `${hotelName} Assistant`,
        instructions: defaultPromptTemplate.replace('{HOTEL_NAME}', hotelName),
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      });

      sendUpdate({ status: 'Cloud Setup', progress: 0 });
      const serviceName = sanitizeServiceName(assistant.id);
      const randomSuffix = generateRandomString();

      // Start deployment progress immediately after cloud setup
      sendUpdate({ status: 'Deployment', progress: 0 });
      
      const emptyServiceResult = await deployment(serviceName, null, randomSuffix);
      if (!emptyServiceResult.serviceUrl) throw new Error('Failed to obtain service URL from empty deployment');
      const cloneResult = clone(assistant.id, emptyServiceResult.serviceUrl);
      const clonedServiceResult = await deployment(serviceName, cloneResult.folderName, randomSuffix);
      if (!clonedServiceResult.serviceUrl) throw new Error('Failed to obtain service URL from cloned deployment');
      return { clonedServiceResult, assistant, username: cloneResult.username, password: cloneResult.password };
    })();

    let deploymentCompleted = false;

    if (!IS_MOCK) {
      await simulateProgressWithEarlyCompletion(sendUpdate, 'Initializing', 10000, deploymentPromise, () => deploymentCompleted);
      await simulateProgressWithEarlyCompletion(sendUpdate, 'Creating Knowledge Base', 20000, deploymentPromise, () => deploymentCompleted);
      await simulateProgressWithEarlyCompletion(sendUpdate, 'Training AI', 30000, deploymentPromise, () => deploymentCompleted);
      await simulateProgressWithEarlyCompletion(sendUpdate, 'Cloud Setup', 20000, deploymentPromise, () => deploymentCompleted);
      // Start simulating deployment progress immediately after cloud setup
      await simulateProgressWithEarlyCompletion(sendUpdate, 'Deployment', 30000, deploymentPromise, () => deploymentCompleted);
    } else {
      sendUpdate({ status: 'Initializing', progress: 100 });
      sendUpdate({ status: 'Creating Knowledge Base', progress: 100 });
      sendUpdate({ status: 'Training AI', progress: 100 });
      sendUpdate({ status: 'Cloud Setup', progress: 100 });
      sendUpdate({ status: 'Deployment', progress: 100 });
    }

    const { clonedServiceResult, assistant, username: deployedUsername, password: deployedPassword } = await deploymentPromise;
    deploymentCompleted = true;

    // Remove this line as we've already sent the 100% progress update
    // sendUpdate({ status: 'Deployment', progress: 100 });

    sendUpdate({ status: 'Phone Configuration', progress: 0 });
    const phoneNumberInfo = await updatePhoneNumber(clonedServiceResult.serviceUrl);
    if (!IS_MOCK) {
      await simulateProgress(sendUpdate, 'Phone Configuration', 10000);
    } else {
      sendUpdate({ status: 'Phone Configuration', progress: 100 });
    }

    sendUpdate({
      status: 'completed',
      message: 'Your AI receptionist is ready!',
      assistantId: assistant.id,
      phoneNumber: phoneNumberInfo.phoneNumber,
      serviceUrl: clonedServiceResult.serviceUrl,
      username: deployedUsername,
      password: deployedPassword
    });

  } catch (error) {
    console.error('Error in processBotCreation:', error);
    sendUpdate({ error: 'An error occurred while creating your AI receptionist. Please try again.' });
  } finally {
    sendUpdate({ status: 'end' });
    botCreationProgress.delete(requestId);
  }
}

async function simulateProgressWithEarlyCompletion(sendUpdate, status, duration, deploymentPromise, isCompleted) {
  const steps = 20;
  const stepDuration = duration / steps;
  for (let i = 1; i <= steps; i++) {
    if (await Promise.race([
      new Promise(resolve => setTimeout(() => resolve(false), stepDuration)),
      deploymentPromise.then(() => true)
    ]) || isCompleted()) {
      sendUpdate({ status, progress: 100 });
      return;
    }
    sendUpdate({ status, progress: (i / steps) * 100 });
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
