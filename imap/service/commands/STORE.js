class STORE {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        if (state.readOnly) {
            socket.write(`${tag} NO Cannot store flags in read-only mailbox\r\n`);
            return;
        }

        if (args.length < 3) {
            socket.write(`${tag} BAD STORE requires sequence set, data item, and value\r\n`);
            return;
        }

        const sequenceSet = args[0];
        const dataItem = args[1].toUpperCase();
        const value = args.slice(2).join(' ').replace(/[()]/g, '');

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox not found\r\n`);
            return;
        }

        try {
            // Parse sequence set
            const messages = this.parseSequenceSet(sequenceSet, Array.from(mailbox.messages.values()));

            if (messages.length === 0) {
                socket.write(`${tag} OK STORE completed (no messages matched)\r\n`);
                return;
            }

            // Parse flags from value
            const flags = value.split(/\s+/).filter(flag => flag.length > 0);

            for (const message of messages) {
                let silent = false;
                let operation = '';

                // Determine operation type
                if (dataItem.includes('FLAGS.SILENT')) {
                    silent = true;
                    operation = dataItem.replace('.SILENT', '');
                } else {
                    operation = dataItem;
                }

                // Apply operation
                switch (operation) {
                    case 'FLAGS':
                        // Replace all flags
                        message.setFlags(flags);
                        break;

                    case '+FLAGS':
                        // Add flags
                        for (const flag of flags) {
                            message.addFlag(flag);
                        }
                        break;

                    case '-FLAGS':
                        // Remove flags
                        for (const flag of flags) {
                            message.removeFlag(flag);
                        }
                        break;

                    default:
                        socket.write(`${tag} BAD Unknown data item: ${dataItem}\r\n`);
                        return;
                }

                // Send response unless silent
                if (!silent) {
                    const currentFlags = message.getFlagsArray();
                    socket.write(`* ${message.sequenceNumber} FETCH (FLAGS (${currentFlags.join(' ')}))\r\n`);
                }
            }

            socket.write(`${tag} OK STORE completed\r\n`);

        } catch (error) {
            console.error('STORE command error:', error);
            socket.write(`${tag} BAD STORE failed\r\n`);
        }
    }

    static parseSequenceSet(sequenceSet, messages) {
        const result = [];
        const parts = sequenceSet.split(',');

        for (const part of parts) {
            if (part === '*') {
                // Last message
                if (messages.length > 0) {
                    result.push(messages[messages.length - 1]);
                }
            } else if (part.includes(':')) {
                // Range
                const [start, end] = part.split(':');
                const startNum = start === '*' ? messages.length : parseInt(start);
                const endNum = end === '*' ? messages.length : parseInt(end);

                for (let i = Math.min(startNum, endNum); i <= Math.max(startNum, endNum); i++) {
                    const msg = messages.find(m => m.sequenceNumber === i);
                    if (msg) result.push(msg);
                }
            } else {
                // Single number
                const num = parseInt(part);
                const msg = messages.find(m => m.sequenceNumber === num);
                if (msg) result.push(msg);
            }
        }

        return result;
    }
}

module.exports = STORE;