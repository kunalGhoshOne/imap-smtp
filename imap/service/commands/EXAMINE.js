class EXAMINE {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (args.length < 1) {
            socket.write(`${tag} BAD EXAMINE requires mailbox name\r\n`);
            return;
        }

        const mailboxName = args[0].replace(/"/g, ''); // Remove quotes
        const mailbox = state.user.getMailbox(mailboxName);

        if (!mailbox) {
            socket.write(`${tag} NO Mailbox does not exist\r\n`);
            return;
        }

        // Set selected mailbox in state (read-only)
        state.selectedMailbox = mailboxName;
        state.readOnly = true;

        // Send required untagged responses (same as SELECT)
        socket.write(`* ${mailbox.exists} EXISTS\r\n`);
        socket.write(`* ${mailbox.recent} RECENT\r\n`);
        socket.write(`* OK [UNSEEN ${mailbox.unseen}] First unseen message\r\n`);
        socket.write(`* OK [UIDVALIDITY ${mailbox.uidValidity}] UIDs valid\r\n`);
        socket.write(`* OK [UIDNEXT ${mailbox.nextUid}] Predicted next UID\r\n`);
        socket.write(`* FLAGS (${mailbox.flags.join(' ')})\r\n`);
        socket.write(`* OK [PERMANENTFLAGS ()] No permanent flags permitted\r\n`);

        socket.write(`${tag} OK [READ-ONLY] EXAMINE completed\r\n`);
    }
}

module.exports = EXAMINE;