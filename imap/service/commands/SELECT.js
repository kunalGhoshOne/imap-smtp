class SELECT {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (args.length < 1) {
            socket.write(`${tag} BAD SELECT requires mailbox name\r\n`);
            return;
        }

        const mailboxName = args[0].replace(/"/g, ''); // Remove quotes
        const mailbox = state.user.getMailbox(mailboxName);

        if (!mailbox) {
            socket.write(`${tag} NO Mailbox does not exist\r\n`);
            return;
        }

        // Set selected mailbox in state
        state.selectedMailbox = mailboxName;
        state.readOnly = false;

        // Send required untagged responses
        socket.write(`* ${mailbox.exists} EXISTS\r\n`);
        socket.write(`* ${mailbox.recent} RECENT\r\n`);
        socket.write(`* OK [UNSEEN ${mailbox.unseen}] First unseen message\r\n`);
        socket.write(`* OK [UIDVALIDITY ${mailbox.uidValidity}] UIDs valid\r\n`);
        socket.write(`* OK [UIDNEXT ${mailbox.nextUid}] Predicted next UID\r\n`);
        socket.write(`* FLAGS (${mailbox.flags.join(' ')})\r\n`);
        socket.write(`* OK [PERMANENTFLAGS (${mailbox.permanentFlags.join(' ')})] Limited\r\n`);

        socket.write(`${tag} OK [READ-WRITE] SELECT completed\r\n`);
    }
}

module.exports = SELECT;