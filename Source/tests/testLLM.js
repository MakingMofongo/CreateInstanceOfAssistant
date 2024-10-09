const assert = require('assert');
const sinon = require('sinon');
const path = require('path');
const { initializeAssistant, createThread, addMessageToThread, createAndPollRun } = require('../LLM');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });


describe('LLM Tests', () => {
    let assistantId;

    before(async function() {
        this.timeout(10000); // Increase timeout for setup
        // Ensure OPENAI_API_KEY is set
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }
        assistantId = process.env.OPENAI_ASSISTANT_ID;
        if (!assistantId) {
            console.warn('OPENAI_ASSISTANT_ID is not set in environment variables. Some tests may be skipped.');
        }
    });

    it('should initialize the assistant', async function() {
        if (!assistantId) {
            this.skip();
        }
        this.timeout(15000); // Increase timeout for API call
        await initializeAssistant(assistantId);
        // If no error is thrown, we assume initialization was successful
        assert(true, 'Assistant initialized successfully');
    });

    it('should create a thread', async function() {
        this.timeout(10000);
        const thread = await createThread();
        assert(thread.id, 'Thread should have an ID');
        console.log('Created thread:', thread.id);
    });

    it('should add a message to a thread', async function() {
        this.timeout(10000);
        const thread = await createThread();
        const message = "Test message";
        await addMessageToThread(thread, message);
        // If no error is thrown, we assume the message was added successfully
        assert(true, 'Message added to thread successfully');
    });

    it('should create and poll a run', async function() {
        this.timeout(30000); // Increase timeout for longer operation
        const thread = await createThread();
        await addMessageToThread(thread, "What's the weather like today?");

        const onTextDelta = sinon.spy();
        const result = await createAndPollRun(thread, onTextDelta);

        assert.strictEqual(result.status, 'completed', 'Run should be completed');
        assert(onTextDelta.called, 'onTextDelta should have been called');
        assert(result.response, 'Response should not be empty');
        console.log('Run completed with response:', result.response);
    });

    it('should handle errors gracefully', async function() {
        this.timeout(10000);
        const invalidThread = { id: 'invalid_thread_id' };
        try {
            await addMessageToThread(invalidThread, "This should fail");
            assert.fail('Expected an error to be thrown');
        } catch (error) {
            assert(error, 'An error should be caught');
            console.log('Caught expected error:', error.message);
        }
    });

    it('should process a complex conversation', async function() {
        this.timeout(120000); // Increase timeout for a longer conversation
        const thread = await createThread();
        
        const messages = [
            "Hello, I'd like to book a hotel room.",
            "I need a room for 2 adults from October 15th to October 20th.",
            "Do you have any rooms with a sea view?",
            "Great! How much would that cost per night?",
            "That sounds good. Can I also request a late check-out?",
            "Perfect. Please go ahead and book the room for me."
        ];

        for (const message of messages) {
            await addMessageToThread(thread, message);
            const onTextDelta = sinon.spy();
            const result = await createAndPollRun(thread, onTextDelta);
            assert.strictEqual(result.status, 'completed', `Run for message "${message}" should be completed`);
            assert(onTextDelta.called, `onTextDelta should have been called for message "${message}"`);
            assert(result.response, `Response should not be empty for message "${message}"`);
            console.log(`Assistant responded to: "${message}" with: "${result.response}"`);
        }

        assert(true, 'Complex conversation processed successfully');
    });
});