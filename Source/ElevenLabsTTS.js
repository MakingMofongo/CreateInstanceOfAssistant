// ElevenLabsTTS.js
const WebSocket = require('ws');
require('dotenv').config();

function log(message, ...args) {
    console.log(new Date(), '\x1b[34mELEVENLABS: \x1b[0m', message, ...args);
}

class ElevenLabsTTS {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.voiceId = "21m00Tcm4TlvDq8ikWAM";
        this.model = 'eleven_turbo_v2_5';  // Updated to use Eleven Turbo v2.5 model
        this.wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.model}&output_format=ulaw_8000&optimize_streaming_latency=4`;
        this.socket = null;
        this.isConnected = false;
        this.chunkSno = 0;
        this.onDataCallback = null;
        this.onErrorCallback = null;
        this.cache = new Map();
    }

    async connect() {
        if (this.isConnected) return;

        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.wsUrl);

            this.socket.onopen = () => {
                this.isConnected = true;
                log('WebSocket connected');

                const bosMessage = {
                    "text": " ",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.5,
                        "use_speaker_boost": true
                    },
                    "xi_api_key": this.apiKey,
                };
                this.socket.send(JSON.stringify(bosMessage));

                this.socket.onmessage = this.handleMessage.bind(this);
                resolve();
            };

            this.socket.onerror = (error) => {
                reject(`WebSocket Error: ${error}`);
                if (this.onErrorCallback) this.onErrorCallback(error);
            };

            this.socket.onclose = this.handleClose.bind(this);
        });
    }

    handleMessage(event) {
        if (this.onDataCallback) {
            try {
                const response = JSON.parse(event.data);
                if (response.audio) {
                    this.chunkSno += 1;
                    const audioChunk = Buffer.from(response.audio, 'base64');
                    log('Generated audio chunk SNO:', this.chunkSno, 'isFinal:', response.isFinal);
                    this.onDataCallback(audioChunk, this.chunkSno, !!response.isFinal); // Ensure isFinal is boolean
                }
                if (response.isFinal) {
                    log('Received final message from ElevenLabs');
                    this.onDataCallback(Buffer.alloc(0), this.chunkSno + 1, true);
                    this.resetCallbacks();
                }
            } catch (err) {
                console.error('Error parsing message:', err);
                if (this.onErrorCallback) this.onErrorCallback(err);
            }
        }
    }

    handleClose(event) {
        if (!event.wasClean) {
            console.warn('Connection died');
        }
        this.isConnected = false;
        this.resetCallbacks();
    }

    resetCallbacks() {
        this.onDataCallback = null;
        this.onErrorCallback = null;
    }

    async textToSpeech(text, onDataCallback, onErrorCallback, isLastChunk = false) {
        log('Received text:', text, '\n');
        if (!this.isConnected) {
            return onErrorCallback('WebSocket is not connected');
        }

        this.onDataCallback = onDataCallback;
        this.onErrorCallback = onErrorCallback;

        // Ensure the WebSocket is open before sending
        if (this.socket.readyState === WebSocket.OPEN) {
            const textMessage = {
                "text": text,
                "flush": true,
            };
            this.socket.send(JSON.stringify(textMessage));
            log('Sent text:', text, '\n');

            // Send EOS message immediately after the text if isLastChunk is true
            if (isLastChunk) {
                await this.sendEOSMessage();
            }
        } else {
            // Retry logic if the WebSocket is not open
            const retryInterval = setInterval(() => {
                if (this.socket.readyState === WebSocket.OPEN) {
                    clearInterval(retryInterval);
                    const textMessage = {
                        "text": text,
                        "flush": true,
                    };
                    this.socket.send(JSON.stringify(textMessage));
                    log('Sent text after retry:', text, '\n');
                    if (isLastChunk) {
                        this.sendEOSMessage();
                    }
                }
            }, 100); // Retry every 100ms
        }
    }

    // **Ensure EOS Message is Sent Correctly**
    async sendEOSMessage() {
        log('Sending EOS message');
        const eosMessage = { "text": "" };
        this.socket.send(JSON.stringify(eosMessage));
    }

    async disconnect() {
        if (this.socket && this.isConnected) {
            return new Promise((resolve) => {
                this.socket.onclose = () => {
                    this.isConnected = false;
                    log('WebSocket disconnected');
                    resolve();
                };
                this.socket.close();
            });
        }
    }
}

module.exports = ElevenLabsTTS;