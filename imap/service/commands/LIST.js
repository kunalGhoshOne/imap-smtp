class LIST {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (args.length < 2) {
            socket.write(`${tag} BAD LIST requires reference and pattern\r\n`);
            return;
        }

        const reference = args[0].replace(/"/g, ''); // Remove quotes
        const pattern = args[1].replace(/"/g, ''); // Remove quotes

        // Get all mailboxes for the user
        const mailboxes = state.user.listMailboxes(reference, pattern);

        // Send mailbox list
        for (const mailbox of mailboxes) {
            const attributes = mailbox.attributes.join(' ');
            socket.write(`* LIST (${attributes}) "${mailbox.separator}" "${mailbox.name}"\r\n`);
        }

        socket.write(`${tag} OK LIST completed\r\n`);
    }
}

module.exports = LIST;