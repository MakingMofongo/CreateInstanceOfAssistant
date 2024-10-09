// LLM.js
const { log } = require('console');
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables.");
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

let assistant = null;
const initialMessage = "Hi! this is the AI receptionist of Hilton Edinburgh Carlton, how may I assist you today?";

async function initializeAssistant(assistant_id) {
  if (!assistant) {
    assistant = await openai.beta.assistants.retrieve(assistant_id);
  }
}

async function createThread() {
  const thread = await openai.beta.threads.create();
  console.log('Created thread:', thread.id);

  await addMessageToThread(thread, initialMessage);

  return thread;
}

async function addMessageToThread(thread, transcription) {
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: transcription
  });
}

async function createAndPollRun(thread, onTextDelta) {
  if (!thread || !thread.id) {
    throw new Error('Invalid thread object');
  }
  log('Creating and polling run for thread:', thread.id);
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
  });

  let fullResponse = '';

  const checkStatus = async () => {
    const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    
    if (runStatus.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data[0];
      if (lastMessage.role === 'assistant') {
        fullResponse = lastMessage.content[0].text.value;
        if (onTextDelta) {
          onTextDelta(fullResponse);
        }
      }
      return { status: 'completed', response: fullResponse };
    } else if (runStatus.status === 'failed') {
      throw new Error('Run failed');
    } else {
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced polling interval
      return checkStatus();
    }
  };

  return checkStatus();
}

module.exports = { initializeAssistant, createThread, addMessageToThread, createAndPollRun };
