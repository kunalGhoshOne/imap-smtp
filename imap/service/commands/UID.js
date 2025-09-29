class UID {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        if (args.length < 1) {
            socket.write(`${tag} BAD UID requires subcommand\r\n`);
            return;
        }

        const subcommand = args[0].toUpperCase();
        const subArgs = args.slice(1);

        try {
            switch (subcommand) {
                case 'FETCH':
                    await this.uidFetch(socket, tag, subArgs, state);
                    break;

                case 'SEARCH':
                    await this.uidSearch(socket, tag, subArgs, state);
                    break;

                case 'STORE':
                    await this.uidStore(socket, tag, subArgs, state);
                    break;

                case 'COPY':
                    await this.uidCopy(socket, tag, subArgs, state);
                    break;

                default:
                    socket.write(`${tag} BAD Unknown UID subcommand: ${subcommand}\r\n`);
                    break;
            }
        } catch (error) {
            console.error('UID command error:', error);
            socket.write(`${tag} BAD UID ${subcommand} failed\r\n`);
        }
    }

    static async uidFetch(socket, tag, args, state) {
        if (args.length < 2) {
            socket.write(`${tag} BAD UID FETCH requires UID set and data items\r\n`);
            return;
        }

        const uidSet = args[0];
        const dataItems = args.slice(1).join(' ').replace(/[()]/g, '').split(/\s+/);

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        const messages = this.parseUIDSet(uidSet, Array.from(mailbox.messages.values()));

        // Use FETCH command logic but with UID responses
        const FETCH = require('./FETCH');
        for (const message of messages) {
            const fetchData = ['UID ' + message.uid];

            for (const item of dataItems) {
                switch (item.toUpperCase()) {
                    case 'FLAGS':
                        fetchData.push(`FLAGS (${message.getFlagsArray().join(' ')})`);
                        break;
                    case 'INTERNALDATE':
                        fetchData.push(`INTERNALDATE "${message.internalDate.toISOString()}"`);
                        break;
                    case 'RFC822.SIZE':
                        fetchData.push(`RFC822.SIZE ${message.size}`);
                        break;
                    case 'ENVELOPE':
                        const env = message.getEnvelope();
                        const envStr = FETCH.formatEnvelope(env);
                        fetchData.push(`ENVELOPE ${envStr}`);
                        break;
                }
            }

            socket.write(`* ${message.sequenceNumber} FETCH (${fetchData.join(' ')})\r\n`);
        }

        socket.write(`${tag} OK UID FETCH completed\r\n`);
    }

    static async uidSearch(socket, tag, args, state) {
        const mailbox = state.user.getMailbox(state.selectedMailbox);
        const messages = Array.from(mailbox.messages.values());

        // Use SEARCH command logic
        const SEARCH = require('./SEARCH');
        const matchingMessages = await SEARCH.searchMessages(messages, args);

        // Return UIDs instead of sequence numbers
        const uids = matchingMessages.map(msg => msg.uid).join(' ');
        socket.write(`* SEARCH ${uids}\r\n`);
        socket.write(`${tag} OK UID SEARCH completed\r\n`);
    }

    static async uidStore(socket, tag, args, state) {
        if (args.length < 3) {
            socket.write(`${tag} BAD UID STORE requires UID set, data item, and value\r\n`);
            return;
        }

        const uidSet = args[0];
        const dataItem = args[1].toUpperCase();
        const value = args.slice(2).join(' ').replace(/[()]/g, '');

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        const messages = this.parseUIDSet(uidSet, Array.from(mailbox.messages.values()));
        const flags = value.split(/\s+/).filter(flag => flag.length > 0);

        for (const message of messages) {
            let silent = false;
            let operation = '';

            if (dataItem.includes('FLAGS.SILENT')) {
                silent = true;
                operation = dataItem.replace('.SILENT', '');
            } else {
                operation = dataItem;
            }

            switch (operation) {
                case 'FLAGS':
                    message.setFlags(flags);
                    break;
                case '+FLAGS':
                    for (const flag of flags) message.addFlag(flag);
                    break;
                case '-FLAGS':
                    for (const flag of flags) message.removeFlag(flag);
                    break;
            }

            if (!silent) {
                const currentFlags = message.getFlagsArray();
                socket.write(`* ${message.sequenceNumber} FETCH (UID ${message.uid} FLAGS (${currentFlags.join(' ')}))\r\n`);
            }
        }

        socket.write(`${tag} OK UID STORE completed\r\n`);
    }

    static async uidCopy(socket, tag, args, state) {
        if (args.length < 2) {
            socket.write(`${tag} BAD UID COPY requires UID set and mailbox name\r\n`);
            return;
        }

        const uidSet = args[0];
        const destMailboxName = args[1].replace(/"/g, '');

        const sourceMailbox = state.user.getMailbox(state.selectedMailbox);
        const destMailbox = state.user.getMailbox(destMailboxName);

        if (!destMailbox) {
            socket.write(`${tag} NO [TRYCREATE] Destination mailbox does not exist\r\n`);
            return;
        }

        const messages = this.parseUIDSet(uidSet, Array.from(sourceMailbox.messages.values()));

        for (const message of messages) {
            const copiedMessage = Object.assign({}, message);
            copiedMessage.uid = destMailbox.nextUid++;
            copiedMessage.sequenceNumber = destMailbox.exists + 1;
            copiedMessage.flags = new Set([...message.flags]);

            destMailbox.messages.set(copiedMessage.uid, copiedMessage);
            destMailbox.exists++;
        }

        socket.write(`${tag} OK UID COPY completed\r\n`);
    }

    static parseUIDSet(uidSet, messages) {
        const result = [];
        const parts = uidSet.split(',');

        for (const part of parts) {
            if (part === '*') {
                // Highest UID
                const maxUid = Math.max(...messages.map(m => m.uid));
                const msg = messages.find(m => m.uid === maxUid);
                if (msg) result.push(msg);
            } else if (part.includes(':')) {
                // UID range
                const [start, end] = part.split(':');
                const startUid = start === '*' ? Math.max(...messages.map(m => m.uid)) : parseInt(start);
                const endUid = end === '*' ? Math.max(...messages.map(m => m.uid)) : parseInt(end);

                for (const message of messages) {
                    if (message.uid >= Math.min(startUid, endUid) && message.uid <= Math.max(startUid, endUid)) {
                        result.push(message);
                    }
                }
            } else {
                // Single UID
                const uid = parseInt(part);
                const msg = messages.find(m => m.uid === uid);
                if (msg) result.push(msg);
            }
        }

        return result;
    }
}

module.exports = UID;