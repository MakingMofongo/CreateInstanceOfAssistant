const mockOpenAI = {
  beta: {
    assistants: {
      create: async () => ({ id: 'mock-assistant-id' }),
      update: async () => ({})
    },
    vectorStores: {
      create: async () => ({ id: 'mock-vector-store-id' }),
      fileBatches: {
        uploadAndPoll: async () => ({})
      }
    }
  }
};

module.exports = mockOpenAI;
