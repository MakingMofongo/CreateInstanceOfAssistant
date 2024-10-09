const fs = require('fs');
const speech = require('@google-cloud/speech');
const path = require('path');

async function quickstart() {
  const client = new speech.SpeechClient();

  const filename = path.join(__dirname, 'EngTestWav.wav'); // Updated path
  const file = fs.readFileSync(filename);
  const audioBytes = file.toString('base64');

  const audio = {
    content: audioBytes,
  };
  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 44100,
    languageCode: 'en-US',
  };
  const request = {
    audio: audio,
    config: config,
  };

  try {
    const [response] = await client.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
    console.log(`Transcription: ${transcription}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

quickstart();