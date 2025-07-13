const logger = require('../../utils/logger');

class ListCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      const reference = parts[1] || '';
      const mailbox = parts[2] || '*';
      
      // Simple mailbox listing
      socket.write(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n`);
      socket.write(`${tag} OK LIST completed\r\n`);
      
      logger.debug('IMAP LIST completed', { reference, mailbox, connectionId });
    } catch (error) {
      logger.error('Error in LIST command', { error: error.message, connectionId });
      socket.write(`${tag} BAD LIST failed\r\n`);
    }
  }
}

module.exports = ListCommand; 