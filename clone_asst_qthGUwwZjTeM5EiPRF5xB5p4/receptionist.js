const path = require('path');
const fs = require('fs');
const http = require('http');
const HttpDispatcher = require('httpdispatcher');
const WebSocketServer = require('websocket').server;
const TranscriptionService = require('./transcription-service');
const ElevenLabsTTS = require('./ElevenLabsTTS');
const { initializeAssistant, createThread, addMessageToThread, createAndPollRun } = require('./LLM');
const process = require('process');
const cors = require('cors');
const url = require('url');
const xml2js = require('xml2js');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

"use strict";
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const dispatcher = new HttpDispatcher();

const HTTP_SERVER_PORT = process.env.PORT || 8080;

function log(message, ...args) {
    console.log(new Date(), message, ...args);
}

const mediaws = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true,
});

let elevenLabsTTS;
let currentLanguages = ["en-US", "fi-FI", "ar-SA"]; // Default languages
let globalTrackHandlers = {};
let connectedAssistantUrl = '';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const DEV_CONSOLE_USERNAME = process.env.DEV_CONSOLE_USERNAME;
const DEV_CONSOLE_PASSWORD = process.env.DEV_CONSOLE_PASSWORD;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());
app.use(cors());

// Authentication middleware
function authenticateToken(req, res, next) {
    const token = req.cookies.token;
    if (token == null) return res.redirect('/login');

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.redirect('/login');
        req.user = user;
        next();
    });
}

async function initializeServer(assistant_id) {
    console.log('Initializing assistant');
    await initializeAssistant(assistant_id);
    console.log('Initializing Eleven Labs TTS');
    elevenLabsTTS = new ElevenLabsTTS(process.env.ELEVENLABS_API_KEY);
    console.log('Initializing server');
    extractUrlFromXml();
    server.listen(HTTP_SERVER_PORT, () => {
        console.log(`Server listening on: http://localhost:${HTTP_SERVER_PORT}`);
        console.log("Server is ready to handle requests");
    });
}

// TwiML handling
app.post('/twiml', (req, res) => {
    log('POST TwiML');
    const filePath = path.join(__dirname, 'templates', 'streams.xml');
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
        'Content-Type': 'text/xml',
        'Content-Length': stat.size,
    });
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
});

// Login routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === DEV_CONSOLE_USERNAME && password === DEV_CONSOLE_PASSWORD) {
        const token = jwt.sign({ username: DEV_CONSOLE_USERNAME }, JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 3600000 }); // 1 hour
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Protected routes
app.get('/language-settings', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'language-settings.html'));
});

app.get('/current-languages', authenticateToken, (req, res) => {
    res.json({ languages: currentLanguages });
});

app.get('/connected-assistant', authenticateToken, (req, res) => {
    res.json({ url: connectedAssistantUrl });
});

app.post('/change-languages', authenticateToken, (req, res) => {
    const { languages } = req.body;
    if (!Array.isArray(languages) || languages.length === 0 || languages.length > 6) {
        return res.status(400).json({ error: 'Invalid languages array. Must contain 1-6 language codes.' });
    }
    
    const testService = new TranscriptionService();
    testService.testLanguageCodes(languages)
        .then(() => {
            Object.values(globalTrackHandlers).forEach(handler => {
                if (handler instanceof TranscriptionService) {
                    handler.setLanguageCodes(languages);
                    handler.forceNewStream(); // Force new stream with updated config
                }
            });
            currentLanguages = languages;
            res.json({ message: 'Languages updated successfully', updatedLanguages: currentLanguages });
        })
        .catch(error => {
            res.status(400).json({ error: 'Invalid language codes', details: error.message });
        })
        .finally(() => {
            testService.close();
        });
});

// WebSocket handling
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
                service.setLanguageCodes(currentLanguages);
                this.trackHandlers[track] = service;
                globalTrackHandlers[track] = service;

                const initialMessage = "Hello! This is the AI reception at Hilton Edinburgh Carlton, how can I help today? ";
                await this.elevenLabsTTS.connect();
                this.chunk = initialMessage;
                this.sendChunkToTTS(track, data.streamSid);

                service.on('transcription', async (transcription, isFinal) => {
                    log(`Transcription (${track}): ${transcription}`);
                    if (isFinal) {
                        try {
                            log('Adding final transcription:', transcription, 'to thread:', this.threadId);
                            await addMessageToThread(this.threadId, transcription);

                            let fullResponse = '';
                            await this.elevenLabsTTS.connect();
                            const run = createAndPollRun(this.threadId, async (textDelta) => {
                                fullResponse += textDelta;
                                this.chunk += textDelta;

                                if (/[.,\/;!?:[\]]/.test(textDelta)) {
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

    async sendChunkToTTS(track, streamSid, isLastChunk = false) {
        if (this.chunk.length > 0) {
            try {
                await this.elevenLabsTTS.textToSpeech(this.chunk, (audioChunk, chunkSno) => {
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
            } catch (error) {
                console.error('Error in sendChunkToTTS:', error);
            }
        }
    }

    close() {
        log('Media WS: closed');
        for (let track of Object.keys(this.trackHandlers)) {
            this.trackHandlers[track].close();
            delete globalTrackHandlers[track];
        }
    }
}

function extractUrlFromXml() {
    const filePath = path.join(__dirname, 'templates', 'streams.xml');
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    xml2js.parseString(xmlContent, (err, result) => {
        if (err) {
            console.error('Error parsing XML:', err);
            return;
        }
        const streamUrl = result.Response.Connect[0].Stream[0].$.url;
        connectedAssistantUrl = new URL(streamUrl).hostname;
        console.log('Extracted Connected Assistant URL:', connectedAssistantUrl);
    });
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

// Initialize the server
initializeServer(process.env.OPENAI_ASSISTANT_ID);

module.exports = {
    initializeServer,
    MediaStreamHandler
};
