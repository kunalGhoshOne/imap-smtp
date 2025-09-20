const mongoose = require('./config');

class EmailBodyStorage {
    constructor() {
        this.bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'emailbodydata'
        });
    }

    async storeEmailBody(uuid, emailBodyData) {
        return new Promise((resolve, reject) => {
            const uploadStream = this.bucket.openUploadStream(`${uuid}.eml`, {
                metadata: {
                    uuid,
                    uploadDate: Math.floor(Date.now() / 1000),
                    contentType: 'message/rfc822'
                }
            });

            uploadStream.on('finish', () => {
                resolve(uploadStream.id);
            });

            uploadStream.on('error', reject);
            uploadStream.end(emailBodyData);
        });
    }

    async getEmailBody(fileId) {
        return new Promise((resolve, reject) => {
            const downloadStream = this.bucket.openDownloadStream(fileId);
            const chunks = [];

            downloadStream.on('data', chunk => chunks.push(chunk));
            downloadStream.on('end', () => resolve(Buffer.concat(chunks).toString()));
            downloadStream.on('error', reject);
        });
    }

    async deleteEmailBody(fileId) {
        return this.bucket.delete(fileId);
    }

    async getEmailBodyInfo(fileId) {
        const files = await this.bucket.find({ _id: fileId }).toArray();
        return files[0] || null;
    }
}

module.exports = EmailBodyStorage;