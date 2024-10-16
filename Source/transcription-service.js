const EventEmitter = require('events');
const { SpeechClient } = require('@google-cloud/speech').v2;

"use strict";
require('dotenv').config();

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.client = new SpeechClient();
    this.recognizeStream = null;
    this.streamCreatedAt = null;
    this.isStreamValid = false;
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || 'canvas-replica-402316';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    console.log('TranscriptionService initialized with project ID:', this.projectId);
  }
  
  async send(payload) {
    try {
      const stream = await this.getStream();
      if (this.isStreamValid) {
        await new Promise((resolve, reject) => {
          stream.write({ audio: payload }, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } else {
        console.log('Stream is not valid. Skipping payload.');
      }
    } catch (error) {
      console.error('Error sending payload:', error);
      throw error; // Rethrow the error to be caught in the test
    }
  }

  close() {
    if (this.recognizeStream) {
      console.log('Closing stream');
      this.recognizeStream.destroy();
      this.recognizeStream = null;
      this.isStreamValid = false;
    }
  }

  newStreamRequired() {
    return !this.recognizeStream || !this.isStreamValid || this.streamAgeExceeded();
  }

  streamAgeExceeded() {
    if (!this.streamCreatedAt) return true;
    const now = new Date();
    const timeSinceStreamCreated = now - this.streamCreatedAt;
    const isStreamAgeExceeded = timeSinceStreamCreated / 1000 > 300; // Increased to 300 seconds (5 minutes)
    return isStreamAgeExceeded;
  }

  async getStream() {
    if (this.newStreamRequired()) {
      this.close();

      const recognitionConfig = {
        autoDecodingConfig: {},
        explicitDecodingConfig: {
          encoding: "MULAW",
          sampleRateHertz: 8000,
          audioChannelCount: 1,
        },
        languageCodes: ["en-US", "fi-FI", "ar-SA"],
        model: "long"
      };

      const streamingRecognitionConfig = {
        config: recognitionConfig,
        streamingFeatures: {
          interimResults: true,
        }
      };

      console.log('GOOGLE_CLOUD_PROJECT:', this.projectId);
      const streamingRecognizeRequest = {
        recognizer: `projects/${this.projectId}/locations/global/recognizers/_`,
        streamingConfig: streamingRecognitionConfig,
      };

      console.log('Creating new stream with config:', JSON.stringify(streamingRecognizeRequest));
      this.streamCreatedAt = new Date();
      this.recognizeStream = this.client
        ._streamingRecognize()
        .on("error", async (error) => { // Async handler for proper reconnection
          console.error('Stream error:', error);
          this.isStreamValid = false;
          this.emit('error', error);
          await this.handleStreamError(error);
        })
        .on("data", (data) => {
          const result = data.results[0];
          if (result === undefined || result.alternatives[0] === undefined) {
            console.log('Received data with no valid results');
            return;
          }
          const transcription = result.alternatives[0].transcript;
          console.log(`Emitting transcription: "${transcription}", isFinal: ${result.isFinal}`);
          this.emit('transcription', transcription, result.isFinal); // Emit immediately
        });

      // Initialize the stream
      try {
        await new Promise((resolve, reject) => {
          this.recognizeStream.write(streamingRecognizeRequest, (error) => {
            if (error) {
              reject(error);
            } else {
              this.isStreamValid = true;
              resolve();
            }
          });
        });
        console.log('New stream created and initialized');
        this.reconnectAttempts = 0; // Reset on successful connect
      } catch (error) {
        console.error('Error initializing stream:', error);
        this.isStreamValid = false;
        await this.handleStreamError(error);
        throw error;
      }
    }

    return this.recognizeStream;
  }

  async handleStreamError(error) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached. Not reconnecting.');
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Exponential backoff
    console.log(`Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.getStream();
      console.log('Reconnected successfully.');
    } catch (err) {
      console.error('Reconnection attempt failed:', err);
      await this.handleStreamError(err); // Recursive with increased attempts
    }
  }
}

module.exports = TranscriptionService;