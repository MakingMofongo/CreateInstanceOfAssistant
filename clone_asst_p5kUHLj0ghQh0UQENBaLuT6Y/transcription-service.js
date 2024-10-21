const EventEmitter = require('events');
const { SpeechClient } = require('@google-cloud/speech').v2;

"use strict";
require('dotenv').config();

function logWithTimestamp(message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(timestamp, '\x1b[38;5;208mTRANSCRIPTION: \x1b[0m', message, ...args);
}

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
    this.newStreamNeeded = false;
    this.isCreatingStream = false;
    this.languageCodes = ["en-US", "fi-FI", "ar-SA"]; // Default language codes
    logWithTimestamp('TranscriptionService initialized with project ID:', this.projectId);
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
        logWithTimestamp('Stream is not valid. Skipping payload.');
      }
    } catch (error) {
      logWithTimestamp('Error sending payload:', error);
      throw error; // Rethrow the error to be caught in the test
    }
  }

  close() {
    if (this.recognizeStream) {
      logWithTimestamp('Closing stream');
      this.recognizeStream.destroy();
      this.recognizeStream = null;
      this.isStreamValid = false;
    }
  }

  newStreamRequired() {
    // console.log('Checking if new stream is required');
    const noRecognizeStream = !this.recognizeStream;
    const streamInvalid = !this.isStreamValid;
    const ageExceeded = this.streamAgeExceeded();
    // console.log('No recognize stream:', noRecognizeStream);
    // console.log('Stream invalid:', streamInvalid);
    // console.log('Age exceeded:', ageExceeded);
    return !this.recognizeStream || !this.isStreamValid || this.streamAgeExceeded();

  }

  streamAgeExceeded() {
    if (!this.streamCreatedAt) return true;
    const now = new Date();
    const timeSinceStreamCreated = now - this.streamCreatedAt;
    const isStreamAgeExceeded = timeSinceStreamCreated / 1000 > 300; // Increased to 300 seconds (5 minutes)
    return isStreamAgeExceeded;
  }

  async testLanguageCodes(languages) {
    console.log('TranscriptionService: Testing language codes:', languages);
    const testClient = new SpeechClient();
    
    const recognitionConfig = {
      autoDecodingConfig: {},
      explicitDecodingConfig: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        audioChannelCount: 1,
      },
      languageCodes: languages,
      model: "long"
    };

    const streamingRecognitionConfig = {
      config: recognitionConfig,
      streamingFeatures: {
        interimResults: true,
      }
    };

    const streamingRecognizeRequest = {
      recognizer: `projects/${this.projectId}/locations/global/recognizers/_`,
      streamingConfig: streamingRecognitionConfig,
    };

    try {
      console.log('TranscriptionService: Creating test stream...');
      console.log('TranscriptionService: Test stream config:', JSON.stringify(streamingRecognizeRequest));
      const testStream = testClient._streamingRecognize();
      
      // Initialize the stream
      console.log('TranscriptionService: Initializing test stream...');
      await new Promise((resolve, reject) => {
        testStream.write(streamingRecognizeRequest, (error) => {
          if (error) {
            console.error('TranscriptionService: Error initializing test stream:', error);
            reject(error);
          } else {
            console.log('TranscriptionService: Test stream initialized successfully');
            resolve();
          }
        });
      });

      // Simulate sending some audio data
      const dummyAudioData = Buffer.from('dummy audio data');
      testStream.write({ audio: dummyAudioData });

      // Wait for a short period to allow for potential errors
      await new Promise(resolve => setTimeout(resolve, 1000));

      // If we reach here, the stream was created successfully
      testStream.destroy();
      console.log('TranscriptionService: Language codes validated successfully');
    } catch (error) {
      console.error('TranscriptionService: Error validating language codes:', error);
      throw new Error(`Invalid language codes: ${error.message}`);
    }
  }

  setLanguageCodes(languages) {
    console.log('TranscriptionService: Setting language codes:', languages);
    this.languageCodes = languages;

    if (this.languageCodes.length === 0) {
      console.warn('No languages provided. Defaulting to en-US');
      this.languageCodes = ['en-US'];
    }

    this.newStreamNeeded = true;
    logWithTimestamp('Language codes updated:', this.languageCodes);
  }

  forceNewStream() {
    logWithTimestamp('Forcing new stream with updated config');
    this.close();
    this.newStreamNeeded = true;
    this.getStream().catch(error => {
      console.error('Error creating new stream after forced update:', error);
    });
  }

  async getStream() {
    if (this.isCreatingStream) {
      logWithTimestamp('Stream creation already in progress. Waiting...');
      await this.waitForStreamCreation();
    }

    if (this.newStreamRequired()) {
      logWithTimestamp('New stream required');
      this.isCreatingStream = true;
      try {
        this.close();
        
        const recognitionConfig = {
          autoDecodingConfig: {},
          explicitDecodingConfig: {
            encoding: "MULAW",
            sampleRateHertz: 8000,
            audioChannelCount: 1,
          },
          languageCodes: this.languageCodes, // Use the updated language codes
          model: "long"
        };

        const streamingRecognitionConfig = {
          config: recognitionConfig,
          streamingFeatures: {
            interimResults: true,
          }
        };

        logWithTimestamp('GOOGLE_CLOUD_PROJECT:', this.projectId);
        const streamingRecognizeRequest = {
          recognizer: `projects/${this.projectId}/locations/global/recognizers/_`,
          streamingConfig: streamingRecognitionConfig,
        };

        logWithTimestamp('Creating new stream with config:', JSON.stringify(streamingRecognizeRequest));
        this.streamCreatedAt = new Date();
        this.recognizeStream = this.client
          ._streamingRecognize()
          .on("error", async (error) => {
            logWithTimestamp('Stream error:', error);
            this.isStreamValid = false;
            this.emit('error', error);
            await this.handleStreamError(error);
          })
          .on("data", async (data) => {
            const results = data.results;
            if (!results || results.length === 0) {
              logWithTimestamp('Received data with no valid results');
              return;
            }

            for (const result of results) {
              if (result.alternatives && result.alternatives.length > 0) {
                const transcription = result.alternatives[0].transcript;
                logWithTimestamp(`Emitting transcription: "${transcription}", isFinal: ${result.isFinal}`);
                this.emit('transcription', transcription, result.isFinal);

                // Close and reconnect the stream after a final transcription
                if (result.isFinal) {
                  logWithTimestamp('Final transcription received. Closing and reconnecting stream.');
                  this.close();
                  await this.getStream();
                  break; // Exit the loop after processing the final result
                }
              }
            }
          });

        // Initialize the stream
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
        logWithTimestamp('New stream created and initialized');
        this.reconnectAttempts = 0; // Reset on successful connect
      } catch (error) {
        logWithTimestamp('Error initializing stream:', error);
        this.isStreamValid = false;
        await this.handleStreamError(error);
        throw error;
      } finally {
        this.isCreatingStream = false;
      }
    }

    return this.recognizeStream;
  }

  async waitForStreamCreation() {
    while (this.isCreatingStream) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async handleStreamError(error) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logWithTimestamp('Max reconnect attempts reached. Not reconnecting.');
      return;
    }

    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Exponential backoff
    logWithTimestamp(`Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.getStream();
      logWithTimestamp('Reconnected successfully.');
    } catch (err) {
      logWithTimestamp('Reconnection attempt failed:', err);
      await this.handleStreamError(err); // Recursive with increased attempts
    }
  }
}

module.exports = TranscriptionService;
