const mongoose = require('mongoose');

const BotSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Hotel', 'Hospital', 'Custom']
  },
  serviceUrl: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assistantId: {
    type: String,
    required: true
  },
  deploymentName: {
    type: String,
    required: true
  },
  credentials: {
    username: String,
    password: String
  },
  configuration: {
    prompt: String,
    additionalInfo: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Bot', BotSchema);
