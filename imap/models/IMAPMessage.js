const mongoose = require('../../database/mongo/config');
const uuid = require('uuid');
const Schema = mongoose.Schema;

const IMAPMessageSchema = new Schema({
    uuid: {
        type: Schema.Types.UUID,
        default: uuid.v4(),
        unique: true
    },
    uid: {
        type: Schema.Types.Number,
        required: true
    },
    sequenceNumber: {
        type: Schema.Types.Number
    },
    mailbox: {
        type: Schema.Types.String,
        required: true
    },
    userEmail: {
        type: Schema.Types.String,
        required: true
    },
    sender: {
        type: Schema.Types.String,
        required: true
    },
    recipients: {
        type: Schema.Types.Array,
        required: true
    },
    subject: {
        type: Schema.Types.String,
        default: ''
    },
    flags: {
        type: [String],
        default: []
    },
    emaildata: {
        type: Schema.Types.ObjectId,
        required: true
    },
    size: {
        type: Schema.Types.Number,
        required: true
    },
    internalDate: {
        type: Date,
        default: Date.now
    },
    created_at: {
        type: Number,
        default: () => Math.floor(Date.now() / 1000)
    },
    updated_at: {
        type: Number,
        default: () => Math.floor(Date.now() / 1000)
    }
});

// Indexes for better performance
IMAPMessageSchema.index({ userEmail: 1, mailbox: 1 });
IMAPMessageSchema.index({ userEmail: 1, mailbox: 1, uid: 1 }, { unique: true });
IMAPMessageSchema.index({ uuid: 1 });
IMAPMessageSchema.index({ flags: 1 });

// Update the updated_at field before saving
IMAPMessageSchema.pre('save', function(next) {
    this.updated_at = Math.floor(Date.now() / 1000);
    next();
});

// Static methods for common operations
IMAPMessageSchema.statics.findByMailbox = function(userEmail, mailbox) {
    return this.find({ userEmail, mailbox }).sort({ uid: 1 });
};

IMAPMessageSchema.statics.findByUID = function(userEmail, mailbox, uid) {
    return this.findOne({ userEmail, mailbox, uid });
};

IMAPMessageSchema.statics.findBySequence = function(userEmail, mailbox, sequenceNumber) {
    return this.findOne({ userEmail, mailbox, sequenceNumber });
};

IMAPMessageSchema.statics.getMailboxStats = function(userEmail, mailbox) {
    return this.aggregate([
        { $match: { userEmail, mailbox } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                recent: { $sum: { $cond: [{ $in: ['\\Recent', '$flags'] }, 1, 0] } },
                unseen: { $sum: { $cond: [{ $not: { $in: ['\\Seen', '$flags'] } }, 1, 0] } }
            }
        }
    ]);
};

IMAPMessageSchema.statics.getNextUID = function(userEmail, mailbox) {
    return this.findOne({ userEmail, mailbox })
        .sort({ uid: -1 })
        .select('uid')
        .then(doc => doc ? doc.uid + 1 : 1);
};

IMAPMessageSchema.statics.searchMessages = function(userEmail, mailbox, criteria) {
    const query = { userEmail, mailbox };

    // Add search criteria
    if (criteria.flags) {
        if (criteria.flags.includes) {
            query.flags = { $in: criteria.flags.includes };
        }
        if (criteria.flags.excludes) {
            query.flags = { $nin: criteria.flags.excludes };
        }
    }

    if (criteria.subject) {
        query.subject = new RegExp(criteria.subject, 'i');
    }

    if (criteria.sender) {
        query.sender = new RegExp(criteria.sender, 'i');
    }

    if (criteria.since) {
        query.internalDate = { $gte: criteria.since };
    }

    if (criteria.before) {
        query.internalDate = { ...query.internalDate, $lt: criteria.before };
    }

    return this.find(query).sort({ uid: 1 });
};

module.exports = mongoose.model('IMAPMessage', IMAPMessageSchema);