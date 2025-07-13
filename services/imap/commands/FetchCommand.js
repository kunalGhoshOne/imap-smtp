const Email = require('../../models/Email');
const logger = require('../../utils/logger');

class FetchCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      const messageSet = parts[1];
      const dataItems = parts.slice(2).join(' ');
      
      // Parse message set (simplified - only handles single message)
      const messageNumber = parseInt(messageSet);
      
      if (isNaN(messageNumber)) {
        socket.write(`${tag} BAD Invalid message number\r\n`);
        return;
      }

      // Get email from database
      const emails = await Email.find().sort({ createdAt: -1 }).limit(messageNumber);
      const email = emails[messageNumber - 1];
      
      if (!email) {
        socket.write(`${tag} NO Message not found\r\n`);
        return;
      }

      // Send email data based on requested items
      if (dataItems.includes('FLAGS')) {
        socket.write(`* ${messageNumber} FETCH (FLAGS (\\Seen))\r\n`);
      }
      
      if (dataItems.includes('RFC822.SIZE')) {
        socket.write(`* ${messageNumber} FETCH (RFC822.SIZE ${email.raw ? email.raw.length : 0})\r\n`);
      }
      
      if (dataItems.includes('RFC822.HEADER')) {
        const headers = this.extractHeaders(email.raw || '');
        socket.write(`* ${messageNumber} FETCH (RFC822.HEADER {${headers.length}}\r\n`);
        socket.write(headers);
        socket.write(')\r\n');
      }
      
      if (dataItems.includes('RFC822.TEXT')) {
        socket.write(`* ${messageNumber} FETCH (RFC822.TEXT {${email.raw ? email.raw.length : 0}}\r\n`);
        socket.write(email.raw || '');
        socket.write(')\r\n');
      }
      
      if (dataItems.includes('BODY')) {
        socket.write(`* ${messageNumber} FETCH (BODY ("text/plain" "UTF-8" NIL NIL "7bit" ${email.text ? email.text.length : 0}))\r\n`);
      }
      
      if (dataItems.includes('ENVELOPE')) {
        const envelope = this.buildEnvelope(email);
        socket.write(`* ${messageNumber} FETCH (ENVELOPE ${envelope})\r\n`);
      }
      
      if (dataItems.includes('UID')) {
        socket.write(`* ${messageNumber} FETCH (UID ${email._id})\r\n`);
      }
      
      socket.write(`${tag} OK FETCH completed\r\n`);
      
      logger.debug('IMAP FETCH completed', { messageNumber, dataItems, connectionId });
    } catch (error) {
      logger.error('Error in FETCH command', { error: error.message, connectionId });
      socket.write(`${tag} NO FETCH failed\r\n`);
    }
  }

  static extractHeaders(rawEmail) {
    if (!rawEmail) return '\r\n';
    
    const lines = rawEmail.split('\r\n');
    const headers = [];
    
    for (const line of lines) {
      if (line === '') break; // End of headers
      headers.push(line);
    }
    
    return headers.join('\r\n') + '\r\n';
  }

  static buildEnvelope(email) {
    const date = email.receivedAt ? email.receivedAt.toUTCString() : new Date().toUTCString();
    const subject = email.subject || 'No Subject';
    const from = email.from || 'unknown@example.com';
    const to = email.to && email.to.length > 0 ? email.to[0] : 'unknown@example.com';
    
    return `(${date} "${subject}" (("${from}" NIL "${from.split('@')[0]}" "${from.split('@')[1] || 'example.com'}")) (("${to}" NIL "${to.split('@')[0]}" "${to.split('@')[1] || 'example.com'}")) NIL NIL NIL "<${email._id}@example.com>")`;
  }
}

module.exports = FetchCommand; 