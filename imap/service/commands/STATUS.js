class STATUS {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (args.length < 2) {
            socket.write(`${tag} BAD STATUS requires mailbox name and status items\r\n`);
            return;
        }

        const mailboxName = args[0].replace(/"/g, ''); // Remove quotes
        const statusItems = args[1].replace(/[()]/g, '').split(/\s+/); // Remove parentheses and split

        const mailbox = state.user.getMailbox(mailboxName);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox does not exist\r\n`);
            return;
        }

        const statusValues = [];

        for (const item of statusItems) {
            switch (item.toUpperCase()) {
                case 'MESSAGES':
                    statusValues.push('MESSAGES', mailbox.exists.toString());
                    break;

                case 'RECENT':
                    statusValues.push('RECENT', mailbox.recent.toString());
                    break;

                case 'UIDNEXT':
                    statusValues.push('UIDNEXT', mailbox.nextUid.toString());
                    break;

                case 'UIDVALIDITY':
                    statusValues.push('UIDVALIDITY', mailbox.uidValidity.toString());
                    break;

                case 'UNSEEN':
                    statusValues.push('UNSEEN', mailbox.unseen.toString());
                    break;

                default:
                    // Unknown status item, ignore
                    break;
            }
        }

        socket.write(`* STATUS "${mailboxName}" (${statusValues.join(' ')})\r\n`);
        socket.write(`${tag} OK STATUS completed\r\n`);
    }
}

module.exports = STATUS;