const path = require('path');
const fs = require('fs');
const http = require('http');
const HttpDispatcher = require('httpdispatcher');
const WebSocketServer = require('websocket').server;
const TranscriptionService = require('./transcription-service');
const ElevenLabsTTS = require('./ElevenLabsTTS');

"use strict";
require('dotenv').config();

const dispatcher = new HttpDispatcher();
const wsserver = http.createServer(handleRequest);

let HTTP_SERVER_PORT = process.env.PORT || 8080;

function log(message, ...args) {
    console.log(new Date(), message, ...args);
}

const mediaws = new WebSocketServer({
    httpServer: wsserver,
    autoAcceptConnections: true,
});

let elevenLabsTTS;
let LLM; // Add this line to declare LLM at the module level

async function initializeServer(assistant_id, port = HTTP_SERVER_PORT, injectedLLM) {
    console.log('Initializing assistant');
    LLM = injectedLLM; // Assign the injected LLM to the module-level LLM
    await LLM.initializeAssistant(assistant_id);
    console.log('Initializing Eleven Labs TTS');
    elevenLabsTTS = new ElevenLabsTTS(process.env.ELEVENLABS_API_KEY);
    console.log('Initializing server');
    HTTP_SERVER_PORT = port;
    
    return new Promise((resolve) => {
        const server = wsserver.listen(port, function () {
            console.log("Server listening on: http://localhost:%s", port);
            resolve({ server: server, wsServer: mediaws });
        });
    });
}

function handleRequest(request, response) {
    try {
        console.log('Received request for:', request.url);
        
        if (request.url === '/twiml' && request.method === 'POST') {
            dispatcher.onPost('/twiml', handleTwiML);
        } else if (request.url === '/twiml' && request.method === 'GET') {
            dispatcher.onGet('/twiml', handleTwiML);
        }
        
        dispatcher.dispatch(request, response);
    } catch (err) {
        console.error('Error handling request:', err);
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end('Internal Server Error');
    }
}

function handleTwiML(req, res) {
    log('TwiML request received');

    const filePath = path.join(__dirname, 'templates', 'streams.xml');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading TwiML file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        } else {
            res.writeHead(200, {
                'Content-Type': 'text/xml',
                'Content-Length': data.length
            });
            res.end(data);
        }
    });
}

mediaws.on('connect', function (connection) {
    console.log('Media WS: Connection accepted');
    new MediaStreamHandler(connection, elevenLabsTTS, LLM);
});

class MediaStreamHandler {
    constructor(connection, elevenLabsTTSInstance, LLM) {
        this.connection = connection;
        this.metaData = null;
        this.trackHandlers = {};
        this.hasSeenMedia = false;
        this.thread = null;
        this.elevenLabsTTS = elevenLabsTTSInstance;
        this.chunk = '';
        this.pendingAudioChunks = [];
        this.chunkSno = 0;
        this.transcriptionService = new TranscriptionService();
        this.transcriptionService.on('transcription', this.handleTranscription.bind(this));
        this.transcriptionService.on('error', this.handleTranscriptionError.bind(this));
        this.transcriptionService.on('streamClosed', this.handleStreamClosed.bind(this));
        this.transcriptionService.start(['en-US', 'fi-FI', 'ar-SA']); // Start with multiple languages
        this.threadCreated = false;
        this.LLM = LLM; // Ensure LLM is properly assigned
        this.audioBuffer = Buffer.alloc(0);  // Initialize audio buffer
        
        connection.on('message', this.processMessage.bind(this));
        connection.on('close', this.close.bind(this));
    }

    async createThread() {
        if (!this.thread && !this.threadCreated) {
            this.threadCreated = true;
            this.thread = await this.LLM.createThread();
            console.log('Created thread:', this.thread.id);
        }
        return this.thread;
    }

    async processMessage(message) {
        console.log('Received message:', message.type);
        if (message.type === 'utf8') {
            const data = JSON.parse(message.utf8Data);
            console.log('Parsed message event:', data.event);
            if (data.event === "start") {
                this.metaData = data.start;
                await this.createThread();
                console.log('Sending start response...');
                this.connection.sendUTF(JSON.stringify({
                    event: "start",
                    start: { status: "ready" }
                }));
                console.log('Start response sent');
            } else if (data.event === "media") {
                const track = data.media.track;
                console.log('Received media for track:', track);
                const audioChunk = Buffer.from(data.media.payload, 'base64');
                this.audioBuffer = Buffer.concat([this.audioBuffer, audioChunk]);
                console.log('Audio buffer size:', this.audioBuffer.length);
                try {
                    this.transcriptionService.send(audioChunk);
                } catch (error) {
                    console.error('Error sending audio to transcription service:', error);
                }
                this.connection.sendUTF(JSON.stringify({
                    event: "media",
                    media: { status: "received" },
                    streamSid: data.streamSid
                }));
            } else if (data.event === "tts_request") {
                const { text, isFinal } = data;
                console.log(`Received TTS Request: Text="${text}", isFinal=${isFinal}`);
                try {
                    await this.sendChunkToTTS(text, isFinal);
                    console.log('TTS Request processed successfully.');
                } catch (error) {
                    console.error('Error processing TTS Request:', error);
                    this.connection.sendUTF(JSON.stringify({
                        event: "error",
                        message: "TTS error: " + error.message
                    }));
                }
            } else if (data.event === "stop") {
                console.log('Received stop event, processing remaining audio');
                this.transcriptionService.stop();
            } else {
                console.warn(`Unhandled event type: ${data.event}`);
            }
        } else if (message.type === 'binary') {
            console.log('Media WS: binary message received (not supported)');
        }
    }

    async sendChunkToTTS(text, isFinal) {
        console.log(`Sending chunk to TTS, length: ${text.length}, isFinal: ${isFinal}`);
        if (text.length > 0) {
            try {
                await this.elevenLabsTTS.connect();
                let chunkCount = 0;
                await new Promise((resolve, reject) => {
                    this.elevenLabsTTS.textToSpeech(text, (audioChunk, chunkSno, isFinalChunk) => {
                        chunkCount++;
                        const base64AudioChunk = audioChunk.toString('base64');
                        const message = {
                            event: "media",
                            streamSid: "mock-stream-sid",
                            media: {
                                track: "outbound",
                                payload: base64AudioChunk,
                                chunk: isFinalChunk ? 'end' : chunkSno
                            },
                        };
                        this.connection.sendUTF(JSON.stringify(message));
                        console.log('Sent TTS audio chunk SNO:', chunkSno, 'isFinal:', isFinalChunk, 'size:', audioChunk.length);
                        if (isFinalChunk) {
                            resolve();
                        }
                    }, reject, isFinal); // Pass isFinal to TTS
                });
                console.log('TTS process completed');
            } catch (error) {
                console.error('Error during TTS:', error);
                this.connection.sendUTF(JSON.stringify({
                    event: "error",
                    message: "TTS error: " + error.message
                }));
            }
        }
    }

    async handleTranscription(transcription, isFinal, detectedLanguage) {
        console.log(`Transcription received: ${transcription}, isFinal: ${isFinal}, language: ${detectedLanguage}`);
        if (isFinal) {
            try {
                const thread = await this.createThread();
                console.log('Adding final transcription to thread:', thread.id);
                await this.LLM.addMessageToThread(thread, transcription);

                // Send transcription event
                this.connection.sendUTF(JSON.stringify({
                    event: "transcription",
                    transcription: transcription,
                    language: detectedLanguage
                }));

                console.log('Creating and polling run for LLM');
                const llmResponse = await this.LLM.createAndPollRun(thread, (textDelta) => {
                    console.log('Received LLM response delta:', textDelta);
                    this.connection.sendUTF(JSON.stringify({
                        event: "llm_response",
                        response: textDelta
                    }));
                });
                console.log('LLM run completed');

                // Generate audio from LLM response
                await this.sendChunkToTTS(llmResponse.response);
            } catch (error) {
                console.error('Error processing final transcription:', error);
                this.connection.sendUTF(JSON.stringify({
                    event: "error",
                    message: error.message
                }));
            }
        }
    }

    handleTranscriptionError(error) {
        console.error('Transcription error:', error);
        // You might want to send an error message to the client here
    }

    handleStreamClosed() {
        console.log('Transcription stream closed');
        // You might want to restart the transcription service here
    }

    async cleanup() {
        console.log('MediaStreamHandler closing');
        if (this.transcriptionService) {
            console.log('Stopping transcription service');
            await this.transcriptionService.stop();
            console.log('Transcription service stopped');
        }
        // We've removed the file deletion code as requested
    }

    close() {
        console.log('MediaStreamHandler closing');
        this.transcriptionService.stop();
        // ... (rest of close method remains the same)
    }
}

const Receptionist = {
    initializeServer,
    handleRequest,
    MediaStreamHandler
};

module.exports = Receptionist;