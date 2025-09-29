class CHECK {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        // CHECK command performs a checkpoint of the mailbox
        // In a real implementation, this would sync to disk, update indexes, etc.
        const mailbox = state.user.getMailbox(state.selectedMailbox);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox not found\r\n`);
            return;
        }

        try {
            // Simulate checkpoint operations
            // Reset recent count as messages are no longer recent after checkpoint
            mailbox.recent = 0;

            socket.write(`${tag} OK CHECK completed\r\n`);

        } catch (error) {
            console.error('CHECK command error:', error);
            socket.write(`${tag} BAD CHECK failed\r\n`);
        }
    }
}

module.exports = CHECK;