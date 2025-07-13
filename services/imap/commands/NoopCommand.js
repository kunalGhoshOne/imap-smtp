const logger = require('../../utils/logger');

class NoopCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      socket.write(`${tag} OK NOOP completed\r\n`);
      logger.debug('IMAP NOOP completed', { connectionId });
    } catch (error) {
      logger.error('Error in NOOP command', { error: error.message, connectionId });
      socket.write(`${tag} BAD NOOP failed\r\n`);
    }
  }
}

module.exports = NoopCommand; 