// Source/tests/testMicTranscriptionService.js

const mic = require('mic');
const fs = require('fs');
const path = require('path');
const TranscriptionService = require('../transcription-service'); // Updated path
require('dotenv').config({ path: '../.env' }); // Updated path

// Check if GOOGLE_APPLICATION_CREDENTIALS is set and the file exists
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set');
  process.exit(1);
}

if (!fs.existsSync(credentialsPath)) {
  console.error(`Credentials file not found: ${credentialsPath}`);
  process.exit(1);
}

console.log('Google Cloud credentials file found:', credentialsPath);

// Initialize TranscriptionService
const transcriptionService = new TranscriptionService();

// Logger Function
const logger = (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
};

// Perform real-time transcription test
async function performMicTest() {
    return new Promise((resolve) => {
        let transcription = '';
        let silenceTimer = null;
        const silenceThreshold = 10000; // 10 seconds of silence to end the session
        let hasStartedSpeaking = false;

        // Listener for transcription events
        const onTranscription = (transcript, isFinal) => {
            if (!hasStartedSpeaking) {
                hasStartedSpeaking = true;
                logger('Speech detected, starting silence timer...');
            }

            // Log interim results, but don't add them to final transcription
            if (!isFinal) {
                logger(`Interim transcription: "${transcript}"`);
            } else {
                transcription += transcript + ' ';
                logger(`Final transcription: "${transcription.trim()}"`);
            }
            
            // Reset the silence timer
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
                logger('Stopping due to silence...');
                stopRecording();
            }, silenceThreshold);
        };

        const onError = (error) => {
            logger(`❌ Transcription error: ${error}`);
        };

        const onStreamClosed = () => {
            logger(`\n📊 Final Transcription: "${transcription.trim()}"`);
            resolve();
        };

        transcriptionService.on('transcription', onTranscription);
        transcriptionService.on('error', onError);
        transcriptionService.on('streamClosed', onStreamClosed);

        // Start the transcription service
        transcriptionService.start();

        // Set up microphone
        const micInstance = mic({
            rate: '16000',
            channels: '1',
            encoding: 'signed-integer',
            bitwidth: '16',
            exitOnSilence: 6
        });

        const micInputStream = micInstance.getAudioStream();
        micInputStream.on('data', (data) => {
            transcriptionService.send(data);
        });

        micInputStream.on('error', (err) => {
            logger(`Microphone input stream error: ${err}`);
        });

        micInstance.start();
        logger('🎙️ Microphone activated. Start speaking...');

        // Start the silence timer
        silenceTimer = setTimeout(() => {
            logger('Stopping due to initial silence...');
            stopRecording();
        }, silenceThreshold);

        function stopRecording() {
            clearTimeout(silenceTimer);
            micInstance.stop();
            transcriptionService.stop();
        }

        // Allow manual stopping after 2 minutes as a fallback
        setTimeout(() => {
            logger('Maximum recording time reached. Stopping...');
            stopRecording();
        }, 120000); // 2 minutes
    });
}

// Main test runner
(async () => {
    logger('🚀 Starting Microphone Transcription Service Test...\n');

    await performMicTest();

    logger('\n🏁 Microphone Transcription Test Completed');

    // Ensure the process exits
    setTimeout(() => {
        process.exit(0);
    }, 2000);
})();