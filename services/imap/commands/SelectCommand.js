const Email = require('../../models/Email');
const logger = require('../../utils/logger');

class SelectCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      const mailbox = parts[1] || 'INBOX';
      
      // Get email count for the mailbox
      const emailCount = await Email.countDocuments({});
      
      state.setMailbox(mailbox);
      state.setState('SELECTED');
      
      socket.write(`* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n`);
      socket.write(`* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Flags permitted\r\n`);
      socket.write(`* ${emailCount} EXISTS\r\n`);
      socket.write(`* 0 RECENT\r\n`);
      socket.write(`* OK [UIDVALIDITY 1] UIDs valid\r\n`);
      socket.write(`* OK [UIDNEXT ${emailCount + 1}] Predicted next UID\r\n`);
      socket.write(`${tag} OK [READ-WRITE] SELECT completed\r\n`);
      
      logger.info('IMAP mailbox selected', { mailbox, emailCount, connectionId });
    } catch (error) {
      logger.error('Error in SELECT command', { error: error.message, connectionId });
      socket.write(`${tag} NO SELECT failed\r\n`);
    }
  }
}

module.exports = SelectCommand; 