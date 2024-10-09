// testElevenLabsMultilingual.js

const path = require('path');
const ElevenLabsTTS = require('../ElevenLabsTTS');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const { exec } = require('child_process');

console.log('ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY);

// Logger Function
const logger = (message) => {
    const timestamp = new Date().toISOString();
    const fileName = path.basename(__filename);
    console.log(`[${timestamp}] [${fileName}] ${message}`);
};

// Configuration
const apiKey = process.env.ELEVENLABS_API_KEY;
const testCases = [
    {
        language: 'English',
        text: "Hello! This is a test of the Eleven Turbo v2.5 model's ability to handle English.",
        outputRaw: 'output_audio_english.raw',
        outputWav: 'output_audio_english.wav'
    },
    {
        language: 'Finnish',
        text: "Hyvää päivää! Tämä on testi Eleven Turbo v2.5 -mallin kyvystä käsitellä suomen kieltä.",
        outputRaw: 'output_audio_finnish.raw',
        outputWav: 'output_audio_finnish.wav'
    },
    {
        language: 'Arabic',
        text: "مرحبا! هذا اختبار لقدرة نموذج Eleven Turbo v2.5 على التعامل مع اللغة العربية.",
        outputRaw: 'output_audio_arabic.raw',
        outputWav: 'output_audio_arabic.wav'
    }
];

// Validate API Key
if (!apiKey) {
    logger('❌ Error: ELEVENLABS_API_KEY is not set in the .env file or is not being read correctly.');
    process.exit(1);
}

// Initialize ElevenLabsTTS
const tts = new ElevenLabsTTS(apiKey);

// Function to delete specific test files
function deleteSpecificTestFiles() {
    const testDirectory = __dirname;
    testCases.forEach(testCase => {
        const rawPath = path.join(testDirectory, testCase.outputRaw);
        const wavPath = path.join(testDirectory, testCase.outputWav);
        
        if (fs.existsSync(rawPath)) {
            fs.unlinkSync(rawPath);
            logger(`Deleted previous RAW file: ${testCase.outputRaw}`);
        }
        if (fs.existsSync(wavPath)) {
            fs.unlinkSync(wavPath);
            logger(`Deleted previous WAV file: ${testCase.outputWav}`);
        }
    });
}

async function runTest(testCase) {
    logger(`\n🚀 Starting test for ${testCase.language}`);

    const metrics = {
        connectionStartTime: null,
        connectionEndTime: null,
        firstChunkStartTime: null,
        firstChunkEndTime: null,
        totalChunks: 0,
        totalBytes: 0,
        chunkLatencies: [],
        chunkSizes: [],
        totalTestStartTime: null,
        totalTestEndTime: null,
    };

    try {
        metrics.totalTestStartTime = Date.now();

        // Connect to ElevenLabs TTS WebSocket
        metrics.connectionStartTime = Date.now();
        await tts.connect();
        metrics.connectionEndTime = Date.now();
        logger(`✅ Connected to ElevenLabs TTS WebSocket for ${testCase.language} test.`);

        // Prepare to write the audio output to a file
        const OUTPUT_RAW_PATH = path.join(__dirname, testCase.outputRaw);
        const OUTPUT_WAV_PATH = path.join(__dirname, testCase.outputWav);
        const writeStream = fs.createWriteStream(OUTPUT_RAW_PATH);
        logger(`📁 Audio will be saved to ${OUTPUT_RAW_PATH}`);

        // Create a promise that resolves when all chunks are received
        const audioPromise = new Promise((resolve, reject) => {
            let chunkStartTime = null;

            const onDataCallback = (audioChunk, chunkSno, isFinal) => {
                try {
                    const receiveTime = Date.now();
                    metrics.totalChunks++;
                    metrics.totalBytes += audioChunk.length;
                    metrics.chunkSizes.push(audioChunk.length);

                    if (chunkSno === 1) {
                        metrics.firstChunkEndTime = receiveTime;
                        metrics.firstChunkStartTime = chunkStartTime;
                        logger(`🚀 First Chunk Received for ${testCase.language}:`);
                        logger(`   ⏱️ First Chunk Latency: ${receiveTime - chunkStartTime} ms`);
                        logger(`   📦 First Chunk Size: ${audioChunk.length} bytes`);
                    }

                    const latency = receiveTime - chunkStartTime;
                    metrics.chunkLatencies.push(latency);

                    logger(`🔍 Chunk ${chunkSno} received for ${testCase.language}. Size: ${audioChunk.length} bytes, Latency: ${latency} ms`);

                    // Write the audio chunk to the file
                    writeStream.write(audioChunk);

                    if (isFinal) {
                        logger(`✅ Received final audio chunk for ${testCase.language}.`);
                        writeStream.end();
                        resolve();
                    } else {
                        chunkStartTime = Date.now(); // Start timing for the next chunk
                    }
                } catch (callbackError) {
                    reject(callbackError);
                }
            };

            const onErrorCallback = (error) => {
                reject(error);
            };

            // Send text to TTS
            chunkStartTime = Date.now(); // Start timing for the first chunk
            tts.textToSpeech(testCase.text, onDataCallback, onErrorCallback, true);
        });

        // Await the completion of audio reception
        await audioPromise;

        metrics.totalTestEndTime = Date.now();

        // Calculate metrics
        const connectionLatency = metrics.connectionEndTime - metrics.connectionStartTime;
        const firstChunkLatency = metrics.firstChunkEndTime - metrics.firstChunkStartTime;
        const totalTestDuration = metrics.totalTestEndTime - metrics.totalTestStartTime;
        const averageChunkLatency = metrics.chunkLatencies.reduce((a, b) => a + b, 0) / metrics.chunkLatencies.length;
        const averageChunkSize = metrics.chunkSizes.reduce((a, b) => a + b, 0) / metrics.chunkSizes.length;

        // Log metrics
        logger(`\n📊 ${testCase.language} Test Metrics (Eleven Turbo v2.5 model):`);
        logger(`⏱️ WebSocket Connection Latency: ${connectionLatency} ms`);
        logger(`⏱️ First Chunk Latency: ${firstChunkLatency} ms`);
        logger(`📦 Total Chunks Received: ${metrics.totalChunks}`);
        logger(`📦 Total Data Received: ${metrics.totalBytes} bytes`);
        logger(`⏱️ Average Chunk Latency: ${averageChunkLatency.toFixed(2)} ms`);
        logger(`📦 Average Chunk Size: ${averageChunkSize.toFixed(2)} bytes`);
        logger(`⏱️ Total Test Duration: ${totalTestDuration} ms`);

        logger(`✅ ${testCase.language} test completed.`);

        // Convert raw audio to WAV using FFmpeg
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -f mulaw -ar 8000 -ac 1 -i "${OUTPUT_RAW_PATH}" "${OUTPUT_WAV_PATH}"`, (error, stdout, stderr) => {
                if (error) {
                    logger(`❌ Error converting audio for ${testCase.language}: ${error.message}`);
                    logger(`stderr: ${stderr}`);
                    reject(error);
                } else {
                    logger(`✅ Audio converted to WAV format for ${testCase.language} at ${OUTPUT_WAV_PATH}`);
                    resolve();
                }
            });
        });

        // Disconnect after the test
        await tts.disconnect();

        return {
            language: testCase.language,
            connectionLatency,
            firstChunkLatency,
            totalChunks: metrics.totalChunks,
            totalDataReceived: metrics.totalBytes,
            averageChunkLatency,
            averageChunkSize,
            totalTestDuration
        };

    } catch (error) {
        logger(`❌ Error during ${testCase.language} test: ${error}`);
        // Ensure disconnection even if there's an error
        await tts.disconnect();
        throw error;
    }
}

function generateMarkdownReport(results) {
    let markdown = `# ElevenLabs TTS Multilingual Test Results\n\n`;
    markdown += `Date: ${new Date().toISOString()}\n\n`;

    results.forEach(result => {
        markdown += `## ${result.language}\n\n`;
        if (result.error) {
            markdown += `Error: ${result.error}\n\n`;
        } else {
            markdown += `- WebSocket Connection Latency: ${result.connectionLatency} ms\n`;
            markdown += `- First Chunk Latency: ${result.firstChunkLatency} ms\n`;
            markdown += `- Total Chunks Received: ${result.totalChunks}\n`;
            markdown += `- Total Data Received: ${result.totalDataReceived} bytes\n`;
            markdown += `- Average Chunk Latency: ${result.averageChunkLatency.toFixed(2)} ms\n`;
            markdown += `- Average Chunk Size: ${result.averageChunkSize.toFixed(2)} bytes\n`;
            markdown += `- Total Test Duration: ${result.totalTestDuration} ms\n\n`;
        }
    });

    return markdown;
}

async function testElevenLabsMultilingual() {
    // Delete specific test files
    deleteSpecificTestFiles();

    const results = [];
    for (const testCase of testCases) {
        try {
            logger(`\n🚀 Starting test for ${testCase.language}`);
            const result = await runTest(testCase);
            results.push(result);
            logger(`✅ ${testCase.language} test completed.`);
        } catch (error) {
            logger(`❌ Error during ${testCase.language} test: ${error}`);
            results.push({
                language: testCase.language,
                error: error.toString()
            });
        }
    }
    logger('\n🏁 All language tests completed.');

    // Generate and save Markdown report with a unique timestamp
    const markdownReport = generateMarkdownReport(results);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(__dirname, `elevenlabs_test_results_${timestamp}.md`);
    fs.writeFileSync(reportPath, markdownReport);
    logger(`📝 Test results saved to ${reportPath}`);

    // Ensure the WebSocket connection is closed
    if (tts.socket) {
        tts.socket.close();
    }

    // Give some time for any pending operations to complete
    setTimeout(() => {
        process.exit(0);
    }, 2000);
}

testElevenLabsMultilingual();