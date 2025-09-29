class SEARCH {
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
            socket.write(`${tag} BAD SEARCH requires search criteria\r\n`);
            return;
        }

        const mailbox = state.user.getMailbox(state.selectedMailbox);
        if (!mailbox) {
            socket.write(`${tag} NO Mailbox not found\r\n`);
            return;
        }

        try {
            const messages = Array.from(mailbox.messages.values());
            const matchingMessages = await this.searchMessages(messages, args);

            // Return sequence numbers of matching messages
            const sequenceNumbers = matchingMessages.map(msg => msg.sequenceNumber).join(' ');
            socket.write(`* SEARCH ${sequenceNumbers}\r\n`);
            socket.write(`${tag} OK SEARCH completed\r\n`);

        } catch (error) {
            console.error('SEARCH command error:', error);
            socket.write(`${tag} BAD SEARCH failed\r\n`);
        }
    }

    static async searchMessages(messages, criteria) {
        const results = [];

        for (const message of messages) {
            if (await this.matchesCriteria(message, criteria)) {
                results.push(message);
            }
        }

        return results;
    }

    static async matchesCriteria(message, criteria) {
        for (let i = 0; i < criteria.length; i++) {
            const criterion = criteria[i].toUpperCase();

            switch (criterion) {
                case 'ALL':
                    // Matches all messages
                    break;

                case 'ANSWERED':
                    if (!message.hasFlag('\\Answered')) return false;
                    break;

                case 'UNANSWERED':
                    if (message.hasFlag('\\Answered')) return false;
                    break;

                case 'DELETED':
                    if (!message.hasFlag('\\Deleted')) return false;
                    break;

                case 'UNDELETED':
                    if (message.hasFlag('\\Deleted')) return false;
                    break;

                case 'DRAFT':
                    if (!message.hasFlag('\\Draft')) return false;
                    break;

                case 'UNDRAFT':
                    if (message.hasFlag('\\Draft')) return false;
                    break;

                case 'FLAGGED':
                    if (!message.hasFlag('\\Flagged')) return false;
                    break;

                case 'UNFLAGGED':
                    if (message.hasFlag('\\Flagged')) return false;
                    break;

                case 'NEW':
                    if (!message.hasFlag('\\Recent') || message.hasFlag('\\Seen')) return false;
                    break;

                case 'OLD':
                    if (message.hasFlag('\\Recent')) return false;
                    break;

                case 'RECENT':
                    if (!message.hasFlag('\\Recent')) return false;
                    break;

                case 'SEEN':
                    if (!message.hasFlag('\\Seen')) return false;
                    break;

                case 'UNSEEN':
                    if (message.hasFlag('\\Seen')) return false;
                    break;

                case 'FROM':
                    if (i + 1 < criteria.length) {
                        const searchFrom = criteria[++i].replace(/"/g, '');
                        if (!message.sender || !message.sender.toLowerCase().includes(searchFrom.toLowerCase())) {
                            return false;
                        }
                    }
                    break;

                case 'TO':
                    if (i + 1 < criteria.length) {
                        const searchTo = criteria[++i].replace(/"/g, '');
                        const recipients = Array.isArray(message.recipients) ? message.recipients : [message.recipients];
                        let found = false;
                        for (const recipient of recipients) {
                            if (recipient && recipient.toLowerCase().includes(searchTo.toLowerCase())) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) return false;
                    }
                    break;

                case 'SUBJECT':
                    if (i + 1 < criteria.length) {
                        const searchSubject = criteria[++i].replace(/"/g, '');
                        if (!message.subject || !message.subject.toLowerCase().includes(searchSubject.toLowerCase())) {
                            return false;
                        }
                    }
                    break;

                case 'BODY':
                    if (i + 1 < criteria.length) {
                        const searchBody = criteria[++i].replace(/"/g, '');
                        try {
                            const emailBody = await message.getEmailBody();
                            if (!emailBody.toLowerCase().includes(searchBody.toLowerCase())) {
                                return false;
                            }
                        } catch (error) {
                            return false;
                        }
                    }
                    break;

                case 'TEXT':
                    if (i + 1 < criteria.length) {
                        const searchText = criteria[++i].replace(/"/g, '');
                        try {
                            const emailBody = await message.getEmailBody();
                            const searchInSubject = message.subject && message.subject.toLowerCase().includes(searchText.toLowerCase());
                            const searchInBody = emailBody.toLowerCase().includes(searchText.toLowerCase());
                            const searchInFrom = message.sender && message.sender.toLowerCase().includes(searchText.toLowerCase());

                            if (!searchInSubject && !searchInBody && !searchInFrom) {
                                return false;
                            }
                        } catch (error) {
                            return false;
                        }
                    }
                    break;

                case 'SINCE':
                    if (i + 1 < criteria.length) {
                        const sinceDate = new Date(criteria[++i]);
                        if (message.internalDate < sinceDate) return false;
                    }
                    break;

                case 'BEFORE':
                    if (i + 1 < criteria.length) {
                        const beforeDate = new Date(criteria[++i]);
                        if (message.internalDate >= beforeDate) return false;
                    }
                    break;

                case 'ON':
                    if (i + 1 < criteria.length) {
                        const onDate = new Date(criteria[++i]);
                        const messageDate = new Date(message.internalDate.toDateString());
                        if (messageDate.getTime() !== onDate.getTime()) return false;
                    }
                    break;

                case 'LARGER':
                    if (i + 1 < criteria.length) {
                        const size = parseInt(criteria[++i]);
                        if (message.size <= size) return false;
                    }
                    break;

                case 'SMALLER':
                    if (i + 1 < criteria.length) {
                        const size = parseInt(criteria[++i]);
                        if (message.size >= size) return false;
                    }
                    break;

                case 'UID':
                    if (i + 1 < criteria.length) {
                        const uidSet = criteria[++i];
                        const uids = this.parseUIDSet(uidSet);
                        if (!uids.includes(message.uid)) return false;
                    }
                    break;

                case 'NOT':
                    // Next criterion should be negated
                    if (i + 1 < criteria.length) {
                        const nextCriterion = criteria[++i];
                        const negatedResult = await this.matchesCriteria(message, [nextCriterion]);
                        if (negatedResult) return false;
                    }
                    break;

                case 'OR':
                    // Next two criteria should be OR'ed
                    if (i + 2 < criteria.length) {
                        const criterion1 = criteria[++i];
                        const criterion2 = criteria[++i];
                        const result1 = await this.matchesCriteria(message, [criterion1]);
                        const result2 = await this.matchesCriteria(message, [criterion2]);
                        if (!result1 && !result2) return false;
                    }
                    break;

                default:
                    // Unknown criterion, ignore
                    break;
            }
        }

        return true;
    }

    static parseUIDSet(uidSet) {
        const uids = [];
        const parts = uidSet.split(',');

        for (const part of parts) {
            if (part.includes(':')) {
                const [start, end] = part.split(':').map(Number);
                for (let uid = start; uid <= end; uid++) {
                    uids.push(uid);
                }
            } else {
                uids.push(Number(part));
            }
        }

        return uids;
    }
}

module.exports = SEARCH;