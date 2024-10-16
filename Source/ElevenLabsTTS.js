const WebSocket = require('ws');
require('dotenv').config();

function log(message, ...args) {
    console.log(new Date(), '\x1b[34mELEVENLABS: \x1b[0m', message, ...args);
}

class ElevenLabsTTS {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.voiceId = "21m00Tcm4TlvDq8ikWAM"; // replace with your voice_id
        this.model = 'eleven_multilingual_v1';
        this.wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.model}&output_format=ulaw_8000&optimize_streaming_latency=3`;
        this.socket = null;
        this.isConnected = false;
        this.chunkSno = 0;
    }

    connect() {
        return new Promise((resolve, reject) => {
            if (this.isConnected) {
                return resolve();
            }

            this.socket = new WebSocket(this.wsUrl);

            this.socket.onopen = () => {
                this.isConnected = true;
                resolve();
            };

            this.socket.onerror = (error) => {
                reject(`WebSocket Error: ${error}`);
            };

            this.socket.onclose = (event) => {
                if (!event.wasClean) {
                    console.warn('Connection died');
                }
                this.isConnected = false;
            };
        });
    }

    textToSpeech(text, onDataCallback, onErrorCallback, isLastChunk = false) {
        log('received text:', text, '\n');
        if (!this.isConnected) {
            return onErrorCallback('WebSocket is not connected');
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
        log('sent text:', text, '\n');
        this.socket.stdin = text;

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
                onDataCallback(audioChunk, this.chunkSno); // Pass chunkSno to the callback
            }

            if (response.isFinal) {
                // Handle final message if needed
            }
        };
    }
}

module.exports = ElevenLabsTTS;
