const mongoose = require('mongoose');

const BotSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['Hotel', 'Hospital', 'Custom']
  },
  assistantId: {
    type: String,
    required: true
  },
  phoneNumber: String,
  serviceUrl: String,
  username: String,
  password: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Bot', BotSchema);
