const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  content: Buffer,
});

const bouncedEmailSchema = new mongoose.Schema({
  originalEmailId: { type: mongoose.Schema.Types.ObjectId, ref: 'Email' }, // Reference to original email
  sender: String,
  recipients: [String],
  subject: String,
  text: String,
  html: String,
  attachments: [attachmentSchema],
  raw: String,
  authenticatedUsername: String, // Track which mailbox user sent this email
  
  // Bounce specific fields
  bounceType: { 
    type: String, 
    enum: ['hard', 'soft', 'transient', 'permanent'], 
    required: true 
  },
  bounceReason: String,
  bounceCode: String,
  bounceMessage: String,
  bouncedAt: { type: Date, default: Date.now },
  
  // Original email info
  originalSentAt: { type: Date },
  originalStatus: String,
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BouncedEmail', bouncedEmailSchema); 