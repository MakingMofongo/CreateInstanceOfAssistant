// Server that receives 'assistant_id' and Cretes a new 'Receptionist' with the given 'assistant_id' and DEPLOYS it to Google Cloud Run

const express = require('express');
const bodyParser = require('body-parser');
const { clone } = require('./cloner');
const { deployment } = require('./deployment');
const { log } = require('console');

const app = express();
app.use(bodyParser.json());

app.post('/deploy', async (req, res) => {
  const { assistant_id } = req.body;
  log ('assistant_id:', assistant_id);

  if (!assistant_id) {
    res.status(400).send('Missing assistant_id');
    return;
  }

  // Clone the necessary files
  folder_name=clone(assistant_id);
  asstUrl=deployment(assistant_id,folder_name);
  log('asstUrl:', asstUrl);

  res.send(asstUrl);
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});