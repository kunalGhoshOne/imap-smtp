const logger = require('../../utils/logger');

class CapabilityCommand {
  static async execute(socket, tag, connectionId) {
    try {
      const capabilities = [
        'IMAP4rev1',
        'STARTTLS',
        'AUTH=PLAIN',
        'AUTH=LOGIN',
        'IDLE',
        'NAMESPACE',
        'QUOTA',
        'ID',
        'ENABLE',
        'SORT',
        'THREAD=ORDEREDSUBJECT',
        'THREAD=REFERENCES',
        'MULTIAPPEND',
        'UNSELECT',
        'CONDSTORE',
        'QRESYNC',
        'WITHIN',
        'ENABLE'
      ];
      
      socket.write('* CAPABILITY ' + capabilities.join(' ') + '\r\n');
      socket.write(`${tag} OK CAPABILITY completed\r\n`);
      
      logger.debug('IMAP CAPABILITY completed', { connectionId });
    } catch (error) {
      logger.error('Error in CAPABILITY command', { error: error.message, connectionId });
      socket.write(`${tag} BAD CAPABILITY failed\r\n`);
    }
  }
}

module.exports = CapabilityCommand; 