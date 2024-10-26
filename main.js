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
const os = require('os');

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

// Add at the top with other constants
const DISABLE_FAUX_TIMERS = process.env.DISABLE_FAUX_TIMERS === 'true';

// Set Google Cloud project (keep this in main.js since it's not in deployment.js)
function setGoogleCloudProject() {
    return new Promise((resolve, reject) => {
        const command = 'gcloud config set project canvas-replica-402316';
        
        console.log('Executing project set command:', command);

        exec(command, (error, stdout, stderr) => {
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
            // Check if google_creds.json exists
            const keyFilePath = path.resolve(__dirname, 'google_creds.json');
            if (!fs.existsSync(keyFilePath)) {
                console.error('google_creds.json not found at:', keyFilePath);
                throw new Error('Google credentials file not found');
            }

            // Use the full Windows path
            const fullPath = keyFilePath.replace(/\\/g, '/');
            console.log('Using credentials file:', fullPath);

            const serviceAccountEmail = JSON.parse(fs.readFileSync(fullPath, 'utf8')).client_email;
            console.log('Authenticating with service account:', serviceAccountEmail);

            await authenticateServiceAccount(fullPath);
            await setGoogleCloudProject();
            console.log('Google Cloud initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Google Cloud:', error);
            throw error;
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

    // Check session settings first
    const sessionSettings = req.headers['x-session-settings'];
    let isMockMode = process.env.IS_MOCK === 'true';

    if (sessionSettings) {
      try {
        const settings = JSON.parse(sessionSettings);
        if (settings.isActive) {
          isMockMode = settings.IS_MOCK;
        }
      } catch (error) {
        console.error('Error parsing session settings:', error);
      }
    }

    // If mock mode is enabled (either globally or in session)
    if (isMockMode) {
      if (email === 'test@gmail.com' && password === 'test') {
        console.log('Test user login successful (mock mode)');
        const testUser = { 
          _id: 'test_user_id', 
          email: 'test@gmail.com',
          name: 'Test User'
        };
        const token = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        return res.json({ token });
      }
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

// Update the create-bot POST endpoint
app.post('/create-bot', protect, upload.single('additionalInfo'), async (req, res) => {
    const requestId = generateRandomString();
    console.log('New bot creation request received. RequestId:', requestId, 'User:', req.user._id);
    
    // Store session settings and create sendUpdate function
    const sessionSettings = req.headers['x-session-settings'];
    console.log('Received session settings:', sessionSettings);
    
    // Store the auth token along with other data
    const progressObject = { 
        sessionSettings: sessionSettings ? JSON.parse(sessionSettings) : null,
        authToken: req.headers.authorization, // Store the auth token
        sendUpdate: (data) => {
            console.log('Warning: sendUpdate called before SSE connection established');
        },
        isConnected: false // Add connection status flag
    };
    console.log('Created progress object:', {
        ...progressObject,
        authToken: progressObject.authToken ? 'present' : 'missing'
    });
    
    botCreationProgress.set(requestId, progressObject);
    
    // Send initial response with requestId
    console.log('Sending initial response with requestId:', requestId);
    res.json({ requestId });

    try {
        // Log the form data we received
        console.log('Form data received:', {
            serviceName: req.body.serviceName,
            name: req.body.name,
            botType: req.body.botType,
            hasFile: !!req.file
        });

        // Wait for SSE connection to be established
        console.log('Waiting for SSE connection...');
        await new Promise((resolve, reject) => {
            const maxWaitTime = 5000; // 5 seconds timeout
            const checkInterval = 100; // Check every 100ms
            let totalWaitTime = 0;

            const checkConnection = setInterval(() => {
                const progress = botCreationProgress.get(requestId);
                if (progress?.isConnected) {
                    clearInterval(checkConnection);
                    resolve();
                } else if (totalWaitTime >= maxWaitTime) {
                    clearInterval(checkConnection);
                    reject(new Error('Timeout waiting for SSE connection'));
                }
                totalWaitTime += checkInterval;
            }, checkInterval);
        });

        console.log('SSE connection established, starting bot creation...');

        // Process the bot creation with user ID
        const result = await processBotCreation(requestId, {
            serviceName: req.body.serviceName,
            name: req.body.name,
            formData: req.body,
            finalPrompt: req.body.finalPrompt,
            additionalInfo: req.file ? fs.readFileSync(req.file.path, 'utf8') : null,
            botType: req.body.botType,
            userId: req.user._id  // Pass the user ID
        });

        console.log('Bot creation completed successfully:', result);
    } catch (error) {
        console.error('Error in bot creation:', error);
        const progress = botCreationProgress.get(requestId);
        if (progress && typeof progress.sendUpdate === 'function') {
            progress.sendUpdate({ 
                error: 'Failed to create bot: ' + error.message,
                stack: error.stack
            });
        }
    } finally {
        // Clean up file if it exists
        if (req.file) {
            console.log('Cleaning up uploaded file');
            fs.unlinkSync(req.file.path);
        }
    }
});

// Update the SSE endpoint
app.get('/create-bot', async (req, res) => {
    const requestId = req.query.requestId;
    const token = req.query.token;
    
    console.log('SSE connection request for requestId:', requestId, 'token:', token ? 'present' : 'missing');
    
    if (!requestId) {
        console.error('Missing requestId in SSE request');
        return res.status(400).send('Missing requestId');
    }

    // Get the progress object
    const progress = botCreationProgress.get(requestId);
    if (!progress) {
        console.error('No progress object found for requestId:', requestId);
        return res.status(404).send('No progress found for this requestId');
    }

    // Use stored token if query token is missing
    const authToken = token || progress.authToken?.split(' ')[1];
    if (!authToken) {
        console.error('No token provided in request or stored progress');
        return res.status(401).send('Not authorized');
    }

    // Verify token
    try {
        const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            throw new Error('User not found');
        }
        req.user = user;
    } catch (error) {
        console.error('Authentication failed:', error);
        return res.status(401).send('Not authorized');
    }

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Create sendUpdate function
    const sendUpdate = (data) => {
        try {
            console.log('Sending SSE update:', data);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            console.error('Error sending SSE update:', error);
        }
    };

    // Update the progress object
    progress.sendUpdate = sendUpdate;
    progress.isConnected = true;
    botCreationProgress.set(requestId, progress);

    // Send initial connection message
    sendUpdate({ status: 'Connected', progress: 0 });

    // Handle client disconnect
    res.on('close', () => {
        console.log(`Client disconnected from SSE for requestId: ${requestId}`);
        const currentProgress = botCreationProgress.get(requestId);
        if (currentProgress) {
            currentProgress.isConnected = false;
            if (!currentProgress.finalData) {
                console.log('Cleaning up progress data for requestId:', requestId);
                botCreationProgress.delete(requestId);
            }
        }
    });
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
    try {
        await initializeGoogleCloud();

        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
            console.log('Environment:', process.env.NODE_ENV || 'development');
            console.log('MongoDB URI:', process.env.MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@'));
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
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

Do not provide medical advicerefer to professionals when necessary. Ensure all interactions are respectful and adhere to patient privacy guidelines.

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
        content += `Country: ${data.country}\n`;  // Fixed: Added backticks
        content += `Star Rating: ${data.hotelStars}\n`;
        content += `Number of Rooms: ${data.hotelRooms}\n`;
        content += `Amenities: ${data.hotelAmenities}\n`;
        content += `Description: ${data.hotelDescription}\n`;
        content += `Policies: ${data.hotelPolicies}\n`;
        content += `Location: ${data.hotelLocation}\n`;
    } else if (botType === 'Hospital') {
        content += `Hospital Name: ${data.hospitalName}\n`;
        content += `Email: ${data.email}\n`;
        content += `Country: ${data.country}\n`;  // Fixed: Added backticks
        content += `Hospital Type: ${data.hospitalType}\n`;
        content += `Departments: ${data.hospitalDepartments}\n`;
        content += `Number of Beds: ${data.hospitalBeds}\n`;
        content += `Description: ${data.hospitalDescription}\n`;
        content += `Services: ${data.hospitalServices}\n`;
        content += `Location: ${data.hospitalLocation}\n`;
    } else if (botType === 'Custom') {
        content += `Assistant Name: ${data.assistantName}\n`;
        content += `Email: ${data.email}\n`;
        content += `Country: ${data.country}\n`;  // Fixed: Added backticks
        content += `Industry: ${data.customIndustry}\n`;  // Fixed: Added backticks
        content += `Purpose: ${data.customPurpose}\n`;  // Fixed: Added backticks
        content += `Tone: ${data.customTone}\n`;  // Fixed: Added backticks
        content += `Knowledge Base: ${data.customKnowledgeBase}\n`;  // Fixed: Added backticks
        content += `Guidelines: ${data.customGuidelines}\n`;  // Fixed: Added backticks
    }

    // Append additional info from uploaded file
    if (additionalInfo) {
        content += '\nAdditional Information:\n' + additionalInfo;
    }

    return content;
}

// Update the simulateProgress function to accept settings parameter
async function simulateProgress(sendUpdate, status, duration, settings) {
    // Use passed settings instead of trying to access req
    if (settings?.DISABLE_FAUX_TIMERS) {
        // If faux timers are disabled, just send 0% and 100%
        sendUpdate({ status, progress: 0 });
        await new Promise(resolve => setTimeout(resolve, 100));
        sendUpdate({ status, progress: 100 });
        return;
    }

    // Regular faux timer behavior
    const steps = 10;
    const stepDuration = Math.floor(duration / steps);
    
    for (let i = 1; i <= steps; i++) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
        const progress = Math.round((i / steps) * 100);
        sendUpdate({ status, progress });
    }
}

// Update processBotCreation to properly handle settings
async function processBotCreation(requestId, { serviceName, name, formData, finalPrompt, additionalInfo, botType, userId }) {
    const progress = botCreationProgress.get(requestId);
    const sendUpdate = progress?.sendUpdate;
    
    try {
        // Get session settings from the progress object
        let effectiveSettings = {
            IS_MOCK: process.env.IS_MOCK === 'true',
            DISABLE_FAUX_TIMERS: process.env.DISABLE_FAUX_TIMERS === 'true'
        };

        if (progress && progress.sessionSettings) {
            try {
                const settings = JSON.parse(progress.sessionSettings);
                if (settings.isActive) {
                    // Session settings override global settings
                    effectiveSettings = {
                        IS_MOCK: settings.IS_MOCK,
                        DISABLE_FAUX_TIMERS: settings.DISABLE_FAUX_TIMERS
                    };
                    console.log('Using session settings for deployment:', effectiveSettings);
                }
            } catch (error) {
                console.error('Error parsing session settings:', error);
            }
        }

        console.log('Final effective settings for deployment:', effectiveSettings);

        // Create mock assistant data only if mock mode is enabled
        let assistant;
        if (effectiveSettings.IS_MOCK) {
            assistant = {
                id: 'mock_asst_' + Math.random().toString(36).substring(7),
                name: name,
                instructions: finalPrompt
            };
            console.log('Created mock assistant:', assistant);
        } else {
            // Create real OpenAI assistant
            console.log('Creating real OpenAI assistant...');
            assistant = await openai.beta.assistants.create({
                name: name,
                instructions: finalPrompt,
                model: "gpt-4o",
                tools: [{ type: "file_search" }],
            });
            console.log('Created real assistant:', assistant);
        }

        // Initializing
        sendUpdate({ status: 'Initializing', progress: 0 });
        await simulateProgress(sendUpdate, 'Initializing', effectiveSettings.IS_MOCK ? 1000 : 5000, effectiveSettings);
        sendUpdate({ status: 'Initializing', progress: 100 });

        // Creating Knowledge Base
        sendUpdate({ status: 'Creating Knowledge Base', progress: 0 });
        await simulateProgress(sendUpdate, 'Creating Knowledge Base', effectiveSettings.IS_MOCK ? 1000 : 5000, effectiveSettings);
        sendUpdate({ status: 'Creating Knowledge Base', progress: 100 });

        // Training AI
        sendUpdate({ status: 'Training AI', progress: 0 });
        await simulateProgress(sendUpdate, 'Training AI', effectiveSettings.IS_MOCK ? 1000 : 5000, effectiveSettings);
        sendUpdate({ status: 'Training AI', progress: 100 });

        // Cloud Setup
        sendUpdate({ status: 'Cloud Setup', progress: 0 });
        await simulateProgress(sendUpdate, 'Cloud Setup', effectiveSettings.IS_MOCK ? 1000 : 5000, effectiveSettings);
        
        const randomSuffix = generateRandomString();
        const deploymentName = effectiveSettings.IS_MOCK ? `tester-${randomSuffix}` : `${assistant.id}-${randomSuffix}`;
        
        sendUpdate({ status: 'Cloud Setup', progress: 100 });

        // Deployment
        sendUpdate({ status: 'Deployment', progress: 0 });
        
        if (effectiveSettings.IS_MOCK) {
            // Mock deployment process
            await simulateProgress(sendUpdate, 'Deployment', 1000, effectiveSettings);
            const mockServiceUrl = `https://mock-service-${randomSuffix}.run.app`;
            const mockCredentials = {
                username: 'mock_user_' + Math.random().toString(36).substring(7),
                password: 'mock_pass_' + Math.random().toString(36).substring(7)
            };
            
            sendUpdate({ status: 'Deployment', progress: 100 });
            
            // Send completion with mock data
            sendUpdate({ 
                status: 'completed',
                serviceUrl: mockServiceUrl,
                phoneNumber: '+13394997114',
                username: mockCredentials.username,
                password: mockCredentials.password
            });

            return {
                clonedServiceResult: { serviceUrl: mockServiceUrl },
                assistant,
                deployedUsername: mockCredentials.username,
                deployedPassword: mockCredentials.password
            };
        } else {
            console.log('Starting real deployment process...');
            // Real deployment process
            const emptyServiceResult = await deployment(deploymentName, null, randomSuffix, effectiveSettings);
            sendUpdate({ status: 'Deployment', progress: 33 });
            console.log('Empty service deployed:', emptyServiceResult);

            if (!emptyServiceResult.serviceUrl) {
                throw new Error('Failed to get service URL from empty deployment');
            }

            // First clone the assistant
            const cloneResult = await clone(assistant.id, emptyServiceResult.serviceUrl);
            sendUpdate({ status: 'Deployment', progress: 66 });
            console.log('Clone result:', cloneResult);

            // Then deploy the cloned folder
            const clonedServiceResult = await deployment(
                assistant.id,
                cloneResult.folderName,
                randomSuffix,
                effectiveSettings
            );

            if (!clonedServiceResult.serviceUrl) {
                throw new Error('Failed to get service URL from final deployment');
            }

            sendUpdate({ status: 'Deployment', progress: 100 });
            console.log('Final deployment result:', clonedServiceResult);

            // Send completion status with all required information
            const completionData = {
                status: 'completed',
                serviceUrl: clonedServiceResult.serviceUrl,
                phoneNumber: '+13394997114',
                username: cloneResult.username,
                password: cloneResult.password
            };

            console.log('Sending completion data:', completionData);
            sendUpdate(completionData);

            return {
                clonedServiceResult,
                assistant,
                deployedUsername: cloneResult.username,
                deployedPassword: cloneResult.password
            };
        }
    } catch (error) {
        console.error('Error in processBotCreation:', error);
        throw error;
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

// Update the create-order endpoint
app.post('/create-order', async (req, res) => {
    console.log('Received create-order request');
    try {
        const { amount, currency, receipt, notes } = req.body;
        console.log('Request body:', { amount, currency, receipt, notes });

        // Check session settings first
        const sessionSettings = req.headers['x-session-settings'];
        let skipPayment = false;

        if (sessionSettings) {
            try {
                const settings = JSON.parse(sessionSettings);
                if (settings.isActive) {
                    skipPayment = Boolean(settings.SKIP_PAYMENT);
                    console.log('Using session settings for skip payment:', skipPayment);
                }
            } catch (error) {
                console.error('Error parsing session settings:', error);
            }
        }

        // Fall back to global settings if no session settings
        if (!sessionSettings) {
            skipPayment = process.env.SKIP_PAYMENT === 'true';
            console.log('Using global settings for skip payment:', skipPayment);
        }

        console.log('Final skip payment value:', skipPayment);

        if (skipPayment) {
            console.log('Payment skipped - creating mock order');
            const mockOrder = {
                id: 'mock_order_' + Date.now(),
                amount: amount,
                currency: currency,
                receipt: receipt,
                status: 'created',
                mock: true
            };
            console.log('Created mock order:', mockOrder);
            return res.json(mockOrder);
        }

        // Regular Razorpay order creation
        console.log('Creating real Razorpay order');
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
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Error creating order', error: error.message });
    }
});

// Route to handle payment verification
app.post('/verify-payment', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Check if we're in mock mode
    if (process.env.SKIP_PAYMENT === 'true') {
        // For mock payments, always verify as successful
        const orders = readData();
        const order = orders.find(o => o.order_id === razorpay_order_id);
        if (order) {
            order.status = 'paid';
            order.payment_id = razorpay_payment_id;
            writeData(orders);
        }
        res.status(200).json({ status: 'ok' });
        console.log("Mock payment verification successful");
        return;
    }

    // Real Razorpay verification
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
    // Check session settings first
    const sessionSettings = req.headers['x-session-settings'];
    let isMockMode = process.env.IS_MOCK === 'true';

    if (sessionSettings) {
        try {
            const settings = JSON.parse(sessionSettings);
            if (settings.isActive) {
                isMockMode = settings.IS_MOCK;
            }
        } catch (error) {
            console.error('Error parsing session settings:', error);
        }
    }

    if (isMockMode) {
        req.user = {
            _id: 'test_user_id',
            email: 'test@gmail.com',
            name: 'Test User'
        };
        return next();
    }
    next();
});

// Add this new endpoint near the other API routes
app.get('/api/check-payment-mode', (req, res) => {
    res.json({ skipPayment: process.env.SKIP_PAYMENT === 'true' });
});

// Update the middleware that handles settings
app.use(async (req, res, next) => {
    try {
        // First check session settings in headers
        const sessionSettings = req.headers['x-session-settings'];
        if (sessionSettings) {
            try {
                const settings = JSON.parse(sessionSettings);
                if (settings.isActive) {
                    // Use session settings exclusively if they exist
                    req.effectiveSettings = {
                        IS_MOCK: Boolean(settings.IS_MOCK),
                        SKIP_PAYMENT: Boolean(settings.SKIP_PAYMENT),
                        DISABLE_FAUX_TIMERS: Boolean(settings.DISABLE_FAUX_TIMERS)
                    };
                    // Only log on actual setting changes or important endpoints
                    if (req.path.includes('/api/admin') || req.path.includes('/create-order')) {
                        console.log('Using session settings:', req.effectiveSettings);
                    }
                    return next();
                }
            } catch (error) {
                console.error('Error parsing session settings:', error);
            }
        }

        // Fall back to global settings only if no session settings exist
        req.effectiveSettings = {
            IS_MOCK: process.env.IS_MOCK === 'true',
            SKIP_PAYMENT: process.env.SKIP_PAYMENT === 'true',
            DISABLE_FAUX_TIMERS: process.env.DISABLE_FAUX_TIMERS === 'true'
        };
        // Only log on actual setting changes or important endpoints
        if (req.path.includes('/api/admin') || req.path.includes('/create-order')) {
            console.log('Using global settings:', req.effectiveSettings);
        }
        next();
    } catch (error) {
        console.error('Error processing settings:', error);
        next(error);
    }
});

// Update the check-mock-mode endpoint to be more selective about logging
app.get('/api/check-mock-mode', (req, res) => {
    const settings = req.effectiveSettings;
    // Only log when settings actually change
    const settingsKey = JSON.stringify(settings);
    if (req.app.locals.lastSettingsKey !== settingsKey) {
        console.log('Settings changed to:', settings);
        req.app.locals.lastSettingsKey = settingsKey;
    }
    
    res.json({ 
        isMock: settings.IS_MOCK,
        skipPayment: settings.SKIP_PAYMENT,
        disableFauxTimers: settings.DISABLE_FAUX_TIMERS,
        source: req.headers['x-session-settings'] ? 'session' : 'global'
    });
});

// Add these endpoints near other API routes
app.get('/api/admin/settings', (req, res) => {
    try {
        const settings = {
            IS_MOCK: process.env.IS_MOCK === 'true',
            SKIP_PAYMENT: process.env.SKIP_PAYMENT === 'true',
            DISABLE_FAUX_TIMERS: process.env.DISABLE_FAUX_TIMERS === 'true'
        };
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/admin/settings', (req, res) => {
    try {
        const settings = req.body;
        console.log('Updating settings:', settings); // Debug log

        // Update environment variables
        Object.entries(settings).forEach(([key, value]) => {
            process.env[key] = value.toString();
            console.log(`Updated ${key} to ${value}`); // Debug log
        });

        // Return updated settings
        res.json({ 
            success: true, 
            settings: {
                IS_MOCK: process.env.IS_MOCK === 'true',
                SKIP_PAYMENT: process.env.SKIP_PAYMENT === 'true',
                DISABLE_FAUX_TIMERS: process.env.DISABLE_FAUX_TIMERS === 'true'
            }
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Add this endpoint to get user data
app.get('/api/user', (req, res) => {
    // Check for mock mode
    if (req.effectiveSettings?.IS_MOCK) {
        return res.json({
            name: 'Test User',
            email: 'test@example.com'
        });
    }

    // If not in mock mode and no user, return default data
    if (!req.user) {
        return res.json({
            name: 'Guest User',
            email: 'guest@example.com'
        });
    }

    // Return actual user data
    res.json({
        name: req.user.name,
        email: req.user.email
    });
});

