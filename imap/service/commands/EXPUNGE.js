class EXPUNGE {
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
            socket.write(`${tag} NO Cannot expunge in read-only mailbox\r\n`);
            return;
        }

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox not found\r\n`);
            return;
        }

        try {
            const messages = Array.from(mailbox.messages.values());
            const expungedSequenceNumbers = [];

            // Find messages with \Deleted flag
            for (const message of messages) {
                if (message.hasFlag('\\Deleted')) {
                    expungedSequenceNumbers.push(message.sequenceNumber);
                    mailbox.messages.delete(message.uid);
                    mailbox.exists--;

                    // Clean up email body from GridFS if needed
                    if (message.deleteEmailBody) {
                        await message.deleteEmailBody().catch(err =>
                            console.error('Failed to delete email body:', err)
                        );
                    }
                }
            }

            // Send EXPUNGE responses for each deleted message
            // Note: sequence numbers must be sent in descending order
            expungedSequenceNumbers.sort((a, b) => b - a);
            for (const seqNum of expungedSequenceNumbers) {
                socket.write(`* ${seqNum} EXPUNGE\r\n`);
            }

            // Renumber remaining messages
            const remainingMessages = Array.from(mailbox.messages.values())
                .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

            for (let i = 0; i < remainingMessages.length; i++) {
                remainingMessages[i].sequenceNumber = i + 1;
            }

            socket.write(`${tag} OK EXPUNGE completed\r\n`);

        } catch (error) {
            console.error('EXPUNGE command error:', error);
            socket.write(`${tag} BAD EXPUNGE failed\r\n`);
        }
    }
}

module.exports = EXPUNGE;