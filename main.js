const express = require('express');
const bodyParser = require('body-parser');
const { clone } = require('./cloner');
const { deployment } = require('./deployment');
const { log } = require('console');

const app = express();
app.use(bodyParser.json());

function sanitizeServiceName(name) {
  // Convert to lowercase, replace invalid characters, and truncate to 63 characters
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // Replace anything not alphanumeric or dash with a dash
    .substring(0, 50)              // Limit the length to 63 characters
    .replace(/^-+|-+$/g, '');      // Remove leading or trailing dashes
}

app.post('/deploy', async (req, res) => {
  const data = req.body;
  const assistant_id = data.assistant_id;
  log('assistant_id:', assistant_id);

  if (!assistant_id) {
    res.status(400).send('Missing assistant_id');
    return;
  }

  // Clone the necessary files
  const folder_name = clone(assistant_id);

  try {
    console.log('Deploying the service...');
    // 
    serviceName = sanitizeServiceName(assistant_id);
    const result = await deployment(serviceName, folder_name);
    const serviceUrl = result.serviceUrl;
    console.log('Deployment Success:', result);
    console.log('Service URL:', serviceUrl);
    // Send both the result and the service URL in the response
    res.send({serviceUrl});
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
