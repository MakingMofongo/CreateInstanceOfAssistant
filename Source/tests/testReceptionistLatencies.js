const assert = require('assert');
const WebSocket = require('ws');
const Receptionist = require('../receptionist');
const fs = require('fs').promises;
const path = require('path');

async function testReceptionistLatencies() {
    const port = 8083; // Use a different port for this test
    let ws;
    const latencies = {};

    // Initialize server
    console.log('Initializing server...');
    const result = await Receptionist.initializeServer(process.env.OPENAI_ASSISTANT_ID, port, require('../LLM'));
    const server = result.server;
    const wsServer = result.wsServer;
    console.log('Server initialized');

    try {
        // Measure WebSocket Connection Latency
        const connectionStartTime = Date.now();
        ws = new WebSocket(`ws://localhost:${port}`);
        await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
        });
        latencies.websocketConnection = Date.now() - connectionStartTime;
        console.log(`WebSocket Connection Latency: ${latencies.websocketConnection} ms`);

        // Ensure WebSocket is open before sending data
        if (ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }

        // Measure Start Event Handling Latency
        const startEventStartTime = Date.now();
        ws.send(JSON.stringify({ event: "start", start: { some: "metadata" } }));
        await new Promise((resolve) => {
            ws.once('message', (data) => {
                const response = JSON.parse(data);
                assert.strictEqual(response.event, "start");
                assert.strictEqual(response.start.status, "ready");
                resolve();
            });
        });
        latencies.startEventHandling = Date.now() - startEventStartTime;
        console.log(`Start Event Handling Latency: ${latencies.startEventHandling} ms`);

        // Measure Audio Data Transmission and Transcription Latency
        const inputAudioPath = path.join(__dirname, 'EngTestWav.wav');
        const inputAudio = await fs.readFile(inputAudioPath);
        const audioTransmissionStartTime = Date.now();
        const chunkSize = 32000; // 32 KB chunks
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
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between chunks
        }
        ws.send(JSON.stringify({ event: "stop" }));

        const transcriptionStartTime = Date.now();
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for transcription')), 25000);
            const messageHandler = (data) => {
                const message = JSON.parse(data);
                if (message.event === 'transcription') {
                    clearTimeout(timeout);
                    ws.removeListener('message', messageHandler);
                    resolve();
                }
            };
            ws.on('message', messageHandler);
        });
        latencies.audioTransmission = Date.now() - audioTransmissionStartTime;
        latencies.transcription = Date.now() - transcriptionStartTime;
        console.log(`Audio Transmission Latency: ${latencies.audioTransmission} ms`);
        console.log(`Transcription Latency: ${latencies.transcription} ms`);

        // Measure LLM Processing Latency
        const llmProcessingStartTime = Date.now();
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for LLM response')), 29000);
            const messageHandler = (data) => {
                const message = JSON.parse(data);
                if (message.event === 'llm_response') {
                    clearTimeout(timeout);
                    ws.removeListener('message', messageHandler);
                    resolve();
                }
            };
            ws.on('message', messageHandler);
        });
        latencies.llmProcessing = Date.now() - llmProcessingStartTime;
        console.log(`LLM Processing Latency: ${latencies.llmProcessing} ms`);

        // Measure TTS Generation Latency
        const ttsGenerationStartTime = Date.now();
        const mockLlmResponse = "This is a test response from the LLM. Please generate audio for this text.";
        const textChunks = mockLlmResponse.match(/.{1,100}/g) || [];
        let firstAudioChunkTime = null;
        for (let i = 0; i < textChunks.length; i++) {
            const chunk = textChunks[i];
            ws.send(JSON.stringify({
                event: "tts_request",
                text: chunk,
                isFinal: i === textChunks.length - 1
            }));
        }
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for TTS output')), 10000);
            const messageHandler = (data) => {
                const message = JSON.parse(data);
                if (message.event === 'media' && message.media.track === 'outbound') {
                    if (!firstAudioChunkTime) {
                        firstAudioChunkTime = Date.now();
                    }
                    if (message.media.chunk === 'end') {
                        clearTimeout(timeout);
                        ws.removeListener('message', messageHandler);
                        resolve();
                    }
                }
            };
            ws.on('message', messageHandler);
        });
        latencies.ttsGeneration = Date.now() - ttsGenerationStartTime;
        console.log(`TTS Generation Latency: ${latencies.ttsGeneration} ms`);

        // Calculate Practical Latency
        if (firstAudioChunkTime) {
            latencies.practicalLatency = firstAudioChunkTime - audioTransmissionStartTime;
            console.log(`Practical Latency (User Speech to First Audio Response): ${latencies.practicalLatency} ms`);
        }

    } catch (error) {
        console.error('Error during latency testing:', error);
    } finally {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        if (wsServer && typeof wsServer.shutDown === 'function') {
            wsServer.shutDown();
        }
    }

    // Generate Latency Report
    console.log('\n--- Receptionist Latency Report ---');
    console.log(`WebSocket Connection Latency: ${latencies.websocketConnection} ms`);
    console.log(`Start Event Handling Latency: ${latencies.startEventHandling} ms`);
    console.log(`Audio Transmission Latency: ${latencies.audioTransmission} ms`);
    console.log(`Transcription Latency: ${latencies.transcription} ms`);
    console.log(`LLM Processing Latency: ${latencies.llmProcessing} ms`);
    console.log(`TTS Generation Latency: ${latencies.ttsGeneration} ms`);
    console.log(`Practical Latency (User Speech to First Audio Response): ${latencies.practicalLatency} ms`);
}

testReceptionistLatencies();