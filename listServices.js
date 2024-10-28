require('dotenv').config();
const { ServicesClient } = require('@google-cloud/run').v2;
const mongoose = require('mongoose');
const Bot = require('./models/Bot');

async function listAllServices() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('\n=== MongoDB Connection ===');
        console.log('Connected to:', mongoose.connection.name);

        // Initialize Cloud Run client
        const runClient = new ServicesClient({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
        });

        // Get all bots from database
        const bots = await Bot.find({});
        
        console.log('\n=== BOTS IN DATABASE ===');
        console.log('Total Bots:', bots.length);
        bots.forEach((bot, index) => {
            console.log(`\nBot ${index + 1}:`);
            console.log('ID:', bot._id);
            console.log('Name:', bot.name);
            console.log('Type:', bot.type);
            console.log('Service URL:', bot.serviceUrl);
            console.log('Deployment Name:', bot.deploymentName);
            console.log('Assistant ID:', bot.assistantId);
            console.log('Phone Number:', bot.phoneNumber);
            console.log('Created At:', bot.createdAt);
            console.log('------------------------');
        });

        // Get all Cloud Run services
        const parent = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/asia-south1`;
        console.log('\n=== CLOUD RUN SERVICES ===');
        console.log('Project:', process.env.GOOGLE_CLOUD_PROJECT);
        console.log('Region: asia-south1');
        
        const [services] = await runClient.listServices({ parent });
        console.log('\nTotal Services:', services.length);
        
        services.forEach((service, index) => {
            console.log(`\nService ${index + 1}:`);
            console.log('Name:', service.name);
            console.log('URI:', service.uri);
            console.log('Creation Time:', service.createTime);
            console.log('Creator:', service.creator);
            console.log('Last Modifier:', service.lastModifier);
            console.log('Latest Ready Revision:', service.latestReadyRevision);
            console.log('------------------------');
        });

        // Compare and analyze
        console.log('\n=== DEPLOYMENT ANALYSIS ===');
        function normalizeServiceName(name) {
            // Remove project ID suffix if it exists
            return name.replace(/-\d+$/, '');
        }

        const cloudRunServiceNames = services.map(s => s.name.split('/').pop());
        const botDeploymentNames = bots.map(b => normalizeServiceName(b.deploymentName));

        console.log('\nBots not found in Cloud Run:');
        bots.forEach(bot => {
            const normalizedName = normalizeServiceName(bot.deploymentName);
            const isMockUrl = bot.serviceUrl.includes('mock-url');
            const serviceExists = cloudRunServiceNames.some(name => 
                name.startsWith(normalizedName.split('-')[0]));
            
            if (!serviceExists && !isMockUrl) {
                console.log(`- ${bot.deploymentName}`);
                console.log(`  Bot Name: ${bot.name}`);
                console.log(`  Service URL: ${bot.serviceUrl}`);
                console.log(`  Created At: ${bot.createdAt}`);
                console.log(`  Status: ${isMockUrl ? 'Mock Deployment' : 'Missing Service'}`);
            }
        });

        console.log('\nCloud Run services not linked to any bot:');
        cloudRunServiceNames.forEach(name => {
            // Ignore utility services
            if (['deploy', 'hello', 'createinstanceofassistant1'].includes(name)) {
                return;
            }

            const isLinked = bots.some(bot => 
                name.startsWith(normalizeServiceName(bot.deploymentName).split('-')[0]));
            
            if (!isLinked) {
                const service = services.find(s => s.name.split('/').pop() === name);
                console.log(`- ${name}`);
                console.log(`  URI: ${service.uri || 'No URI'}`);
                console.log(`  Created: ${service.createTime}`);
                console.log(`  Creator: ${service.creator}`);
            }
        });

        // Update summary to be more accurate
        const realBots = bots.filter(b => !b.serviceUrl.includes('mock-url'));
        const missingServices = realBots.filter(bot => {
            const normalizedName = normalizeServiceName(bot.deploymentName);
            return !cloudRunServiceNames.some(name => 
                name.startsWith(normalizedName.split('-')[0]));
        });

        const utilityServices = ['deploy', 'hello', 'createinstanceofassistant1'];
        const unlinkedServices = cloudRunServiceNames.filter(name => {
            if (utilityServices.includes(name)) return false;
            return !bots.some(bot => 
                name.startsWith(normalizeServiceName(bot.deploymentName).split('-')[0]));
        });

        console.log('\n=== SUMMARY ===');
        console.log('Total Bots in Database:', bots.length);
        console.log('Real Deployments:', realBots.length);
        console.log('Mock Deployments:', bots.length - realBots.length);
        console.log('Total Services in Cloud Run:', services.length);
        console.log('Utility Services:', utilityServices.length);
        console.log('Missing Services:', missingServices.length);
        console.log('Unlinked Services:', unlinkedServices.length);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nMongoDB disconnected');
    }
}

// Run the function
listAllServices().catch(console.error);
