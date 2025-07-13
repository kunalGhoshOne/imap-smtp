const Email = require('../../models/Email');
const logger = require('../../utils/logger');

class SortCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      if (parts.length < 3) {
        socket.write(`${tag} BAD SORT command requires sort criteria and charset\r\n`);
        return;
      }

      // Parse SORT command: SORT (criteria) charset search-criteria
      const sortCriteriaStr = parts[1];
      const charset = parts[2];
      const searchCriteria = parts.slice(3).join(' ');

      // Parse sort criteria (remove parentheses)
      const sortCriteria = this.parseSortCriteria(sortCriteriaStr);
      
      // Get emails from database
      let emails = await Email.find().sort({ createdAt: -1 });
      
      // Apply search criteria if provided
      if (searchCriteria && searchCriteria !== 'ALL') {
        emails = this.applySearchCriteria(emails, searchCriteria);
      }
      
      // Sort emails according to criteria
      const sortedEmails = this.sortEmails(emails, sortCriteria);
      
      // Convert to message sequence numbers
      const messageNumbers = sortedEmails.map((_, index) => index + 1);
      
      socket.write(`* SORT ${messageNumbers.join(' ')}\r\n`);
      socket.write(`${tag} OK SORT completed\r\n`);
      
      logger.debug('IMAP SORT completed', { 
        sortCriteria, 
        charset, 
        searchCriteria, 
        messageNumbers: messageNumbers.length, 
        connectionId 
      });
    } catch (error) {
      logger.error('Error in SORT command', { error: error.message, connectionId });
      socket.write(`${tag} BAD SORT failed\r\n`);
    }
  }

  static parseSortCriteria(criteriaStr) {
    // Remove parentheses and split by spaces
    const cleanCriteria = criteriaStr.replace(/[()]/g, '');
    return cleanCriteria.split(' ').filter(c => c.length > 0);
  }

  static applySearchCriteria(emails, criteria) {
    // Simple search implementation
    // In a full implementation, you would parse the search criteria properly
    if (criteria === 'ALL') {
      return emails;
    }
    
    // For now, return all emails (basic implementation)
    return emails;
  }

  static sortEmails(emails, criteria) {
    const sortedEmails = [...emails];
    
    // Sort by multiple criteria (last one takes precedence)
    for (const criterion of criteria) {
      const isReverse = criterion.startsWith('REVERSE');
      const actualCriterion = isReverse ? criterion.substring(8) : criterion;
      
      switch (actualCriterion) {
        case 'DATE':
          sortedEmails.sort((a, b) => {
            const dateA = a.receivedAt || a.createdAt || new Date(0);
            const dateB = b.receivedAt || b.createdAt || new Date(0);
            return isReverse ? dateB - dateA : dateA - dateB;
          });
          break;
          
        case 'ARRIVAL':
          sortedEmails.sort((a, b) => {
            const dateA = a.createdAt || new Date(0);
            const dateB = b.createdAt || new Date(0);
            return isReverse ? dateB - dateA : dateA - dateB;
          });
          break;
          
        case 'FROM':
          sortedEmails.sort((a, b) => {
            const fromA = (a.from || '').toLowerCase();
            const fromB = (b.from || '').toLowerCase();
            return isReverse ? fromB.localeCompare(fromA) : fromA.localeCompare(fromB);
          });
          break;
          
        case 'SUBJECT':
          sortedEmails.sort((a, b) => {
            const subjectA = (a.subject || '').toLowerCase();
            const subjectB = (b.subject || '').toLowerCase();
            return isReverse ? subjectB.localeCompare(subjectA) : subjectA.localeCompare(subjectB);
          });
          break;
          
        case 'TO':
          sortedEmails.sort((a, b) => {
            const toA = (a.to && a.to.length > 0 ? a.to[0] : '').toLowerCase();
            const toB = (b.to && b.to.length > 0 ? b.to[0] : '').toLowerCase();
            return isReverse ? toB.localeCompare(toA) : toA.localeCompare(toB);
          });
          break;
          
        case 'SIZE':
          sortedEmails.sort((a, b) => {
            const sizeA = a.raw ? a.raw.length : 0;
            const sizeB = b.raw ? b.raw.length : 0;
            return isReverse ? sizeB - sizeA : sizeA - sizeB;
          });
          break;
          
        case 'CC':
          sortedEmails.sort((a, b) => {
            const ccA = (a.cc && a.cc.length > 0 ? a.cc[0] : '').toLowerCase();
            const ccB = (b.cc && b.cc.length > 0 ? b.cc[0] : '').toLowerCase();
            return isReverse ? ccB.localeCompare(ccA) : ccA.localeCompare(ccB);
          });
          break;
          
        case 'DISPLAYFROM':
          sortedEmails.sort((a, b) => {
            const fromA = (a.from || '').toLowerCase();
            const fromB = (b.from || '').toLowerCase();
            return isReverse ? fromB.localeCompare(fromA) : fromA.localeCompare(fromB);
          });
          break;
          
        case 'DISPLAYTO':
          sortedEmails.sort((a, b) => {
            const toA = (a.to && a.to.length > 0 ? a.to[0] : '').toLowerCase();
            const toB = (b.to && b.to.length > 0 ? b.to[0] : '').toLowerCase();
            return isReverse ? toB.localeCompare(toA) : toA.localeCompare(toB);
          });
          break;
          
        default:
          // Unknown criterion, keep current order
          break;
      }
    }
    
    return sortedEmails;
  }
}

module.exports = SortCommand; 