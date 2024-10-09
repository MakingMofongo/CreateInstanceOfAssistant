const path = require('path');
const fs = require('fs');
const http = require('http');
const HttpDispatcher = require('httpdispatcher');
const WebSocketServer = require('websocket').server;
const TranscriptionService = require('./transcription-service');
const ElevenLabsTTS = require('./ElevenLabsTTS');
const { initializeAssistant, createThread, addMessageToThread, createAndPollRun } = require('./LLM');
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

async function initializeServer(assistant_id, port = 8080, LLM) {
    console.log('Initializing assistant');
    await LLM.initializeAssistant(assistant_id);
    console.log('Initializing Eleven Labs TTS');
    elevenLabsTTS = new ElevenLabsTTS(process.env.ELEVENLABS_API_KEY);
        console.log("Server listening on: http://localhost:%s", HTTP_SERVER_PORT);
    
    const server = http.createServer(handleRequest);
    const wsServer = new WebSocketServer({
        httpServer: server,
        autoAcceptConnections: true,
    });

    server.listen(port, function () {
        console.log(`Server listening on: http://localhost:${port}`);
    } catch (err) {
        console.error(err);
    wsServer.on('connect', function (connection) {
        console.log('Media WS: Connection accepted');
        new MediaStreamHandler(connection, elevenLabsTTS, LLM);
    });

    return { server, wsServer };
    res.writeHead(200, {
        'Content-Type': 'text/xml',
        'Content-Length': stat.size,
    });
});

        console.error(err);
    }
}

dispatcher.onPost('/twiml', function (req, res) {
    log('POST TwiML');
        this.chunk = '';
    const filePath = path.join(__dirname + '/templates', 'streams.xml');
    const stat = fs.statSync(filePath);

    async processMessage(message) {
        if (message.type === 'utf8') {
        'Content-Length': stat.size,
                    console.log('Creating new thread');

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
});
                }
            }
    log('Media WS: Connection accepted');
    new MediaStreamHandler(connection, elevenLabsTTS);
            }
            const track = data.media.track;
            if (this.trackHandlers[track] === undefined) {
                const service = new TranscriptionService();
                this.trackHandlers[track] = service;

                // Send initial message
                // const initialMessage = "Hei! Täällä Hilton Edinburgh Carltonin tekoälyvastaanotto, kuinka voin auttaa tänään? ";
        this.threadId = null;
                // const initialMessage = " مرحبًا! هذه هي الاستقبال الذكي في هيلتون إدنبرة كارلتون، كيف يمكنني المساعدة اليوم؟ ";
        this.LLM = LLM;

                await this.elevenLabsTTS.connect();
                this.chunk = initialMessage;

                            // Stream textDelta values from LLM
                            let fullResponse = '';
                            await this.elevenLabsTTS.connect();
                                }
                            });
                        } catch (error) {
                            console.error('Error processing final transcription:', error);
                    }
                });
                this.sendStartResponse();
                if (!this.threadId) {
                    console.log('Creating new thread');
                    this.threadId = await this.LLM.createThread();
                }
            log('Media WS: binary message received (not supported)');
                await this.handleMediaEvent(data);
                this.connection.sendUTF(JSON.stringify(message));
                await this.handleTTSRequest(data);
            this.trackHandlers[track].close();
                // Handle stop event if needed
            }
        }
    }

    sendStartResponse() {
        const response = {
            event: "start",
            start: { status: "ready" }
        };
        this.connection.sendUTF(JSON.stringify(response));
    }
    MediaStreamHandler
    async handleMediaEvent(data) {
        const track = data.media.track;
        if (!this.trackHandlers[track]) {
            const service = new TranscriptionService();
            this.trackHandlers[track] = service;

            service.on('transcription', async (transcription, isFinal) => {
                console.log(`Transcription (${track}): ${transcription}`);
                if (isFinal) {
                    this.sendTranscriptionResponse(transcription);
                    await this.processLLMResponse(transcription);
                }
            });
        }
        this.trackHandlers[track].send(Buffer.from(data.media.payload, 'base64'));
    }

    sendTranscriptionResponse(transcription) {
        const response = {
            event: "transcription",
            transcription: transcription
        };
        this.connection.sendUTF(JSON.stringify(response));
    }

    async processLLMResponse(transcription) {
        try {
            console.log('Adding final transcription:', transcription, 'to thread:', this.threadId);
            await this.LLM.addMessageToThread(this.threadId, transcription);

            let fullResponse = '';
            await this.LLM.createAndPollRun(this.threadId, async (textDelta) => {
                fullResponse += textDelta;
                this.sendLLMResponse(textDelta);
            console.error('Error processing LLM response:', error);
        }
    }

    sendLLMResponse(response) {
        const message = {
            event: "llm_response",
            response: response
        };
        this.connection.sendUTF(JSON.stringify(message));

    async handleTTSRequest(data) {
        try {
            await this.elevenLabsTTS.connect();
            await this.elevenLabsTTS.textToSpeech(data.text, (audioChunk, chunkSno) => {
                this.sendAudioChunk(audioChunk, chunkSno, data.isFinal);
            }, (error) => {
                console.error('Error during TTS:', error);
            }, data.isFinal);
        } catch (error) {
            console.error('Error handling TTS request:', error);
        }
    }

    sendAudioChunk(audioChunk, chunkSno, isFinal) {
        const base64AudioChunk = audioChunk.toString('base64');
        const message = {
            event: "media",
            media: {
                track: "outbound",
                payload: base64AudioChunk,
                chunk: isFinal ? 'end' : chunkSno
            }
        };
        this.connection.sendUTF(JSON.stringify(message));
        console.log('Media WS: closed');
        for (let track of Object.keys(this.trackHandlers)) {
            this.trackHandlers[track].close();
        }
initializeServer(process.env.OPENAI_ASSISTANT_ID);  // Initialize the server with the OPENAI_ASSISTANT_ID from the .env file