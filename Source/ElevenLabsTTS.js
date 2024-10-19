const WebSocket = require('ws');
require('dotenv').config();

function log(message, ...args) {
    console.log(new Date(), '\x1b[34mELEVENLABS: \x1b[0m', message, ...args);
}

class ElevenLabsTTS {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.voiceId = "21m00Tcm4TlvDq8ikWAM"; // replace with your voice_id
        this.model = 'eleven_multilingual_v2';
        this.wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.model}&output_format=ulaw_8000&optimize_streaming_latency=3`;
        this.socket = null;
        this.isConnected = false;
        this.chunkSno = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second delay
    }

    async connect() {
        if (this.isConnected) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.wsUrl);

            this.socket.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                log('WebSocket connected successfully');
                resolve();
            };

            this.socket.onerror = (error) => {
                log(`WebSocket Error: ${error}`);
                this.handleDisconnection(reject);
            };

            this.socket.onclose = (event) => {
                if (!event.wasClean) {
                    log('WebSocket connection closed unexpectedly');
                    this.handleDisconnection(reject);
                } else {
                    this.isConnected = false;
                    log('WebSocket connection closed cleanly');
                }
            };
        });
    }

    async handleDisconnection(reject) {
        this.isConnected = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect().catch(reject), this.reconnectDelay);
            this.reconnectDelay *= 2; // Exponential backoff
        } else {
            log('Max reconnection attempts reached. Please check your connection and try again later.');
            reject('Failed to establish a stable connection');
        }
    }

    async textToSpeech(text, onDataCallback, onErrorCallback, isLastChunk = false) {
        log('Received text:', text);
        
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const bosMessage = {
                "text": " ",
                "flush": true,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.8
                },
                "xi_api_key": this.apiKey,
            };

            this.socket.send(JSON.stringify(bosMessage));

            const textMessage = {
                "text": text,
                "flush": true,
            };

            this.socket.send(JSON.stringify(textMessage));
            log('Sent text:', text);

            if (isLastChunk) {
                log('Last chunk, Sending EOS message');
                const eosMessage = {
                    "text": ""
                };
                this.socket.send(JSON.stringify(eosMessage));
            }

            this.socket.onmessage = (event) => {
                const response = JSON.parse(event.data);

                if (response.audio) {
                    this.chunkSno += 1;
                    const audioChunk = Buffer.from(response.audio, 'base64');
                    log('Generated audio chunk SNO:', this.chunkSno);
                    onDataCallback(audioChunk, this.chunkSno);
                }

                if (response.isFinal) {
                    log('Received final message from ElevenLabs');
                }
            };
        } catch (error) {
            log('Error in textToSpeech:', error);
            onErrorCallback(error.toString());
        }
    }

    close() {
        if (this.socket) {
            this.socket.close();
            this.isConnected = false;
            log('WebSocket connection closed');
        }
    }
}

module.exports = ElevenLabsTTS;
