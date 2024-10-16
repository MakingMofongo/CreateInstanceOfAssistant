const path = require('path');
const fs = require('fs');
const http = require('http');
const HttpDispatcher = require('httpdispatcher');
const WebSocketServer = require('websocket').server;
const TranscriptionService = require('./transcription-service');
const ElevenLabsTTS = require('./ElevenLabsTTS');
const { initializeAssistant, createThread, addMessageToThread, createAndPollRun } = require('./LLM');
const process = require('process');

"use strict";
require('dotenv').config();


const dispatcher = new HttpDispatcher();
const wsserver = http.createServer(handleRequest);

const HTTP_SERVER_PORT = 8080;

function log(message, ...args) {
    console.log(new Date(), message, ...args);
}

const mediaws = new WebSocketServer({
    httpServer: wsserver,
    autoAcceptConnections: true,
});

let elevenLabsTTS;

async function initializeServer(assistant_id) {
    console.log('Initializing assistant');
    await initializeAssistant(assistant_id);  // Pass the assistant_id here
    console.log('Initializing Eleven Labs TTS');
    elevenLabsTTS = new ElevenLabsTTS(process.env.ELEVENLABS_API_KEY);
    console.log('Initializing server');
    wsserver.listen(HTTP_SERVER_PORT, function () {
        console.log("Server listening on: http://localhost:%s", HTTP_SERVER_PORT);
    });
}

function handleRequest(request, response) {
    try {
        dispatcher.dispatch(request, response);
    } catch (err) {
        console.error(err);
    }
}

dispatcher.onPost('/twiml', function (req, res) {
    log('POST TwiML');

    const filePath = path.join(__dirname + '/templates', 'streams.xml');
    const stat = fs.statSync(filePath);

    res.writeHead(200, {
        'Content-Type': 'text/xml',
        'Content-Length': stat.size,
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
});

mediaws.on('connect', function (connection) {
    log('Media WS: Connection accepted');
    new MediaStreamHandler(connection, elevenLabsTTS);
});

class MediaStreamHandler {
    constructor(connection, elevenLabsTTSInstance) {
        this.connection = connection;
        this.metaData = null;
        this.trackHandlers = {};
        this.hasSeenMedia = false;
        this.threadId = null;
        this.elevenLabsTTS = elevenLabsTTSInstance;
        this.chunk = '';
        this.pendingAudioChunks = [];
        this.chunkSno = 0;

        connection.on('message', this.processMessage.bind(this));
        connection.on('close', this.close.bind(this));
    }

    async processMessage(message) {
        if (message.type === 'utf8') {
            const data = JSON.parse(message.utf8Data);
            if (data.event === "start") {
                this.metaData = data.start;
                if (!this.threadId) {
                    console.log('Creating new thread');
                    this.threadId = await createThread();
                }
            }
            if (data.event !== "media") {
                return;
            }
            const track = data.media.track;
            if (this.trackHandlers[track] === undefined) {
                const service = new TranscriptionService();
                this.trackHandlers[track] = service;

                // Send initial message
                // const initialMessage = "Hei! Täällä Hilton Edinburgh Carltonin tekoälyvastaanotto, kuinka voin auttaa tänään? ";
                const initialMessage = "Hello! This is the AI reception at Hilton Edinburgh Carlton, how can I help today? ";
                // const initialMessage = " مرحبًا! هذه هي الاستقبال الذكي في هيلتون إدنبرة كارلتون، كيف يمكنني المساعدة اليوم؟ ";

                await this.elevenLabsTTS.connect();
                this.chunk = initialMessage;
                this.sendChunkToTTS(track, data.streamSid);

                service.on('transcription', async (transcription, isFinal) => {
                    log(`Transcription (${track}): ${transcription}`);
                    if (isFinal) {
                        try {
                            log('Adding final transcription:', transcription, 'to thread:', this.threadId);
                            await addMessageToThread(this.threadId, transcription);

                            // Stream textDelta values from LLM
                            let fullResponse = '';
                            await this.elevenLabsTTS.connect();
                            const run = createAndPollRun(this.threadId, async (textDelta) => {
                                fullResponse += textDelta;
                                this.chunk += textDelta;

                                // Check for punctuation to send chunks
                                if (/[.,\/;!?:[\]]/.test(textDelta)) {
                                    // add a single space after punctuation
                                    this.chunk += ' ';
                                    this.sendChunkToTTS(track, data.streamSid);
                                }
                            });

                        } catch (error) {
                            console.error('Error processing final transcription:', error);
                        }
                    }
                });
            }
            this.trackHandlers[track].send(data.media.payload);

            if (!this.hasSeenMedia) {
                this.hasSeenMedia = true;
            }
        } else if (message.type === 'binary') {
            log('Media WS: binary message received (not supported)');
        }
    }

    sendChunkToTTS(track, streamSid, isLastChunk = false) {
        if (this.chunk.length > 0) {
            this.elevenLabsTTS.textToSpeech(this.chunk, (audioChunk, chunkSno) => {
                const base64AudioChunk = audioChunk.toString('base64');
                const message = {
                    event: "media",
                    streamSid: streamSid,
                    media: {
                        track,
                        payload: base64AudioChunk,
                    },
                };
                this.connection.sendUTF(JSON.stringify(message));
                log('Sent TTS audio chunk SNO:', chunkSno, 'to client');
            }, (error) => {
                console.error('Error during TTS:', error);
            }, isLastChunk);
            this.chunk = '';
        }
    }

    close() {
        log('Media WS: closed');

        for (let track of Object.keys(this.trackHandlers)) {
            this.trackHandlers[track].close();
        }

        // Do not close elevenLabsTTS WebSocket here as it should stay open for the server's lifetime
    }
}

const Receptionist = {
    initializeServer,
    handleRequest,
    MediaStreamHandler
};

module.exports = Receptionist;

// {{ Add Global Error Handling }}
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally, implement recovery logic or restart mechanisms here
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
    // Optionally, implement recovery logic or graceful shutdown here
    // process.exit(1); // Uncomment if you choose to exit the process
});

initializeServer(process.env.OPENAI_ASSISTANT_ID);  // Initialize the server with the OPENAI_ASSISTANT_ID from the .env file