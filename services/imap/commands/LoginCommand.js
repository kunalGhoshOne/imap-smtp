const logger = require('../../utils/logger');

class LoginCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      if (parts.length < 3) {
        socket.write(`${tag} BAD LOGIN command requires username and password\r\n`);
        return;
      }

      const username = parts[1];
      const password = parts[2];

      // Simple authentication (for demo purposes)
      // In production, implement proper authentication
      if (username && password) {
        state.setUser(username);
        state.setState('AUTHENTICATED');
        socket.write(`${tag} OK LOGIN completed\r\n`);
        logger.info('IMAP login successful', { user: username, connectionId });
      } else {
        socket.write(`${tag} NO LOGIN failed\r\n`);
        logger.warn('IMAP login failed', { user: username, connectionId });
      }
    } catch (error) {
      logger.error('Error in LOGIN command', { error: error.message, connectionId });
      socket.write(`${tag} BAD LOGIN failed\r\n`);
    }
  }
}

module.exports = LoginCommand; 