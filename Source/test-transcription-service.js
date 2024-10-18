const fs = require('fs');
const path = require('path');
const TranscriptionService = require('./transcription-service');
const chalk = require('chalk');

async function testTranscriptionService() {
    const service = new TranscriptionService();
    const audioFiles = ['FinTestMulaw.wav', 'Arabic2TestMulaw.wav', 'EngTestMulaw.wav'];
    let currentFileIndex = 0;
    let transcriptionResult = '';
    let isFinalTranscription = false;
    let startTime, endTime;
    let lastTranscriptionTime = 0;
    const TRANSCRIPTION_TIMEOUT = 5000; // 5 seconds
    let noResponseCount = 0;
    let totalLatency = 0;
    let successfulTranscriptions = 0;

    // Set up the transcription event listener
    service.on('transcription', (transcription, isFinal) => {
        console.log(`Transcription: ${transcription} (isFinal: ${isFinal})`);
        lastTranscriptionTime = Date.now();
        
        if (isFinal) {
            transcriptionResult += `[${audioFiles[currentFileIndex]}] ${transcription}\n`;
            endTime = Date.now(); 
            const latency = endTime - startTime;
            totalLatency += latency;
            successfulTranscriptions++;
            console.log(`Final transcription received for ${audioFiles[currentFileIndex]}. Latency: ${latency}ms`);
            console.log(`Current complete transcription:\n${transcriptionResult.trim()}`);
            
            currentFileIndex++;
            if (currentFileIndex >= audioFiles.length) {
                isFinalTranscription = true;
            } else {
                startTime = Date.now(); // Reset start time for the next file
            }
        }
    });

    // Handle stream errors
    service.on('error', (error) => {
        console.error('Stream error:', error);
    });

    console.log(chalk.blue('Starting to send audio chunks for all languages...'));

    // Function to send audio data in chunks
    async function sendAudioFile(filePath, retryCount = 0) {
        const audioBuffer = fs.readFileSync(filePath);
        const chunkSize = 1024; // Adjust this value based on your needs
        lastTranscriptionTime = Date.now();
        let noResponseDetected = false;

        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
            const chunk = audioBuffer.slice(i, i + chunkSize);
            try {
                await service.send(chunk);
            } catch (error) {
                console.error('Error sending chunk:', error);
                break;
            }
            
            // Check if we've stopped receiving transcriptions
            if (Date.now() - lastTranscriptionTime > TRANSCRIPTION_TIMEOUT) {
                console.log(chalk.yellow('Transcription timeout. Retrying...'));
                noResponseDetected = true;
                if (retryCount < 3) {
                    return sendAudioFile(filePath, retryCount + 1);
                } else {
                    console.error(chalk.red('Max retry attempts reached. Moving to next file.'));
                    noResponseCount++;
                    return;
                }
            }

            // Add a small delay between chunks to simulate real-time streaming
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Wait for final transcription or timeout
        const waitForFinal = new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (currentFileIndex > audioFiles.indexOf(path.basename(filePath)) || 
                    Date.now() - lastTranscriptionTime > TRANSCRIPTION_TIMEOUT) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });

        await waitForFinal;

        if (Date.now() - lastTranscriptionTime > TRANSCRIPTION_TIMEOUT) {
            console.log(chalk.yellow('Final transcription not received. Counting as no response.'));
            noResponseCount++;
            if (retryCount < 3) {
                console.log(chalk.yellow('Retrying...'));
                await service.close();
                await new Promise(resolve => setTimeout(resolve, 1000));
                return sendAudioFile(filePath, retryCount + 1);
            } else {
                console.error(chalk.red('Max retry attempts reached. Moving to next file.'));
                return;
            }
        }
    }

    // Send all audio files
    for (const audioFile of audioFiles) {
        startTime = Date.now();
        const audioFilePath = path.join(__dirname, audioFile);
        console.log(chalk.blue(`Sending audio file: ${audioFile}`));
        await sendAudioFile(audioFilePath);
        
        console.log(chalk.green(`Finished sending ${audioFile}`));

        // Add a delay before starting the next file
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(chalk.blue('Finished sending all audio files. Waiting for final transcription...'));

    // Wait for the final transcription of all files
    await new Promise(resolve => {
        const checkInterval = setInterval(() => {
            if (isFinalTranscription || Date.now() - lastTranscriptionTime > TRANSCRIPTION_TIMEOUT) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });

    console.log(chalk.green('All transcriptions received. Closing stream...'));

    // Signal that we're done sending audio
    service.close();

    // Calculate test results
    const averageLatency = successfulTranscriptions > 0 ? totalLatency / successfulTranscriptions : 0;
    const successRate = (successfulTranscriptions / audioFiles.length) * 100;

    // Print test results
    console.log(chalk.bold('\n📊 Test Results:'));
    console.log(chalk.bold('===================='));
    console.log(`🎯 Total audio files: ${chalk.cyan(audioFiles.length)}`);
    console.log(`✅ Successful transcriptions: ${chalk.green(successfulTranscriptions)}`);
    console.log(`⚠️  No-response count: ${chalk.yellow(noResponseCount)}`);
    console.log(`⏱️  Average latency: ${chalk.cyan(averageLatency.toFixed(2))} ms`);
    console.log(`📈 Success rate: ${chalk.green(successRate.toFixed(2))}%`);

    // Determine overall test result
    let overallResult;
    if (successRate === 100) {
        overallResult = chalk.green('✨ PASSED ✨');
    } else if (successRate >= 80) {
        overallResult = chalk.yellow('🟨 PARTIALLY PASSED 🟨');
    } else {
        overallResult = chalk.red('❌ FAILED ❌');
    }

    console.log(chalk.bold(`\n🏁 Overall Test Result: ${overallResult}`));

    console.log(chalk.bold('\n📝 Final Transcriptions:'));
    console.log(chalk.cyan(transcriptionResult.trim()));
}

testTranscriptionService().catch(console.error);
