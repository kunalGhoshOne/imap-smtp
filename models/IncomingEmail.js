const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  content: Buffer,
});

const incomingEmailSchema = new mongoose.Schema({
  sender: String,
  recipients: [String],
  subject: String,
  text: String,
  html: String,
  attachments: [attachmentSchema],
  raw: String,
  
  // Incoming email specific fields
  source: { type: String, enum: ['SMTP', 'IMAP', 'LMTP'], default: 'SMTP' },
  receivedAt: { type: Date, default: Date.now },
  messageId: String,
  headers: mongoose.Schema.Types.Mixed, // Store all email headers
  
  // Processing status
  processed: { type: Boolean, default: false },
  processedAt: { type: Date },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('IncomingEmail', incomingEmailSchema); 