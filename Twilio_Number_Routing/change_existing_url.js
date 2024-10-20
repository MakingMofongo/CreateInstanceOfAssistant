const twilio = require("twilio");
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function updatePhoneNumber(assistantURL) {
    try {
        console.log("Received assistantURL:", assistantURL);
        
        if (!assistantURL) {
            throw new Error("No valid URL provided");
        }

        // Add '/twiml' to the assistantURL
        const updatedURL = new URL('/twiml', assistantURL).toString();

        const incomingPhoneNumber = await client
            .incomingPhoneNumbers("PNa52a81996a3f24d9e6a3117d8e9847da")
            .update({ voiceUrl: updatedURL });

        console.log(`Phone number ${incomingPhoneNumber.phoneNumber} updated with URL: ${updatedURL}`);
        return {
            accountSid: incomingPhoneNumber.accountSid,
            phoneNumber: incomingPhoneNumber.phoneNumber,
            voiceUrl: incomingPhoneNumber.voiceUrl
        };
    } catch (error) {
        console.error("Error in updatePhoneNumber:", error);
        throw new Error("Failed to update phone number");
    }
}

module.exports = { updatePhoneNumber };
