class APPEND {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (args.length < 2) {
            socket.write(`${tag} BAD APPEND requires mailbox name and message literal\r\n`);
            return;
        }

        const mailboxName = args[0].replace(/"/g, '');
        const mailbox = state.user.getMailbox(mailboxName);

        if (!mailbox) {
            socket.write(`${tag} NO [TRYCREATE] Mailbox does not exist\r\n`);
            return;
        }

        try {
            // Parse flags (optional)
            let flags = [];
            let messageStart = 1;

            if (args[1].startsWith('(') && args[1].endsWith(')')) {
                flags = args[1].slice(1, -1).split(/\s+/);
                messageStart = 2;
            }

            // Parse date (optional)
            let internalDate = new Date();
            if (messageStart < args.length && args[messageStart].startsWith('"')) {
                // Date provided
                internalDate = new Date(args[messageStart].replace(/"/g, ''));
                messageStart++;
            }

            // Parse message size literal
            if (messageStart >= args.length) {
                socket.write(`${tag} BAD Missing message literal\r\n`);
                return;
            }

            const literalArg = args[messageStart];
            if (!literalArg.startsWith('{') || !literalArg.endsWith('}')) {
                socket.write(`${tag} BAD Invalid literal format\r\n`);
                return;
            }

            const messageSize = parseInt(literalArg.slice(1, -1));
            if (isNaN(messageSize)) {
                socket.write(`${tag} BAD Invalid message size\r\n`);
                return;
            }

            // Send continuation response
            socket.write('+ Ready for literal data\r\n');

            // TODO: In a real implementation, you would read the literal data from the socket
            // For now, create a simple message
            const emailBody = `Subject: Appended Message\r\nFrom: user@example.com\r\nTo: ${state.username}\r\nDate: ${internalDate.toUTCString()}\r\n\r\nThis is an appended message.\r\n`;

            // Parse sender and recipients from email body (simplified)
            const headers = emailBody.split('\r\n\r\n')[0];
            const fromMatch = headers.match(/From:\s*(.+)/i);
            const toMatch = headers.match(/To:\s*(.+)/i);
            const subjectMatch = headers.match(/Subject:\s*(.+)/i);

            const sender = fromMatch ? fromMatch[1].trim() : 'unknown@example.com';
            const recipients = toMatch ? [toMatch[1].trim()] : [state.username];
            const subject = subjectMatch ? subjectMatch[1].trim() : 'No Subject';

            // Create new message (using in-memory structure for now)
            const newMessage = {
                uuid: require('uuid').v4(),
                uid: mailbox.nextUid++,
                sequenceNumber: mailbox.exists + 1,
                sender: sender,
                recipients: recipients,
                subject: subject,
                flags: new Set(flags),
                internalDate: internalDate,
                size: Buffer.byteLength(emailBody, 'utf8'),
                _emailBodyData: emailBody,
                created_at: Math.floor(Date.now() / 1000),
                updated_at: Math.floor(Date.now() / 1000),

                // Add required methods
                hasFlag: function(flag) { return this.flags.has(flag); },
                addFlag: function(flag) { this.flags.add(flag); },
                removeFlag: function(flag) { this.flags.delete(flag); },
                getFlagsArray: function() { return Array.from(this.flags); },
                setFlags: function(flags) { this.flags = new Set(flags); },
                getEmailBody: async function() { return this._emailBodyData; },
                getEnvelope: function() {
                    return {
                        date: this.internalDate.toISOString(),
                        subject: this.subject,
                        from: [{ name: null, address: this.sender }],
                        sender: [{ name: null, address: this.sender }],
                        replyTo: [{ name: null, address: this.sender }],
                        to: this.recipients.map(addr => ({ name: null, address: addr })),
                        cc: [],
                        bcc: [],
                        inReplyTo: null,
                        messageId: `<${this.uuid}@imap.server>`
                    };
                }
            };

            mailbox.messages.set(newMessage.uid, newMessage);
            mailbox.exists++;
            mailbox.recent++;

            socket.write(`${tag} OK APPEND completed\r\n`);

        } catch (error) {
            console.error('APPEND command error:', error);
            socket.write(`${tag} BAD APPEND failed\r\n`);
        }
    }
}

module.exports = APPEND;