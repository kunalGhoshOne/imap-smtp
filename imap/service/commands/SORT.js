class SORT {
    static async execute(socket, tag, args, state) {
        if (!state.authenticated) {
            socket.write(`${tag} NO Must be authenticated\r\n`);
            return;
        }

        if (!state.selectedMailbox) {
            socket.write(`${tag} NO No mailbox selected\r\n`);
            return;
        }

        if (args.length < 3) {
            socket.write(`${tag} BAD SORT requires sort criteria, charset, and search criteria\r\n`);
            return;
        }

        try {
            // Parse sort criteria (first argument, typically in parentheses)
            const sortCriteriaArg = args[0];
            const charset = args[1];
            const searchCriteria = args.slice(2);

            // Remove parentheses from sort criteria
            const sortCriteria = sortCriteriaArg.replace(/[()]/g, '').split(/\s+/);

            const mailbox = state.user.getMailbox(state.selectedMailbox);
            if (!mailbox) {
                socket.write(`${tag} NO Mailbox not found\r\n`);
                return;
            }

            // Get all messages from mailbox
            const messages = Array.from(mailbox.messages.values());

            // Apply search criteria first (simplified - could be enhanced)
            let filteredMessages = messages;
            if (searchCriteria.length > 0 && !searchCriteria.includes('ALL')) {
                filteredMessages = this.applySearchCriteria(messages, searchCriteria);
            }

            // Sort messages based on criteria
            const sortedMessages = this.sortMessages(filteredMessages, sortCriteria);

            // Return sequence numbers of sorted messages
            const sequenceNumbers = sortedMessages.map(msg => msg.sequenceNumber).join(' ');

            socket.write(`* SORT ${sequenceNumbers}\r\n`);
            socket.write(`${tag} OK SORT completed\r\n`);

        } catch (error) {
            console.error('SORT command error:', error);
            socket.write(`${tag} BAD SORT failed\r\n`);
        }
    }

    static sortMessages(messages, sortCriteria) {
        return messages.sort((a, b) => {
            for (const criterion of sortCriteria) {
                let result = 0;
                let reverse = false;

                // Check for REVERSE modifier
                let sortKey = criterion;
                if (criterion === 'REVERSE') {
                    reverse = true;
                    continue;
                }

                switch (sortKey.toUpperCase()) {
                    case 'ARRIVAL':
                        result = new Date(a.internalDate) - new Date(b.internalDate);
                        break;

                    case 'DATE':
                        // Sort by message date (from headers if available, otherwise internal date)
                        result = new Date(a.internalDate) - new Date(b.internalDate);
                        break;

                    case 'FROM':
                        result = (a.sender || '').localeCompare(b.sender || '');
                        break;

                    case 'SIZE':
                        result = a.size - b.size;
                        break;

                    case 'SUBJECT':
                        // Remove "Re:" and "Fwd:" prefixes for proper sorting
                        const cleanSubjectA = (a.subject || '').replace(/^(Re:|Fwd?:)\s*/i, '').trim();
                        const cleanSubjectB = (b.subject || '').replace(/^(Re:|Fwd?:)\s*/i, '').trim();
                        result = cleanSubjectA.localeCompare(cleanSubjectB);
                        break;

                    case 'TO':
                        const toA = Array.isArray(a.recipients) ? a.recipients[0] || '' : a.recipients || '';
                        const toB = Array.isArray(b.recipients) ? b.recipients[0] || '' : b.recipients || '';
                        result = toA.localeCompare(toB);
                        break;

                    default:
                        // Unknown sort criterion, skip
                        continue;
                }

                if (reverse) {
                    result = -result;
                    reverse = false; // Reset for next criterion
                }

                if (result !== 0) {
                    return result;
                }
            }

            // If all criteria are equal, sort by UID as fallback
            return a.uid - b.uid;
        });
    }

    static applySearchCriteria(messages, criteria) {
        // Simplified search criteria implementation
        // This could be enhanced to support full IMAP SEARCH syntax
        return messages.filter(message => {
            for (let i = 0; i < criteria.length; i++) {
                const criterion = criteria[i].toUpperCase();

                switch (criterion) {
                    case 'UNSEEN':
                        if (message.hasFlag('\\Seen')) return false;
                        break;

                    case 'SEEN':
                        if (!message.hasFlag('\\Seen')) return false;
                        break;

                    case 'FLAGGED':
                        if (!message.hasFlag('\\Flagged')) return false;
                        break;

                    case 'UNFLAGGED':
                        if (message.hasFlag('\\Flagged')) return false;
                        break;

                    case 'DELETED':
                        if (!message.hasFlag('\\Deleted')) return false;
                        break;

                    case 'UNDELETED':
                        if (message.hasFlag('\\Deleted')) return false;
                        break;

                    case 'RECENT':
                        if (!message.hasFlag('\\Recent')) return false;
                        break;

                    case 'OLD':
                        if (message.hasFlag('\\Recent')) return false;
                        break;

                    case 'SUBJECT':
                        // Next argument should be the subject string
                        if (i + 1 < criteria.length) {
                            const searchSubject = criteria[++i].replace(/"/g, '');
                            if (!message.subject || !message.subject.toLowerCase().includes(searchSubject.toLowerCase())) {
                                return false;
                            }
                        }
                        break;

                    case 'FROM':
                        // Next argument should be the from string
                        if (i + 1 < criteria.length) {
                            const searchFrom = criteria[++i].replace(/"/g, '');
                            if (!message.sender || !message.sender.toLowerCase().includes(searchFrom.toLowerCase())) {
                                return false;
                            }
                        }
                        break;
                }
            }

            return true;
        });
    }
}

module.exports = SORT;