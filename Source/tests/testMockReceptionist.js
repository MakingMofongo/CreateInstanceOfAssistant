const assert = require('assert');
const sinon = require('sinon');
const WebSocket = require('ws');
const proxyquire = require('proxyquire');
const TranscriptionService = require('../transcription-service');
const ElevenLabsTTS = require('../ElevenLabsTTS');

// Create mock for LLM.js
const mockLLM = {
    initializeAssistant: sinon.stub().resolves(),
    createThread: sinon.stub().resolves({ id: 'mock-thread-id' }),
    addMessageToThread: sinon.stub().resolves(),
    createAndPollRun: sinon.stub().callsFake(async (thread, onTextDelta) => {
        onTextDelta("This is a mock LLM response.");
        return { status: 'completed', response: "This is a mock LLM response." };
    }),
};

// Create mock for ElevenLabsTTS
const mockElevenLabsTTS = {
    connect: sinon.stub().resolves(),
    textToSpeech: sinon.stub().callsFake((text, onDataCallback, onErrorCallback, isFinal) => {
        onDataCallback(Buffer.from('mock audio data'), 1);
        if (isFinal) {
            onDataCallback(Buffer.from('mock final audio data'), 'end');
        }
    }),
};

// Use proxyquire to inject mockLLM and mockElevenLabsTTS into receptionist.js
const Receptionist = proxyquire('../receptionist', {
    './LLM': mockLLM,
    './ElevenLabsTTS': function() { return mockElevenLabsTTS; },
});

describe('Receptionist Tests', function() {
    let server;
    let wsServer;
    const port = 8081; // Use a fixed port for testing

    before(async function() {
        this.timeout(10000);
        const result = await Receptionist.initializeServer(process.env.OPENAI_ASSISTANT_ID, port, mockLLM);
        server = result.server;
        wsServer = result.wsServer;
    });

    after(function(done) {
        this.timeout(30000);
        if (server) {
            server.close(() => {
                if (wsServer && typeof wsServer.shutDown === 'function') {
                    wsServer.shutDown();
                }
                done();
            });
        } else {
            done();
        }
    });

    beforeEach(function() {
        // Reset mocks before each test
        mockLLM.initializeAssistant.resetHistory();
        mockLLM.createThread.resetHistory();
        mockLLM.addMessageToThread.resetHistory();
        mockLLM.createAndPollRun.resetHistory();
        mockElevenLabsTTS.connect.resetHistory();
        mockElevenLabsTTS.textToSpeech.resetHistory();

        sinon.stub(TranscriptionService.prototype, 'start').resolves();
        sinon.stub(TranscriptionService.prototype, 'send').resolves();
    });

    afterEach(function() {
        sinon.restore();
    });

    it('should handle TwiML requests correctly', function(done) {
        this.timeout(5000);
        const http = require('http');
        http.get(`http://localhost:${port}/twiml`, (res) => {
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.headers['content-type'], 'text/xml');
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                assert(data.includes('<Response>'));
                done();
            });
        });
    });

    it('should handle WebSocket connections', function(done) {
        this.timeout(10000);
        const ws = new WebSocket(`ws://localhost:${port}`);
        let isDone = false;

        ws.on('open', () => {
            ws.send(JSON.stringify({ event: "start", start: { some: "metadata" } }));
            ws.send(JSON.stringify({
                event: "media",
                media: { track: "inbound", payload: Buffer.from("mock audio data").toString('base64') },
                streamSid: "mock-stream-sid"
            }));
        });

        let startReceived = false;
        let mediaReceived = false;
        ws.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.event === "start" && !startReceived) {
                startReceived = true;
                assert.strictEqual(message.start.status, "ready");
            } else if (message.event === "media" && !mediaReceived) {
                mediaReceived = true;
                assert.strictEqual(message.media.status, "received");
                assert.strictEqual(message.streamSid, "mock-stream-sid");
            }
            if (startReceived && mediaReceived && !isDone) {
                isDone = true;
                ws.close();
                done();
            }
        });

        setTimeout(() => {
            if (!isDone) {
                isDone = true;
                ws.close();
                done(new Error('Timeout waiting for WebSocket responses'));
            }
        }, 9000);
    });

    it('should process transcription and generate response', async function() {
        this.timeout(15000);
        const mediaStreamHandler = new Receptionist.MediaStreamHandler(
            { sendUTF: sinon.spy(), on: sinon.spy() },
            mockElevenLabsTTS,
            mockLLM
        );

        // Simulate the start event
        await mediaStreamHandler.processMessage({
            type: 'utf8',
            utf8Data: JSON.stringify({ event: "start", start: { some: "metadata" } })
        });

        await mediaStreamHandler.handleTranscription("Hello, how are you?", true, "en-US");

        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        assert(mockLLM.createThread.calledOnce, 'createThread should have been called once');
        assert(mockLLM.addMessageToThread.calledOnce, 'addMessageToThread should have been called once');
        assert(mockLLM.createAndPollRun.calledOnce, 'createAndPollRun should have been called once');
        assert(mockElevenLabsTTS.textToSpeech.called, 'textToSpeech should have been called at least once');
        assert(mediaStreamHandler.connection.sendUTF.called, 'sendUTF should have been called');
    });

    it('should handle errors gracefully', function(done) {
        this.timeout(5000);
        const erroringTranscriptionService = new TranscriptionService();
        erroringTranscriptionService.send = sinon.stub().throws(new Error('Mock error'));

        const mediaStreamHandler = new Receptionist.MediaStreamHandler({
            sendUTF: sinon.spy(),
            on: sinon.spy()
        }, new ElevenLabsTTS());
        mediaStreamHandler.transcriptionService = erroringTranscriptionService;

        mediaStreamHandler.processMessage({
            type: 'utf8',
            utf8Data: JSON.stringify({
                event: "media",
                media: { track: "inbound", payload: Buffer.from("error audio data").toString('base64') },
                streamSid: "error-stream-sid"
            })
        });

        // The handler should not throw an error
        assert(true);
        done();
    });
});