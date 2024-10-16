const fs = require('fs');
const path = require('path');
const TranscriptionService = require('./transcription-service');

async function testTranscriptionService() {
    const service = new TranscriptionService();
    const audioFilePath = path.join(__dirname, 'FinTestMulaw.wav');
    const audioBuffer = fs.readFileSync(audioFilePath);

    let transcriptionResult = '';
    let isFinalTranscription = false;
    let startTime, endTime;

    // Set up the transcription event listener
    service.on('transcription', (transcription, isFinal) => {
        console.log(`Transcription: ${transcription} (isFinal: ${isFinal})`);
        
        // Only append to the result if the transcription is final
        if (isFinal) {
            transcriptionResult += transcription + ' ';
            isFinalTranscription = true;
            endTime = Date.now();
            const latency = endTime - startTime;
            console.log(`Final transcription received. Latency: ${latency}ms`);
            console.log(`Complete transcription: ${transcriptionResult.trim()}`);
        }
    });

    // Handle stream errors
    service.on('error', (error) => {
        console.error('Stream error:', error);
    });

    // Start timing
    startTime = Date.now();

    console.log('Starting to send audio chunks...');

    // Send audio data in chunks to simulate streaming
    const chunkSize = 1024; // Adjust this value based on your needs
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        const chunk = audioBuffer.slice(i, i + chunkSize);
        try {
            await service.send(chunk);
        } catch (error) {
            console.error('Error sending chunk:', error);
            break;
        }
        
        // Add a small delay between chunks to simulate real-time streaming
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    console.log('Finished sending audio chunks. Waiting for final transcription...');

    // Wait for the final transcription
    await new Promise(resolve => {
        const checkInterval = setInterval(() => {
            if (isFinalTranscription) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });

    console.log('Final transcription received. Closing stream...');

    // Add a delay before closing the stream
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Signal that we're done sending audio
    service.close();

    console.log('Test completed.');
}

testTranscriptionService().catch(console.error);
