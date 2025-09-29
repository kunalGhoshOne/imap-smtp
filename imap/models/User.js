const crypto = require('crypto');

class User {
    constructor(email, password, fullName = '', quota = 1000000000) {
        this.email = email;
        this.passwordHash = this.hashPassword(password);
        this.fullName = fullName;
        this.quota = quota; // Storage quota in bytes
        this.createdAt = new Date();
        this.lastLogin = null;
        this.mailboxes = new Map();
        this.initializeDefaultMailboxes();
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    verifyPassword(password) {
        const hash = this.hashPassword(password);
        return hash === this.passwordHash;
    }

    initializeDefaultMailboxes() {
        const defaultMailboxes = [
            { name: 'INBOX', separator: '/', attributes: ['\\HasNoChildren'] },
            { name: 'Sent', separator: '/', attributes: ['\\HasNoChildren', '\\Sent'] },
            { name: 'Drafts', separator: '/', attributes: ['\\HasNoChildren', '\\Drafts'] },
            { name: 'Trash', separator: '/', attributes: ['\\HasNoChildren', '\\Trash'] },
            { name: 'Spam', separator: '/', attributes: ['\\HasNoChildren', '\\Junk'] }
        ];

        for (const mailbox of defaultMailboxes) {
            this.mailboxes.set(mailbox.name, {
                name: mailbox.name,
                separator: mailbox.separator,
                attributes: mailbox.attributes,
                messages: new Map(),
                nextUid: 1,
                uidValidity: Date.now(),
                flags: ['\\Seen', '\\Answered', '\\Flagged', '\\Deleted', '\\Draft'],
                permanentFlags: ['\\Seen', '\\Answered', '\\Flagged', '\\Deleted', '\\Draft', '\\*'],
                exists: 0,
                recent: 0,
                unseen: 0
            });
        }
    }

    getMailbox(name) {
        return this.mailboxes.get(name);
    }

    createMailbox(name, separator = '/') {
        if (this.mailboxes.has(name)) {
            return false; // Mailbox already exists
        }

        this.mailboxes.set(name, {
            name: name,
            separator: separator,
            attributes: ['\\HasNoChildren'],
            messages: new Map(),
            nextUid: 1,
            uidValidity: Date.now(),
            flags: ['\\Seen', '\\Answered', '\\Flagged', '\\Deleted', '\\Draft'],
            permanentFlags: ['\\Seen', '\\Answered', '\\Flagged', '\\Deleted', '\\Draft', '\\*'],
            exists: 0,
            recent: 0,
            unseen: 0
        });

        return true;
    }

    deleteMailbox(name) {
        if (name === 'INBOX') {
            return false; // Cannot delete INBOX
        }
        return this.mailboxes.delete(name);
    }

    listMailboxes(reference = '', pattern = '*') {
        const mailboxes = [];
        for (const [name, mailbox] of this.mailboxes) {
            // Simple pattern matching - could be enhanced
            if (pattern === '*' || name.includes(pattern.replace('*', ''))) {
                mailboxes.push({
                    name: name,
                    separator: mailbox.separator,
                    attributes: mailbox.attributes
                });
            }
        }
        return mailboxes;
    }

    updateLastLogin() {
        this.lastLogin = new Date();
    }

    toJSON() {
        return {
            email: this.email,
            fullName: this.fullName,
            quota: this.quota,
            createdAt: this.createdAt,
            lastLogin: this.lastLogin,
            mailboxes: Array.from(this.mailboxes.entries())
        };
    }
}

module.exports = User;