const express = require('express');
const bodyParser = require('body-parser');
const { clone } = require('./cloner');
const { deployment, sanitizeServiceName, generateRandomString, authenticateServiceAccount } = require('./deployment');
const { log } = require('console');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());

function generatePassword(length = 12) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

// Authenticate service account when the server starts
authenticateServiceAccount()
  .then(() => {
    console.log('Service account authenticated successfully');
    startServer();
  })
  .catch((error) => {
    console.error('Failed to authenticate service account:', error);
    process.exit(1);
  });

function startServer() {
  app.post('/deploy', async (req, res) => {
    const data = req.body;
    const assistant_id = data.assistant_id;
    log('assistant_id:', assistant_id);

    if (!assistant_id) {
      res.status(400).send('Missing assistant_id');
      return;
    }

    const serviceName = sanitizeServiceName(assistant_id);
    const randomSuffix = generateRandomString();

    // Generate login credentials
    const username = serviceName;
    const password = generatePassword();

    try {
      console.log('Deploying the empty service to obtain the URL...');
      const emptyServiceResult = await deployment(serviceName, null, randomSuffix);
      const emptyServiceUrl = emptyServiceResult.serviceUrl;
      console.log('Empty Service Deployment Success:', emptyServiceResult);

      console.log('Cloning the project with the service URL...');
      const folder_name = clone(assistant_id, emptyServiceUrl);

      // Add login credentials to the cloned project
      const envPath = path.join(__dirname, folder_name, '.env');
      fs.appendFileSync(envPath, `\nDEV_CONSOLE_USERNAME=${username}\nDEV_CONSOLE_PASSWORD=${password}\n`);

      console.log('Redeploying the cloned service...');
      const clonedServiceResult = await deployment(serviceName, folder_name, randomSuffix);
      const clonedServiceUrl = clonedServiceResult.serviceUrl;
      console.log('Cloned Service Deployment Success:', clonedServiceResult);

      res.send({ 
        serviceUrl: clonedServiceUrl,
        devConsoleCredentials: {
          username: username,
          password: password
        }
      });
    } catch (error) {
      console.error('Deployment Failed:', error);
      res.status(500).send({ error: 'Deployment failed', details: error.message });
    }
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
}

//curl -X POST -H "Content-Type: application/json" -d '{"assistant_id": "asst_sAx8OVokdCzjQ5xXivN2wNmw"}' http://localhost:8080/deploy
