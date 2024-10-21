const twilio = require("twilio");
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const IS_MOCK = process.env.IS_MOCK === 'true';

async function updatePhoneNumber(assistantURL) {
    try {
        console.log("Received assistantURL:", assistantURL);
        
        if (!assistantURL) {
            throw new Error("No valid URL provided");
        }

        // Add '/twiml' to the assistantURL if it's not already there
        const updatedURL = assistantURL.endsWith('/twiml') ? assistantURL : new URL('/twiml', assistantURL).toString();

        // Always update the Twilio number, regardless of mock mode
        const incomingPhoneNumber = await client
            .incomingPhoneNumbers("PNa52a81996a3f24d9e6a3117d8e9847da")
            .update({ voiceUrl: updatedURL });

        console.log("Twilio API Response:", JSON.stringify(incomingPhoneNumber, null, 2));

        console.log(`Phone number ${incomingPhoneNumber.phoneNumber} updated with URL: ${updatedURL}`);
        
        if (IS_MOCK) {
            console.log("Mock mode: Phone number updated, other operations may be simulated");
        }

        return {
            accountSid: incomingPhoneNumber.accountSid,
            phoneNumber: incomingPhoneNumber.phoneNumber,
            voiceUrl: incomingPhoneNumber.voiceUrl
        };
    } catch (error) {
        console.error("Error in updatePhoneNumber:", error);
        throw new Error("Failed to update phone number: " + error.message);
    }
}

module.exports = { updatePhoneNumber };
