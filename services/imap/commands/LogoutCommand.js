const logger = require('../../utils/logger');

class LogoutCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      socket.write('* BYE IMAP4rev1 Server logging out\r\n');
      socket.write(`${tag} OK LOGOUT completed\r\n`);
      socket.end();
      
      logger.info('IMAP logout completed', { connectionId });
    } catch (error) {
      logger.error('Error in LOGOUT command', { error: error.message, connectionId });
      socket.write(`${tag} BAD LOGOUT failed\r\n`);
    }
  }
}

module.exports = LogoutCommand; 