class COPY {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        if (args.length < 2) {
            socket.write(`${tag} BAD COPY requires sequence set and mailbox name\r\n`);
            return;
        }

        const sequenceSet = args[0];
        const destMailboxName = args[1].replace(/"/g, '');

        const sourceMailbox = state.user.getMailbox(state.selectedMailbox);
        const destMailbox = state.user.getMailbox(destMailboxName);

        if (!sourceMailbox) {
            socket.write(`${tag} NO Source mailbox not found\r\n`);
            return;
        }

        if (!destMailbox) {
            socket.write(`${tag} NO [TRYCREATE] Destination mailbox does not exist\r\n`);
            return;
        }

        try {
            const messages = this.parseSequenceSet(sequenceSet, Array.from(sourceMailbox.messages.values()));

            for (const message of messages) {
                // Create a copy of the message
                const Message = require('../../models/IMAPMessage');
                const copiedMessage = Message.fromJSON(message.toJSON());
                copiedMessage.uid = destMailbox.nextUid++;
                copiedMessage.sequenceNumber = destMailbox.exists + 1;
                copiedMessage.flags = new Set([...message.flags]); // Copy flags

                destMailbox.messages.set(copiedMessage.uid, copiedMessage);
                destMailbox.exists++;
            }

            socket.write(`${tag} OK COPY completed\r\n`);

        } catch (error) {
            console.error('COPY command error:', error);
            socket.write(`${tag} BAD COPY failed\r\n`);
        }
    }

    static parseSequenceSet(sequenceSet, messages) {
        const result = [];
        const parts = sequenceSet.split(',');

        for (const part of parts) {
            if (part === '*') {
                if (messages.length > 0) {
                    result.push(messages[messages.length - 1]);
                }
            } else if (part.includes(':')) {
                const [start, end] = part.split(':');
                const startNum = start === '*' ? messages.length : parseInt(start);
                const endNum = end === '*' ? messages.length : parseInt(end);

                for (let i = Math.min(startNum, endNum); i <= Math.max(startNum, endNum); i++) {
                    const msg = messages.find(m => m.sequenceNumber === i);
                    if (msg) result.push(msg);
                }
            } else {
                const num = parseInt(part);
                const msg = messages.find(m => m.sequenceNumber === num);
                if (msg) result.push(msg);
            }
        }

        return result;
    }
}

module.exports = COPY;