const Email = require('../../models/Email');
const logger = require('../../utils/logger');

class SearchCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      // Get all email IDs
      const emails = await Email.find().sort({ createdAt: -1 });
      const messageNumbers = emails.map((_, index) => index + 1);
      
      socket.write(`* SEARCH ${messageNumbers.join(' ')}\r\n`);
      socket.write(`${tag} OK SEARCH completed\r\n`);
      
      logger.debug('IMAP SEARCH completed', { messageNumbers: messageNumbers.length, connectionId });
    } catch (error) {
      logger.error('Error in SEARCH command', { error: error.message, connectionId });
      socket.write(`${tag} NO SEARCH failed\r\n`);
    }
  }
}

module.exports = SearchCommand; 