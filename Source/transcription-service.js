const EventEmitter = require('events');
const Speech = require('@google-cloud/speech');

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.recognizeStream = null;
    this.isListening = false;
    try {
      this.speechClient = new Speech.SpeechClient();
      console.log('Google Speech client initialized successfully');
    } catch (error) {
      console.error('Error initializing Google Speech client:', error);
    }
  }
  
  start(languageCodes = ['en-US', 'fi-FI', 'ar-SA']) {
    if (this.isListening) {
      console.log('Transcription service is already listening');
      return;
    }

    const request = {
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 44100, // Reverted to the original sample rate
        languageCode: languageCodes[0],
        alternativeLanguageCodes: languageCodes.slice(1),
        enableAutomaticPunctuation: true,
        model: 'default',
        useEnhanced: true,
      },
      interimResults: true
    };

    this.recognizeStream = this.speechClient.streamingRecognize(request)
      .on('error', (error) => {
        console.error('Stream error:', error);
        this.emit('error', error);
      })
      .on('data', (data) => {
        console.log('Received data from Google Speech:', data);
        if (data.results && data.results[0] && data.results[0].alternatives && data.results[0].alternatives[0]) {
          const transcription = data.results[0].alternatives[0].transcript;
          const isFinal = data.results[0].isFinal;
          const detectedLanguage = data.results[0].languageCode;
          console.log(`Emitting transcription: ${transcription}, isFinal: ${isFinal}, language: ${detectedLanguage}`);
          this.emit('transcription', transcription, isFinal, detectedLanguage);
        }
      })
      .on('end', () => {
        console.log('Google Speech stream ended');
        this.isListening = false;
        this.emit('streamClosed');
      });

    this.isListening = true;
    console.log('Multilingual transcription service started');
  }

  stop() {
    console.log('Stopping transcription service');
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
    this.isListening = false;
    console.log('Transcription service stopped');
  }

  send(payload) {
    if (!this.isListening) {
      console.log('Transcription service is not listening. Starting now...');
      this.start();
    }

    if (this.recognizeStream) {
      // console.log('Sending audio data to Google Speech, size:', payload.length);
      try {
        this.recognizeStream.write(payload);
      } catch (error) {
        console.error('Error writing to recognize stream:', error);
        this.emit('error', error);
      }
    } else {
      console.error('Recognize stream is not initialized');
      this.emit('error', new Error('Recognize stream is not initialized'));
    }
  }
}

module.exports = TranscriptionService;
