class FETCH {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        if (args.length < 2) {
            socket.write(`${tag} BAD FETCH requires sequence set and data items\r\n`);
            return;
        }

        const sequenceSet = args[0];
        const dataItems = args.slice(1).join(' ').replace(/[()]/g, '').split(/\s+/);

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox not found\r\n`);
            return;
        }

        try {
            // Parse sequence set (simplified - supports single numbers, ranges, and *)
            const messages = this.parseSequenceSet(sequenceSet, Array.from(mailbox.messages.values()));

            for (const message of messages) {
                const fetchData = [];

                for (const item of dataItems) {
                    switch (item.toUpperCase()) {
                        case 'UID':
                            fetchData.push(`UID ${message.uid}`);
                            break;

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
                            const envStr = this.formatEnvelope(env);
                            fetchData.push(`ENVELOPE ${envStr}`);
                            break;

                        case 'BODY':
                        case 'BODYSTRUCTURE':
                            const bodyStructure = await message.getBodyStructure();
                            const bodyStr = this.formatBodyStructure(bodyStructure);
                            fetchData.push(`${item.toUpperCase()} ${bodyStr}`);
                            break;

                        case 'RFC822':
                        case 'RFC822.TEXT':
                        case 'BODY[]':
                            const emailBody = await message.getEmailBody();
                            const bodySize = Buffer.byteLength(emailBody, 'utf8');
                            fetchData.push(`${item.toUpperCase()} {${bodySize}}\r\n${emailBody}`);
                            break;

                        case 'RFC822.HEADER':
                        case 'BODY[HEADER]':
                            const fullBody = await message.getEmailBody();
                            const headerSection = fullBody.split('\r\n\r\n')[0] + '\r\n\r\n';
                            const headerSize = Buffer.byteLength(headerSection, 'utf8');
                            fetchData.push(`${item.toUpperCase()} {${headerSize}}\r\n${headerSection}`);
                            break;
                    }
                }

                socket.write(`* ${message.sequenceNumber} FETCH (${fetchData.join(' ')})\r\n`);
            }

            socket.write(`${tag} OK FETCH completed\r\n`);

        } catch (error) {
            console.error('FETCH command error:', error);
            socket.write(`${tag} BAD FETCH failed\r\n`);
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

    static formatEnvelope(env) {
        const formatAddressList = (addresses) => {
            if (!addresses || addresses.length === 0) return 'NIL';
            const formatted = addresses.map(addr =>
                `("${addr.name || 'NIL'}" NIL "${addr.address.split('@')[0]}" "${addr.address.split('@')[1]}")`
            ).join('');
            return `(${formatted})`;
        };

        return `("${env.date}" "${env.subject}" ${formatAddressList(env.from)} ${formatAddressList(env.sender)} ${formatAddressList(env.replyTo)} ${formatAddressList(env.to)} ${formatAddressList(env.cc)} ${formatAddressList(env.bcc)} "${env.inReplyTo || 'NIL'}" "${env.messageId}")`;
    }

    static formatBodyStructure(body) {
        return `("${body.type}" "${body.subtype}" ("charset" "${body.parameters.charset}") NIL NIL "${body.encoding}" ${body.size} ${body.lines || 'NIL'})`;
    }
}

module.exports = FETCH;