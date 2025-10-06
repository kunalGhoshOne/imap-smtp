const logger = require('./logger');

/**
 * IMAP SORT criteria parser
 * Implements RFC 5256 (SORT and THREAD Extensions)
 */
class IMAPSortParser {
  /**
   * Parse SORT command parameters
   * @param {Array} parts - Command parts: (SORT_KEYS) CHARSET SEARCH_CRITERIA
   * @returns {Object} {sortKeys, charset, searchCriteria}
   */
  parse(parts) {
    let pos = 0;

    // Extract sort keys (inside parentheses)
    const sortKeys = this.parseSortKeys(parts, pos);

    // Find where sort keys end
    let parenDepth = 0;
    let sortKeysEnd = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes('(')) parenDepth++;
      if (parts[i].includes(')')) parenDepth--;
      if (parenDepth === 0) {
        sortKeysEnd = i + 1;
        break;
      }
    }

    // Extract charset
    const charset = parts[sortKeysEnd] || 'UTF-8';

    // Extract search criteria (rest of the parts)
    const searchCriteria = parts.slice(sortKeysEnd + 1);

    logger.debug('Parsed SORT command', { sortKeys, charset, searchCriteria });

    return {
      sortKeys,
      charset,
      searchCriteria
    };
  }

  /**
   * Parse sort keys from parenthesized list
   * Example: (REVERSE DATE FROM)
   */
  parseSortKeys(parts, startPos) {
    const keys = [];
    let str = parts.slice(startPos).join(' ');

    // Remove parentheses
    str = str.replace(/[()]/g, '');

    // Split into individual sort keys
    const tokens = str.trim().split(/\s+/);

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i].toUpperCase();

      if (token === 'REVERSE') {
        // Next token is the actual sort key to reverse
        i++;
        if (i < tokens.length) {
          keys.push({
            key: tokens[i].toUpperCase(),
            reverse: true
          });
        }
      } else if (this.isValidSortKey(token)) {
        keys.push({
          key: token,
          reverse: false
        });
      } else if (token === 'UTF-8' || token === 'US-ASCII') {
        // This is the charset, not a sort key - stop parsing
        break;
      }
      i++;
    }

    return keys;
  }

  /**
   * Check if token is a valid SORT key
   */
  isValidSortKey(token) {
    const validKeys = [
      'ARRIVAL',    // Internal date and time of the message
      'CC',         // Cc header
      'DATE',       // Date header
      'FROM',       // From header
      'SIZE',       // Size of the message
      'SUBJECT',    // Subject header
      'TO'          // To header
    ];

    return validKeys.includes(token);
  }

  /**
   * Convert IMAP sort keys to MongoDB sort object
   */
  toMongoSort(sortKeys) {
    const mongoSort = {};

    for (const sortKey of sortKeys) {
      const direction = sortKey.reverse ? -1 : 1;

      switch (sortKey.key) {
        case 'ARRIVAL':
          mongoSort.internalDate = direction;
          break;
        case 'DATE':
          mongoSort.sentAt = direction;
          break;
        case 'FROM':
          mongoSort.sender = direction;
          break;
        case 'TO':
          mongoSort.recipients = direction;
          break;
        case 'CC':
          mongoSort.cc = direction;
          break;
        case 'SUBJECT':
          mongoSort.subject = direction;
          break;
        case 'SIZE':
          mongoSort['raw.length'] = direction;
          break;
      }
    }

    // Default sort by arrival date if no sort keys specified
    if (Object.keys(mongoSort).length === 0) {
      mongoSort.internalDate = -1;
    }

    return mongoSort;
  }
}

module.exports = IMAPSortParser;
