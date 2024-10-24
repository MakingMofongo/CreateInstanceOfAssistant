require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { protect } = require('./middleware/auth');
const User = require('./models/User');
const Bot = require('./models/Bot');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const multer = require('multer');
const { clone, generateCredentials } = require('./cloner');
const { deployment, sanitizeServiceName, generateRandomString, authenticateServiceAccount, deploymentEmitter } = require('./deployment');
const { updatePhoneNumber } = require('./Twilio_Number_Routing/change_existing_url');
const { exec } = require('child_process');
const Razorpay = require('razorpay');
const { validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const IS_MOCK = process.env.IS_MOCK === 'true';

const openai = new OpenAI();

const upload = multer({ dest: 'uploads/' });

const botCreationProgress = new Map();

let lastDeploymentTime = 300000; // Default to 5 minutes

// At the top of the file, add this constant
const BOT_CREATION_TIMEOUT = 300000; // 5 minutes in milliseconds

// Google Cloud Authentication
function authenticateGoogleCloud() {
  return new Promise((resolve, reject) => {
    exec('gcloud auth activate-service-account --key-file=google_creds.json', (error, stdout, stderr) => {
      if (error) {
        console.error(`Google Cloud authentication error: ${error}`);
        return reject(error);
      }
      console.log('Google Cloud authenticated successfully');
      resolve();
    });
  });
}

// Set Google Cloud project
function setGoogleCloudProject() {
  return new Promise((resolve, reject) => {
    exec('gcloud config set project canvas-replica-402316', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error setting Google Cloud project: ${error}`);
        return reject(error);
      }
      console.log('Google Cloud project set successfully');
      resolve();
    });
  });
}

// Initialize Google Cloud
async function initializeGoogleCloud() {
  if (!IS_MOCK) {
    try {
      await authenticateGoogleCloud();
      await setGoogleCloudProject();
      console.log('Google Cloud initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Cloud:', error);
      process.exit(1);
    }
  } else {
    console.log('Mock mode: Skipping Google Cloud initialization');
  }
}

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true
})
  .then(() => {
    console.log('Connected to MongoDB');
    console.log('Database Name:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
    console.log('Port:', mongoose.connection.port);
  })
  .catch(err => {
    console.error('Could not connect to MongoDB', err);
    process.exit(1); // Exit the process if unable to connect to the database
  });

// User signup
app.post('/api/signup', async (req, res) => {
  try {
    console.log('Attempting to create new user:', req.body.email);
    const user = new User(req.body);
    await user.save();
    console.log('User created successfully:', user._id);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ token });
  } catch (error) {
    console.error('Error during user signup:', error);
    res.status(400).json({ message: error.message });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for user:', email);

    // Check for test user or mock mode
    if ((email === 'test@gmail.com' && password === 'test') || process.env.IS_MOCK === 'true') {
      console.log('Test user login successful');
      const testUser = { 
        _id: 'test_user_id', 
        email: 'test@gmail.com',
        name: 'Test User'
      };
      const token = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
      return res.json({ token });
    }

    // Regular user authentication
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      console.log('Login failed for user:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    console.log('Login successful for user:', email);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
  } catch (error) {
    console.error('Error during user login:', error);
    res.status(400).json({ message: error.message });
  }
});

// Protected route for creating bots
app.post('/create-bot', protect, upload.single('additionalInfo'), async (req, res) => {
  const requestId = generateRandomString();
  botCreationProgress.set(requestId, { 
    sendUpdate: (data) => console.log(`Update for ${requestId}:`, data)
  });
  res.json({ requestId });

  try {
    console.log('Attempting to create bot for user:', req.user._id);
    console.log('Request body:', req.body);
    
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
    } else {
      throw new Error('Invalid bot type');
    }

    if (!serviceName || serviceName.trim() === '') {
      throw new Error('Service name is required');
    }

    console.log('Bot details:', { serviceName, name, botType });

    // Handle file upload and parsing
    let additionalInfo = '';
    if (req.file) {
      const filePath = path.join(__dirname, req.file.path);
      additionalInfo = await parseUploadedFile(filePath);
      fs.unlinkSync(filePath); // Delete the temporary file after parsing
    }

    const botCreationResult = await processBotCreation(requestId, { 
      serviceName, 
      name, 
      formData: req.body,
      finalPrompt,
      additionalInfo,
      botType,
      userId: req.user._id
    });

    console.log('Bot creation result:', botCreationResult);

    // After successful creation, save the bot to the database
    const bot = new Bot({
      user: req.user._id,
      name: serviceName,
      type: botType,
      assistantId: botCreationResult.assistant.id,
      phoneNumber: botCreationResult.phoneNumberInfo.phoneNumber,
      serviceUrl: botCreationResult.clonedServiceResult.serviceUrl,
      username: botCreationResult.deployedUsername,
      password: botCreationResult.deployedPassword
    });
    await bot.save();
    console.log('Bot saved to database:', bot._id);

    // Keep the sendUpdate function alive for a while after completion
    setTimeout(() => {
      botCreationProgress.delete(requestId);
    }, 300000); // 5 minutes

  } catch (error) {
    console.error('Error creating bot:', error);
    const progress = botCreationProgress.get(requestId);
    if (progress && typeof progress.sendUpdate === 'function') {
      progress.sendUpdate({ error: 'Failed to create bot: ' + error.message });
    } else {
      console.warn(`No sendUpdate function found for requestId: ${requestId}`);
    }
    botCreationProgress.delete(requestId);
  }
});

// Retrieve user's bots
app.get('/api/bots', protect, async (req, res) => {
  try {
    console.log('Retrieving bots for user:', req.user._id);
    const bots = await Bot.find({ user: req.user._id });
    console.log('Number of bots retrieved:', bots.length);
    res.json(bots);
  } catch (error) {
    console.error('Error retrieving bots:', error);
    res.status(400).json({ message: error.message });
  }
});

// Retrieve specific bot data
app.get('/api/bots/:id', protect, async (req, res) => {
  try {
    console.log('Retrieving bot details. User:', req.user._id, 'Bot ID:', req.params.id);
    const bot = await Bot.findOne({ _id: req.params.id, user: req.user._id });
    if (!bot) {
      console.log('Bot not found. User:', req.user._id, 'Bot ID:', req.params.id);
      return res.status(404).json({ message: 'Bot not found' });
    }
    console.log('Bot details retrieved successfully');
    res.json(bot);
  } catch (error) {
    console.error('Error retrieving bot details:', error);
    res.status(400).json({ message: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// Initialize the application
async function startServer() {
  await initializeGoogleCloud();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('MongoDB URI:', process.env.MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@')); // Hide credentials in logs
  });
}

startServer();

// Global unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

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

async function processBotCreation(requestId, { serviceName, name, formData, finalPrompt, additionalInfo, botType, userId }) {
  const sendUpdate = (data) => {
    const progress = botCreationProgress.get(requestId);
    if (progress && typeof progress.sendUpdate === 'function') {
      try {
        // Stringify the data, but limit its size
        const stringifiedData = JSON.stringify(data, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            return Object.keys(value).reduce((acc, k) => {
              acc[k] = value[k];
              return acc;
            }, {});
          }
          return value;
        }, 2).slice(0, 1000000); // Limit to 1MB
        progress.sendUpdate(JSON.parse(stringifiedData));
      } catch (error) {
        console.error('Error sending update:', error);
      }
    } else {
      console.warn(`No sendUpdate function found for requestId: ${requestId}`);
    }
  };

  try {
    console.log('Starting bot creation process for user:', userId);
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
    const baseTimings = [10000, 20000, 30000, 20000, 300000, 10000];
    const adjustedDurations = baseTimings.map(timing => Math.round(timing * (lastDeploymentTime / 300000)));

    for (let i = 0; i < steps.length; i++) {
      sendUpdate({ status: steps[i], progress: 0 });
      try {
        if (i === steps.length - 2) { // Deployment step
          deploymentEmitter.on('progress', (data) => {
            sendUpdate({ status: 'Deployment', progress: data.progress, substep: data.step });
          });

          // Wait for the actual deployment to complete
          const deploymentResult = await deploymentPromise;

          // Deployment completed successfully
          sendUpdate({ status: 'Deployment', progress: 100, substep: 'Completed' });
        } else {
          await simulateProgress(sendUpdate, steps[i], adjustedDurations[i]);
        }
      } catch (error) {
        console.error(`Error in ${steps[i]} step:`, error);
        sendUpdate({ error: `An error occurred during the ${steps[i]} step: ${error.message}. Please check server logs.` });
        throw error; // Re-throw to stop the process
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

    sendUpdate(finalData);

    // Store the final data and set a timeout to remove it
    botCreationProgress.set(requestId, { 
      ...botCreationProgress.get(requestId), 
      finalData,
      sendUpdate // Keep the sendUpdate function
    });

    setTimeout(() => {
      botCreationProgress.delete(requestId);
    }, BOT_CREATION_TIMEOUT);

    return { clonedServiceResult, assistant, deployedUsername, deployedPassword, phoneNumberInfo };

  } catch (error) {
    console.error('Error in processBotCreation:', error);
    sendUpdate({ error: 'An error occurred while creating your AI receptionist. Please check server logs.' });
    throw error;
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

// New endpoint to get user data
app.get('/api/user', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ message: 'Error fetching user data' });
    }
});

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

console.log('Razorpay initialized with key_id:', process.env.RAZORPAY_KEY_ID);

// Function to read data from JSON file
const readData = () => {
    if (fs.existsSync('orders.json')) {
        const data = fs.readFileSync('orders.json');
        return JSON.parse(data);
    }
    return [];
};

// Function to write data to JSON file
const writeData = (data) => {
    fs.writeFileSync('orders.json', JSON.stringify(data, null, 2));
};

// Initialize orders.json if it doesn't exist
if (!fs.existsSync('orders.json')) {
    writeData([]);
}

// Route to handle order creation
app.post('/create-order', async (req, res) => {
    console.log('Received create-order request');
    try {
        const { amount, currency, receipt, notes } = req.body;
        console.log('Request body:', { amount, currency, receipt, notes });

        if (!amount || !currency || !receipt) {
            console.log('Missing required fields');
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const options = {
            amount: amount,
            currency,
            receipt,
            notes,
        };

        console.log('Creating Razorpay order with options:', options);
        const order = await razorpay.orders.create(options);
        console.log('Razorpay order created:', order);
        
        // Read current orders, add new order, and write back to the file
        const orders = readData();
        orders.push({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            status: 'created',
        });
        writeData(orders);

        res.json(order);
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ message: 'Error creating order', error: error.message });
    }
});

// Route to handle payment verification
app.post('/verify-payment', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const secret = razorpay.key_secret;
    const body = razorpay_order_id + '|' + razorpay_payment_id;

    try {
        const isValidSignature = validateWebhookSignature(body, razorpay_signature, secret);
        if (isValidSignature) {
            // Update the order with payment details
            const orders = readData();
            const order = orders.find(o => o.order_id === razorpay_order_id);
            if (order) {
                order.status = 'paid';
                order.payment_id = razorpay_payment_id;
                writeData(orders);
            }
            res.status(200).json({ status: 'ok' });
            console.log("Payment verification successful");
        } else {
            res.status(400).json({ status: 'verification_failed' });
            console.log("Payment verification failed");
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error verifying payment' });
    }
});

app.get('/test-json', (req, res) => {
    res.json({ message: 'This is a test JSON response' });
});

app.get('/payment-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// Add this new endpoint near the other API routes
app.get('/api/check-mock', (req, res) => {
    res.json({ isMock: process.env.IS_MOCK === 'true' });
});

// Update the protect middleware usage to check for mock mode
app.use((req, res, next) => {
    if (process.env.IS_MOCK === 'true') {
        req.user = {
            _id: 'test_user_id',
            email: 'test@gmail.com',
            name: 'Test User'
        };
        return next();
    }
    next();
});
