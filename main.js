const express = require('express');
const bodyParser = require('body-parser');
const { clone } = require('./cloner');
const { deployment, sanitizeServiceName, generateRandomString } = require('./deployment');
const { log } = require('console');

const app = express();
app.use(bodyParser.json());

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

  try {
    console.log('Deploying the empty service to obtain the URL...');
    // Deploy the empty service first
    const emptyServiceResult = await deployment(serviceName, null, randomSuffix);
    const emptyServiceUrl = emptyServiceResult.serviceUrl;
    console.log('Empty Service Deployment Success:', emptyServiceResult);

    // Clone the necessary files with the obtained service URL
    console.log('Cloning the project with the service URL...');
    const folder_name = clone(assistant_id, emptyServiceUrl);

    console.log('Redeploying the cloned service...');
    const clonedServiceResult = await deployment(serviceName, folder_name, randomSuffix);
    const clonedServiceUrl = clonedServiceResult.serviceUrl;
    console.log('Cloned Service Deployment Success:', clonedServiceResult);

    // Send the cloned service URL in the response
    res.send({ serviceUrl: clonedServiceUrl });
  } catch (error) {
    console.error('Deployment Failed:', error);
    res.status(500).send({ error: 'Deployment failed', details: error.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  // Test the server using:
  // curl -X POST -H "Content-Type: application/json" -d '{"assistant_id":"asst_sAx8OVokdCzjQ5xXivN2wNmw"}' http://localhost:8080/deploy
});
