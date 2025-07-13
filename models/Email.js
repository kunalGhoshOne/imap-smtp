const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  content: Buffer,
});

const emailSchema = new mongoose.Schema({
  sender: String,
  recipients: [String],
  subject: String,
  text: String,
  html: String,
  attachments: [attachmentSchema],
  raw: String,
  createdAt: { type: Date, default: Date.now },
  
  // Queue management fields
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'failed', 'failed_permanent'], 
    default: 'pending' 
  },
  retryCount: { type: Number, default: 0 },
  lastAttempt: { type: Date },
  sentAt: { type: Date },
  sendAttempts: [{
    timestamp: { type: Date, default: Date.now },
    success: Boolean,
    response: mongoose.Schema.Types.Mixed,
    error: String
  }],
  finalError: String
});

module.exports = mongoose.model('Email', emailSchema); 