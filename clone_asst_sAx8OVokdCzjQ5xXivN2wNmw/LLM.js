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

function createAndPollRun(thread, onTextDelta) {
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
    });

  return run;
}

module.exports = { initializeAssistant, createThread, addMessageToThread, createAndPollRun };
