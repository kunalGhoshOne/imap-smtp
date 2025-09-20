
const mongoose = require('../config');
const uuid = require('uuid')
const Schema = mongoose.Schema;

const EmailQueue = new Schema({
    uuid: { 
        type: Schema.Types.UUID,
        default: uuid.v4()
    },
    sender: {
        type: Schema.Types.String
    },
    recipients: {
        type: Schema.Types.Array
    },
    subject: {
        type: Schema.Types.String
    },
    status: {
        type: Schema.Types.String,
        default: 'queue'  // queue | processing | delivered | deferred | failed
    },
    emaildata: {
        type: Schema.Types.ObjectId
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

module.exports = mongoose.model('EmailQueue',EmailQueue);