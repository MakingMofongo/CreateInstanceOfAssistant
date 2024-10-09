const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const Receptionist = require('../receptionist');
const LLM = require('../LLM');
const { exec } = require('child_process');

describe('Receptionist Integration Test', function() {
    let server;
    let wsServer;
    const port = 8082; // Use a different port for integration test
    let ws;
    let outputAudioPath;
    const inputAudioPath = path.join(__dirname, 'EngTestWav.wav'); // Add this line

    before(async function() {
        this.timeout(10000);
        console.log('Initializing server...');
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        outputAudioPath = path.join(__dirname, `output_audio_${timestamp}.wav`);
        const result = await Receptionist.initializeServer(process.env.OPENAI_ASSISTANT_ID, port, LLM);
        server = result.server;
        wsServer = result.wsServer;
        console.log('Server initialized');
    });

    after(async function() {
        this.timeout(10000);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        if (wsServer && typeof wsServer.shutDown === 'function') {
            wsServer.shutDown();
        }
    });

    it('should establish a WebSocket connection', async function() {
        this.timeout(5000);
        ws = new WebSocket(`ws://localhost:${port}`);
        await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
        });
        console.log('WebSocket connection established');
        assert(ws.readyState === WebSocket.OPEN, 'WebSocket should be open');
    });

    it('should handle start event', async function() {
        this.timeout(5000);
        console.log('Sending start event...');
        ws.send(JSON.stringify({ event: "start", start: { some: "metadata" } }));
        
        const response = await new Promise(resolve => {
            ws.once('message', (data) => {
                console.log('Received message:', data.toString());
                resolve(JSON.parse(data));
            });
        });

        console.log('Received start response:', response);
        assert.strictEqual(response.event, "start");
        assert.strictEqual(response.start.status, "ready");
    });

    it('should send audio data and receive transcription', async function() {
        this.timeout(10000);  // Increased timeout
        console.log('Reading audio file...');
        const inputAudio = await fs.readFile(inputAudioPath);
        console.log('Sending audio data, size:', inputAudio.length);
        
        // Send audio data in chunks
        const chunkSize = 32000;  // 32 KB chunks
        for (let i = 0; i < inputAudio.length; i += chunkSize) {
            const chunk = inputAudio.slice(i, i + chunkSize);
            ws.send(JSON.stringify({
                event: "media",
                media: { 
                    track: "inbound",
                    payload: chunk.toString('base64'),
                    chunk: Math.floor(i / chunkSize) + 1
                },
                streamSid: "test-stream-sid"
            }));
            await new Promise(resolve => setTimeout(resolve, 100));  // Small delay between chunks
        }

        // Send stop event
        ws.send(JSON.stringify({ event: "stop" }));

        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for transcription')), 25000);
            const messageHandler = (data) => {
                const message = JSON.parse(data);
                console.log('Received message:', message);
                if (message.event === 'transcription') {
                    clearTimeout(timeout);
                    ws.removeListener('message', messageHandler);
                    resolve(message);
                }
            };
            ws.on('message', messageHandler);
        });

        console.log('Received transcription:', response.transcription);
        assert(response.transcription, "Transcription should not be empty");
    });

    it('should process LLM response', async function() {
        this.timeout(10000);  // Increased timeout
        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for LLM response')), 29000);
            const responses = [];
            const messageHandler = (data) => {
                const message = JSON.parse(data);
                console.log('Received message:', message);
                if (message.event === 'llm_response') {
                    responses.push(message.response);
                    if (responses.length === 1) {  // Change this if you expect multiple responses
                        clearTimeout(timeout);
                        ws.removeListener('message', messageHandler);
                        resolve(responses.join(''));
                    }
                }
            };
            ws.on('message', messageHandler);
        });

        console.log('Received LLM response:', response);
        assert(response, "LLM response should not be empty");
    });

    it('should generate audio output', async function() {
        this.timeout(30000);  // Increased timeout
        const audioChunks = [];
        let endChunkReceived = false;

        try {
            // Use a mock LLM response for testing
            const mockLlmResponse = "This is a test response from the LLM. Please generate audio for this text.";

            console.log('Mock LLM Response:', mockLlmResponse);
            assert(mockLlmResponse, "Mock LLM response should not be empty");

            // Split the mock LLM response into chunks
            const textChunks = mockLlmResponse.match(/.{1,100}/g) || [];

            for (let i = 0; i < textChunks.length; i++) {
                const chunk = textChunks[i];
                console.log(`Sending text chunk ${i + 1}/${textChunks.length} to TTS`);

                // Send the text chunk to TTS
                ws.send(JSON.stringify({
                    event: "tts_request",
                    text: chunk,
                    isFinal: i === textChunks.length - 1
                }));

                // Wait for audio chunks
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        console.log('Audio chunks received:', audioChunks.length);
                        if (audioChunks.length > 0) {
                            resolve();
                        } else {
                            reject(new Error('Timeout waiting for audio output'));
                        }
                    }, 10000);

                    const messageHandler = (data) => {
                        const message = JSON.parse(data);
                        if (message.event === 'media' && message.media.track === 'outbound') {
                            const audioChunk = Buffer.from(message.media.payload, 'base64');
                            audioChunks.push(audioChunk);
                            console.log(`Received audio chunk: ${message.media.chunk}, size: ${audioChunk.length} bytes`);

                            if (message.media.chunk === 'end') { // Changed condition
                                clearTimeout(timeout);
                                endChunkReceived = true;
                                resolve();
                            }
                        }
                    };

                    ws.on('message', messageHandler);
                });
            }

            console.log('Total audio chunks received:', audioChunks.length);
            assert(audioChunks.length > 0, "Should have received audio chunks");

            const outputRawAudio = Buffer.concat(audioChunks);
            const rawAudioPath = path.join(__dirname, 'output_audio.raw');
            await fs.writeFile(rawAudioPath, outputRawAudio);
            console.log(`Raw audio saved to: ${rawAudioPath}`);

            // Convert raw audio to WAV using FFmpeg
            await new Promise((resolve, reject) => {
                exec(`ffmpeg -f mulaw -ar 8000 -ac 1 -i "${rawAudioPath}" "${outputAudioPath}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`❌ Error converting audio to WAV: ${error.message}`);
                        console.error(`stderr: ${stderr}`);
                        reject(error);
                    } else {
                        console.log(`✅ Audio converted to WAV format at ${outputAudioPath}`);
                        resolve();
                    }
                });
            });

            const outputStats = await fs.stat(outputAudioPath);
            assert(outputStats.size > 0, 'Output audio file should not be empty');
            console.log(`Output audio file size: ${outputStats.size} bytes`);

            // Add this check to ensure we've received the final chunk
            assert(endChunkReceived, "Should have received the final audio chunk");
        } catch (error) {
            console.error('Error during audio generation:', error);
            throw error; // Re-throw to mark the test as failed
        }
    });

    // After all tests
    after(function() {
        console.log('Tests completed. Output audio file kept for inspection.');
        console.log(`Output audio file location: ${outputAudioPath}`);
    });
});