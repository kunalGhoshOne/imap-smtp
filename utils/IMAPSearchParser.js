const logger = require('./logger');

/**
 * IMAP SEARCH criteria parser
 * Implements RFC 3501 (IMAP4rev1) and RFC 4731 (Enhanced SEARCH)
 */
class IMAPSearchParser {
  constructor() {
    this.pos = 0;
    this.tokens = [];
  }

  /**
   * Parse SEARCH command parameters into MongoDB query
   * @param {Array} parts - Command parts after SEARCH keyword
   * @returns {Object} MongoDB query object
   */
  parse(parts) {
    this.tokens = parts;
    this.pos = 0;

    const query = this.parseSearchKey();
    logger.debug('Parsed SEARCH query', { input: parts.join(' '), query });

    return query;
  }

  parseSearchKey() {
    const conditions = [];

    while (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos].toUpperCase();

      switch (token) {
        case 'ALL':
          this.pos++;
          // Match all messages
          conditions.push({});
          break;

        case 'ANSWERED':
          this.pos++;
          conditions.push({ 'flags.answered': true });
          break;

        case 'UNANSWERED':
          this.pos++;
          conditions.push({ 'flags.answered': { $ne: true } });
          break;

        case 'DELETED':
          this.pos++;
          conditions.push({ 'flags.deleted': true });
          break;

        case 'UNDELETED':
          this.pos++;
          conditions.push({ 'flags.deleted': { $ne: true } });
          break;

        case 'DRAFT':
          this.pos++;
          conditions.push({ 'flags.draft': true });
          break;

        case 'UNDRAFT':
          this.pos++;
          conditions.push({ 'flags.draft': { $ne: true } });
          break;

        case 'FLAGGED':
          this.pos++;
          conditions.push({ 'flags.flagged': true });
          break;

        case 'UNFLAGGED':
          this.pos++;
          conditions.push({ 'flags.flagged': { $ne: true } });
          break;

        case 'SEEN':
          this.pos++;
          conditions.push({ 'flags.seen': true });
          break;

        case 'UNSEEN':
          this.pos++;
          conditions.push({ 'flags.seen': { $ne: true } });
          break;

        case 'NEW':
          this.pos++;
          // NEW = RECENT and UNSEEN
          conditions.push({
            'flags.recent': true,
            'flags.seen': { $ne: true }
          });
          break;

        case 'OLD':
          this.pos++;
          // OLD = NOT RECENT
          conditions.push({ 'flags.recent': { $ne: true } });
          break;

        case 'RECENT':
          this.pos++;
          conditions.push({ 'flags.recent': true });
          break;

        case 'FROM':
          this.pos++;
          const fromValue = this.getString();
          conditions.push({ sender: new RegExp(this.escapeRegex(fromValue), 'i') });
          break;

        case 'TO':
          this.pos++;
          const toValue = this.getString();
          conditions.push({ recipients: new RegExp(this.escapeRegex(toValue), 'i') });
          break;

        case 'CC':
          this.pos++;
          const ccValue = this.getString();
          conditions.push({ cc: new RegExp(this.escapeRegex(ccValue), 'i') });
          break;

        case 'BCC':
          this.pos++;
          const bccValue = this.getString();
          conditions.push({ bcc: new RegExp(this.escapeRegex(bccValue), 'i') });
          break;

        case 'SUBJECT':
          this.pos++;
          const subjectValue = this.getString();
          conditions.push({ subject: new RegExp(this.escapeRegex(subjectValue), 'i') });
          break;

        case 'BODY':
          this.pos++;
          const bodyValue = this.getString();
          conditions.push({
            $or: [
              { text: new RegExp(this.escapeRegex(bodyValue), 'i') },
              { html: new RegExp(this.escapeRegex(bodyValue), 'i') }
            ]
          });
          break;

        case 'TEXT':
          this.pos++;
          const textValue = this.getString();
          // Search in all text fields
          conditions.push({
            $or: [
              { subject: new RegExp(this.escapeRegex(textValue), 'i') },
              { text: new RegExp(this.escapeRegex(textValue), 'i') },
              { html: new RegExp(this.escapeRegex(textValue), 'i') },
              { sender: new RegExp(this.escapeRegex(textValue), 'i') },
              { recipients: new RegExp(this.escapeRegex(textValue), 'i') }
            ]
          });
          break;

        case 'HEADER':
          this.pos++;
          const headerName = this.getString();
          const headerValue = this.getString();
          // Search in raw email headers
          conditions.push({
            raw: new RegExp(`${this.escapeRegex(headerName)}:.*${this.escapeRegex(headerValue)}`, 'i')
          });
          break;

        case 'KEYWORD':
          this.pos++;
          const keyword = this.getString();
          conditions.push({ [`flags.keywords.${keyword}`]: true });
          break;

        case 'UNKEYWORD':
          this.pos++;
          const unkeyword = this.getString();
          conditions.push({ [`flags.keywords.${unkeyword}`]: { $ne: true } });
          break;

        case 'BEFORE':
          this.pos++;
          const beforeDate = this.getDate();
          conditions.push({ internalDate: { $lt: beforeDate } });
          break;

        case 'ON':
          this.pos++;
          const onDate = this.getDate();
          const onDateEnd = new Date(onDate);
          onDateEnd.setDate(onDateEnd.getDate() + 1);
          conditions.push({
            internalDate: {
              $gte: onDate,
              $lt: onDateEnd
            }
          });
          break;

        case 'SINCE':
          this.pos++;
          const sinceDate = this.getDate();
          conditions.push({ internalDate: { $gte: sinceDate } });
          break;

        case 'SENTBEFORE':
          this.pos++;
          const sentBeforeDate = this.getDate();
          conditions.push({ sentAt: { $lt: sentBeforeDate } });
          break;

        case 'SENTON':
          this.pos++;
          const sentOnDate = this.getDate();
          const sentOnDateEnd = new Date(sentOnDate);
          sentOnDateEnd.setDate(sentOnDateEnd.getDate() + 1);
          conditions.push({
            sentAt: {
              $gte: sentOnDate,
              $lt: sentOnDateEnd
            }
          });
          break;

        case 'SENTSINCE':
          this.pos++;
          const sentSinceDate = this.getDate();
          conditions.push({ sentAt: { $gte: sentSinceDate } });
          break;

        case 'LARGER':
          this.pos++;
          const largerSize = parseInt(this.tokens[this.pos++]);
          conditions.push({ 'raw.length': { $gt: largerSize } });
          break;

        case 'SMALLER':
          this.pos++;
          const smallerSize = parseInt(this.tokens[this.pos++]);
          conditions.push({ 'raw.length': { $lt: smallerSize } });
          break;

        case 'UID':
          this.pos++;
          const uidSet = this.getSequenceSet();
          conditions.push({ _id: { $in: uidSet } });
          break;

        case 'NOT':
          this.pos++;
          const notCondition = this.parseSearchKey();
          conditions.push({ $nor: [notCondition] });
          return conditions.length === 1 ? conditions[0] : { $and: conditions };

        case 'OR':
          this.pos++;
          const orCond1 = this.parseSearchKey();
          const orCond2 = this.parseSearchKey();
          conditions.push({ $or: [orCond1, orCond2] });
          return conditions.length === 1 ? conditions[0] : { $and: conditions };

        case '(':
          // Parenthesized search key
          this.pos++;
          const parenConditions = [];
          while (this.pos < this.tokens.length && this.tokens[this.pos] !== ')') {
            parenConditions.push(this.parseSearchKey());
          }
          this.pos++; // Skip closing paren
          conditions.push(parenConditions.length === 1 ? parenConditions[0] : { $and: parenConditions });
          break;

        case ')':
          // End of parenthesized group
          return conditions.length === 1 ? conditions[0] : { $and: conditions };

        default:
          // Sequence set (message numbers)
          if (/^[0-9:,*]+$/.test(token)) {
            const seqSet = this.getSequenceSet();
            // This requires sequence number to UID mapping
            // For now, skip
            this.pos++;
          } else {
            // Unknown search key, skip
            logger.warn('Unknown SEARCH key', { token });
            this.pos++;
          }
      }
    }

    return conditions.length === 0 ? {} :
           conditions.length === 1 ? conditions[0] :
           { $and: conditions };
  }

  getString() {
    let str = this.tokens[this.pos++];

    // Handle quoted strings
    if (str.startsWith('"')) {
      str = str.substring(1);
      while (!str.endsWith('"') && this.pos < this.tokens.length) {
        str += ' ' + this.tokens[this.pos++];
      }
      str = str.substring(0, str.length - 1);
    }

    return str;
  }

  getDate() {
    const dateStr = this.tokens[this.pos++];
    // Parse IMAP date format: dd-Mon-yyyy
    // Example: 1-Feb-1994
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames.indexOf(parts[1]);
      const year = parseInt(parts[2]);

      if (month !== -1) {
        return new Date(year, month, day);
      }
    }

    // Fallback to regular date parsing
    return new Date(dateStr);
  }

  getSequenceSet() {
    const seqStr = this.tokens[this.pos++];
    const sequences = [];

    // Parse sequence set like "1,2,5:8,*"
    const parts = seqStr.split(',');
    for (const part of parts) {
      if (part.includes(':')) {
        const [start, end] = part.split(':');
        const startNum = start === '*' ? Number.MAX_SAFE_INTEGER : parseInt(start);
        const endNum = end === '*' ? Number.MAX_SAFE_INTEGER : parseInt(end);
        for (let i = startNum; i <= endNum && i < 1000000; i++) {
          sequences.push(i);
        }
      } else if (part === '*') {
        sequences.push(Number.MAX_SAFE_INTEGER);
      } else {
        sequences.push(parseInt(part));
      }
    }

    return sequences;
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = IMAPSearchParser;
