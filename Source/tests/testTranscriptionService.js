// Source/tests/testTranscriptionService.js

const fs = require('fs');
const path = require('path');
const TranscriptionService = require('../transcription-service'); // Updated path
require('dotenv').config({ path: '../.env' }); // Updated path

// Define test cases
const testCases = [
    {
        languageCode: 'en-US',
        text: 'Hello, this is a test for the English language transcription!',
        audioFile: 'EngTestWav.wav',
    },
    {
        languageCode: 'fi-FI',
        text: 'Hei, tämä on testi suomen kielen transkriptiolle!',
        audioFile: 'FinnishTestWav.wav',
    },
    {
        languageCode: 'ar-SA',
        text: 'مرحباً، هذا اختبارٌ للنسخِ باللغةِ العربيةِ!',
        audioFile: 'ArabicTestWav.wav',
    }
];

// Initialize TranscriptionService
const transcriptionService = new TranscriptionService();

// Logger Function
const logger = (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
};

// Perform transcription test
function performTest(testCase) {
    return new Promise((resolve) => {
        const audioPath = path.join(__dirname, testCase.audioFile);

        if (!fs.existsSync(audioPath)) {
            logger(`❌ Audio file not found: ${testCase.audioFile}. Please ensure the file exists.`);
            resolve({ success: false, error: 'Audio file not found' });
            return;
        }

        const audioBuffer = fs.readFileSync(audioPath);
        logger(`Read audio file: ${audioBuffer.length} bytes`);

        let actualTranscription = '';
        const startTime = Date.now();

        // Listener for transcription events
        const onTranscription = (transcript, isFinal, detectedLanguage) => {
            logger(`Received transcription: ${transcript}, isFinal: ${isFinal}, detectedLanguage: ${detectedLanguage}`);
            if (isFinal) {
                actualTranscription += transcript + ' ';
            }
        };

        const onError = (error) => {
            logger(`❌ Transcription error: ${error}`);
            cleanup();
            resolve({ success: false, error: error.toString() });
        };

        const onStreamClosed = () => {
            logger('Stream closed event received');
            const endTime = Date.now();
            const latency = endTime - startTime;
            logger(`\n📚 Language: ${testCase.languageCode}`);
            logger(`🔍 Expected: "${testCase.text}"`);
            logger(`📝 Actual: "${actualTranscription.trim()}"`);
            logger(`⏱️ Latency: ${latency} ms`);

            // Updated comparison function
            const compareTranscriptions = (expected, actual) => {
                if (testCase.languageCode.startsWith('ar')) {
                    // For Arabic, remove diacritics, punctuation, and normalize some characters
                    const normalize = (text) => text
                        .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '')
                        .replace(/[،؛؟.!]/g, '')
                        .replace(/\s+/g, ' ')
                        .replace(/ة/g, 'ه')  // Normalize taa marbouta
                        .replace(/ى/g, 'ي')  // Normalize alif maqsura
                        .replace(/آ|إ|أ/g, 'ا')  // Normalize alif variations
                        .trim()
                        .toLowerCase();
                    const normalizedExpected = normalize(expected);
                    const normalizedActual = normalize(actual);
                    console.log('Normalized Expected:', normalizedExpected);
                    console.log('Normalized Actual:', normalizedActual);
                    return normalizedExpected === normalizedActual;
                } else {
                    // For other languages, keep the existing comparison
                    const normalize = (text) => text.toLowerCase().replace(/[.,!?;:]/g, '').trim();
                    return normalize(expected) === normalize(actual);
                }
            };

            const success = compareTranscriptions(testCase.text, actualTranscription);
            logger(success ? '✅ Test Passed' : '❌ Test Failed');

            cleanup();
            resolve({ success, latency, actualTranscription: actualTranscription.trim() });
        };

        const cleanup = () => {
            transcriptionService.removeListener('transcription', onTranscription);
            transcriptionService.removeListener('error', onError);
            transcriptionService.removeListener('streamClosed', onStreamClosed);
        };

        transcriptionService.on('transcription', onTranscription);
        transcriptionService.on('error', onError);
        transcriptionService.on('streamClosed', onStreamClosed);

        // Start the transcription service with multilingual configuration
        transcriptionService.start(['en-US', 'fi-FI', 'ar-SA']);

        // Send audio data to the transcription service
        const chunkSize = 4096; // 4KB chunks
        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
            const chunk = audioBuffer.slice(i, i + chunkSize);
            transcriptionService.send(chunk);
        }

        logger('Finished sending audio data');
        transcriptionService.stop();
    });
}

// Main test runner
(async () => {
    logger('🚀 Starting Transcription Service Tests...\n');

    const results = [];

    // Perform all tests sequentially
    for (const testCase of testCases) {
        logger(`Starting test for language: ${testCase.languageCode}`);
        const result = await performTest(testCase);
        results.push(result);
    }

    // Log test summary
    logger('\n📋 Test Summary:');
    logger(`🔄 Tests Run: ${testCases.length}`);
    logger(`✅ Tests Passed: ${results.filter(r => r.success).length}`);
    logger(`❌ Tests Failed: ${results.filter(r => !r.success).length}`);

    // Calculate and log average latency
    const averageLatency = results.reduce((sum, r) => sum + (r.latency || 0), 0) / results.length;
    logger(`📈 Average Latency: ${averageLatency.toFixed(2)} ms`);

    // Ensure the process exits
    setTimeout(() => {
        process.exit(0);
    }, 2000);
})();