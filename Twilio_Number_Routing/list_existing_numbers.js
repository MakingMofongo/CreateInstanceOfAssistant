// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";
require("dotenv").config();

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function listIncomingPhoneNumber() {
  const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({
    limit: 20,
  });

  incomingPhoneNumbers.forEach((i) => console.log(i));
}

listIncomingPhoneNumber();