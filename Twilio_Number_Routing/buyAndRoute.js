const twilio = require("twilio");
require('dotenv').config();

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function buyAndRouteNumber(country, voiceUrl) {
    try {
        // Search for available phone numbers
        const availableNumbers = await client.availablePhoneNumbers(country).local.list({
            limit: 20,
        });

        if (availableNumbers.length === 0) {
            throw new Error("No available phone numbers found");
        }

        // Select the first available number
        const selectedNumber = availableNumbers[0].phoneNumber;

        // Create the incoming phone number
        const incomingPhoneNumber = await client.incomingPhoneNumbers.create({
            phoneNumber: selectedNumber,
            voiceUrl: voiceUrl,
        });

        console.log(`Phone number ${incomingPhoneNumber.phoneNumber} created and routed to ${voiceUrl}`);

        return {
            accountSid: incomingPhoneNumber.accountSid,
            phoneNumber: incomingPhoneNumber.phoneNumber,
            voiceUrl: incomingPhoneNumber.voiceUrl
        };
    } catch (error) {
        console.error("Error in buyAndRouteNumber:", error);
        throw new Error("Failed to create or update incoming phone number");
    }
}

module.exports = { buyAndRouteNumber };
