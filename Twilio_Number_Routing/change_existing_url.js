const twilio = require("twilio");
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const IS_MOCK = process.env.IS_MOCK === 'true';

async function updatePhoneNumber(assistantURL) {
    try {
        console.log("Received assistantURL:", assistantURL);
        console.log("IS_MOCK:", IS_MOCK);
        console.log("TWILIO_ACCOUNT_SID:", accountSid);
        console.log("TWILIO_AUTH_TOKEN:", authToken ? "Set" : "Not set");
        
        if (!assistantURL) {
            throw new Error("No valid URL provided");
        }

        // Add '/twiml' to the assistantURL if it's not already there
        const updatedURL = assistantURL.endsWith('/twiml') ? assistantURL : new URL('/twiml', assistantURL).toString();
        console.log("Updated URL:", updatedURL);

        try {
            const incomingPhoneNumber = await client
                .incomingPhoneNumbers("PNa52a81996a3f24d9e6a3117d8e9847da")
                .update({ voiceUrl: updatedURL });

            console.log(`Phone number ${incomingPhoneNumber.phoneNumber} updated with URL: ${incomingPhoneNumber.voiceUrl}`);
            
            return {
                accountSid: incomingPhoneNumber.accountSid,
                phoneNumber: incomingPhoneNumber.phoneNumber,
                voiceUrl: incomingPhoneNumber.voiceUrl
            };
        } catch (twilioError) {
            console.error("Twilio API Error:", twilioError);
            throw new Error("Failed to update Twilio phone number");
        }
    } catch (error) {
        console.error("Error in updatePhoneNumber:", error);
        throw error;
    }
}

module.exports = { updatePhoneNumber };
