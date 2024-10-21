// LLM.js
const { log } = require('console');
const OpenAI = require('openai');
const openai = new OpenAI();

let assistant = null;
const initialMessage = "Hi! this is the AI receptionist of Hilton Edinburgh Carlton, how may I assist you today?";

async function initializeAssistant(assistant_id) {  // Accept assistant_id as a parameter
  if (!assistant) {
    assistant = await openai.beta.assistants.retrieve(assistant_id);  // Use the passed assistant_id
  }
}

async function createThread() {
  const thread = await openai.beta.threads.create();
  console.log('Created thread:', thread.id);

  // Add the initial message to the thread
  await addMessageToThread(thread, initialMessage);

  return thread; // Return the full thread object
}

async function addMessageToThread(thread, transcription) {
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: transcription
  });
}

// Function to execute a run and return a Promise that resolves when the run is complete
function createAndPollRun(thread, onTextDelta) {
  return new Promise((resolve, reject) => {
    log('Creating and polling run for thread:', thread.id);
    const run = openai.beta.threads.runs.stream(thread.id, {
      assistant_id: assistant.id,
    });

    run
      .on('textDelta', (textDelta, snapshot) => {
        if (onTextDelta) {
          onTextDelta(textDelta.value);
        }
      })
      .on('toolCallCreated', (toolCall) => process.stdout.write(`\nassistant > ${toolCall.type}\n\n`))
      .on('toolCallDelta', (toolCallDelta, snapshot) => {
        if (toolCallDelta.type === 'code_interpreter') {
          if (toolCallDelta.code_interpreter.input) {
            process.stdout.write(toolCallDelta.code_interpreter.input);
          }
          if (toolCallDelta.code_interpreter.outputs) {
            process.stdout.write("\noutput >\n");
            toolCallDelta.code_interpreter.outputs.forEach(output => {
              if (output.type === "logs") {
                process.stdout.write(`\n${output.logs}\n`);
              }
            });
          }
        }
      })
      .on('error', (error) => {
        console.error('Run encountered an error:', error);
        reject(error);
      })
      .on('end', () => {
        log('Run completed for thread:', thread.id);
        resolve();
      });
  });
}

// Initialize the queue and processing state
const runQueue = [];
let isRunInProgress = false;

// Function to process the next run in the queue
async function processQueue() {
    if (isRunInProgress) {
        log('ProcessQueue: Run already in progress. Waiting...');
        return;
    }
    if (runQueue.length === 0) {
        log('ProcessQueue: Queue is empty.');
        return;
    }
    isRunInProgress = true;
    const { thread, onTextDelta } = runQueue.shift();
    log(`ProcessQueue: Dequeued run for thread ${thread.id}. Starting run...`);
    try {
        await createAndPollRun(thread, onTextDelta);
        log(`ProcessQueue: Run completed for thread ${thread.id}.`);
    } catch (error) {
        console.error(`ProcessQueue: Error processing run for thread ${thread.id}:`, error);
    }
    isRunInProgress = false;
    processQueue();
}

// Function to enqueue a new run
async function enqueueRun(thread, onTextDelta) {
    runQueue.push({ thread, onTextDelta });
    log(`enqueueRun: Enqueued run for thread ${thread.id}. Queue length: ${runQueue.length}`);
    processQueue();
}

// Export the enqueueRun function instead of createAndPollRun
module.exports = { initializeAssistant, createThread, addMessageToThread, createAndPollRun: enqueueRun };