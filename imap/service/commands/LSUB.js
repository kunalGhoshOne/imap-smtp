class LSUB {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (args.length < 2) {
            socket.write(`${tag} BAD LSUB requires reference and pattern\r\n`);
            return;
        }

        const reference = args[0].replace(/"/g, ''); // Remove quotes
        const pattern = args[1].replace(/"/g, ''); // Remove quotes

        // For simplicity, assume all mailboxes are subscribed
        // In a real implementation, you'd track subscriptions separately
        const mailboxes = state.user.listMailboxes(reference, pattern);

        // Send subscribed mailbox list
        for (const mailbox of mailboxes) {
            const attributes = mailbox.attributes.join(' ');
            socket.write(`* LSUB (${attributes}) "${mailbox.separator}" "${mailbox.name}"\r\n`);
        }

        socket.write(`${tag} OK LSUB completed\r\n`);
    }
}

module.exports = LSUB;