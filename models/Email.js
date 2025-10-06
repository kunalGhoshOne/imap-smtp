const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  content: Buffer,
});

const emailSchema = new mongoose.Schema({
  sender: String,
  recipients: [String],
  cc: [String],
  bcc: [String],
  subject: String,
  text: String,
  html: String,
  attachments: [attachmentSchema],
  raw: String,
  authenticatedUsername: String, // Track which mailbox user sent this email

  // IMAP-specific fields
  mailbox: { type: String, default: 'INBOX' },
  internalDate: { type: Date, default: Date.now }, // IMAP INTERNALDATE
  uid: { type: Number }, // Unique ID within mailbox
  modseq: { type: Number, default: 1 }, // Modification sequence for CONDSTORE

  // IMAP flags
  flags: {
    seen: { type: Boolean, default: false },
    answered: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    draft: { type: Boolean, default: false },
    recent: { type: Boolean, default: true },
    keywords: { type: Map, of: Boolean, default: {} }
  },

  // Queue management fields (for outgoing emails)
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
  finalError: String,

  // Email threading fields (RFC 5256)
  messageId: String,
  inReplyTo: String,
  references: [String],

  // References to related records
  successfulEmailId: { type: mongoose.Schema.Types.ObjectId, ref: 'SuccessfulEmail' },
  bouncedEmailId: { type: mongoose.Schema.Types.ObjectId, ref: 'BouncedEmail' },

  createdAt: { type: Date, default: Date.now }
});

// Index for IMAP operations
emailSchema.index({ mailbox: 1, uid: 1 });
emailSchema.index({ mailbox: 1, modseq: 1 });
emailSchema.index({ mailbox: 1, internalDate: 1 });
emailSchema.index({ messageId: 1 });
emailSchema.index({ 'flags.deleted': 1 });

// Pre-save hook to auto-assign UID
emailSchema.pre('save', async function(next) {
  // Only assign UID if it doesn't exist
  if (!this.uid && this.mailbox) {
    try {
      const Email = mongoose.model('Email');
      const maxUidEmail = await Email.findOne({ mailbox: this.mailbox })
        .sort({ uid: -1 })
        .select('uid');

      this.uid = (maxUidEmail?.uid || 0) + 1;
    } catch (error) {
      console.error('Error auto-assigning UID:', error);
    }
  }

  // Ensure internalDate is set
  if (!this.internalDate) {
    this.internalDate = this.createdAt || new Date();
  }

  // Ensure flags object exists
  if (!this.flags) {
    this.flags = {
      seen: false,
      answered: false,
      flagged: false,
      deleted: false,
      draft: false,
      recent: true
    };
  }

  next();
});

module.exports = mongoose.model('Email', emailSchema); 