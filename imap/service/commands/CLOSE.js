class CLOSE {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox not found\r\n`);
            return;
        }

        try {
            // CLOSE command expunges deleted messages and closes the mailbox
            if (!state.readOnly) {
                const messages = Array.from(mailbox.messages.values());

                // Remove messages with \Deleted flag
                for (const message of messages) {
                    if (message.hasFlag('\\Deleted')) {
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

                // Renumber remaining messages
                const remainingMessages = Array.from(mailbox.messages.values())
                    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

                for (let i = 0; i < remainingMessages.length; i++) {
                    remainingMessages[i].sequenceNumber = i + 1;
                }
            }

            // Close the mailbox
            state.selectedMailbox = null;
            state.readOnly = false;

            socket.write(`${tag} OK CLOSE completed\r\n`);

        } catch (error) {
            console.error('CLOSE command error:', error);
            socket.write(`${tag} BAD CLOSE failed\r\n`);
        }
    }
}

module.exports = CLOSE;