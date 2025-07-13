const Email = require('../../models/Email');
const FetchCommand = require('./FetchCommand');
const SearchCommand = require('./SearchCommand');
const logger = require('../../utils/logger');

class UIDCommand {
  static async execute(socket, parts, state, tag, connectionId) {
    try {
      const subcommand = parts[1];
      const messageSet = parts[2];
      const dataItems = parts.slice(3).join(' ');
      
      switch (subcommand) {
        case 'FETCH':
          await this.handleUIDFetch(socket, messageSet, dataItems, tag, connectionId);
          break;
          
        case 'SEARCH':
          await this.handleUIDSearch(socket, parts.slice(2), tag, connectionId);
          break;
          
        case 'SORT':
          await this.handleUIDSort(socket, parts.slice(2), tag, connectionId);
          break;
          
        case 'STORE':
          await this.handleUIDStore(socket, parts.slice(2), tag, connectionId);
          break;
          
        default:
          socket.write(`${tag} BAD Unknown UID command: ${subcommand}\r\n`);
      }
    } catch (error) {
      logger.error('Error in UID command', { error: error.message, connectionId });
      socket.write(`${tag} BAD UID command failed\r\n`);
    }
  }

  static async handleUIDFetch(socket, messageSet, dataItems, tag, connectionId) {
    try {
      // Parse UID (simplified - only handles single UID)
      const uid = messageSet;
      
      // Get email by UID (using _id as UID)
      const email = await Email.findById(uid);
      
      if (!email) {
        socket.write(`${tag} NO Message not found\r\n`);
        return;
      }

      // Send email data based on requested items
      if (dataItems.includes('FLAGS')) {
        socket.write(`* FETCH (UID ${uid} FLAGS (\\Seen))\r\n`);
      }
      
      if (dataItems.includes('RFC822.SIZE')) {
        socket.write(`* FETCH (UID ${uid} RFC822.SIZE ${email.raw ? email.raw.length : 0})\r\n`);
      }
      
      if (dataItems.includes('RFC822.HEADER')) {
        const headers = FetchCommand.extractHeaders(email.raw || '');
        socket.write(`* FETCH (UID ${uid} RFC822.HEADER {${headers.length}}\r\n`);
        socket.write(headers);
        socket.write(')\r\n');
      }
      
      if (dataItems.includes('RFC822.TEXT')) {
        socket.write(`* FETCH (UID ${uid} RFC822.TEXT {${email.raw ? email.raw.length : 0}}\r\n`);
        socket.write(email.raw || '');
        socket.write(')\r\n');
      }
      
      if (dataItems.includes('BODY')) {
        socket.write(`* FETCH (UID ${uid} BODY ("text/plain" "UTF-8" NIL NIL "7bit" ${email.text ? email.text.length : 0}))\r\n`);
      }
      
      if (dataItems.includes('ENVELOPE')) {
        const envelope = FetchCommand.buildEnvelope(email);
        socket.write(`* FETCH (UID ${uid} ENVELOPE ${envelope})\r\n`);
      }
      
      socket.write(`${tag} OK UID FETCH completed\r\n`);
      
      logger.debug('IMAP UID FETCH completed', { uid, dataItems, connectionId });
    } catch (error) {
      logger.error('Error in UID FETCH', { error: error.message, connectionId });
      socket.write(`${tag} NO UID FETCH failed\r\n`);
    }
  }

  static async handleUIDSearch(socket, searchParts, tag, connectionId) {
    try {
      // Get all email UIDs
      const emails = await Email.find().sort({ createdAt: -1 });
      const uids = emails.map(email => email._id);
      
      socket.write(`* SEARCH ${uids.join(' ')}\r\n`);
      socket.write(`${tag} OK UID SEARCH completed\r\n`);
      
      logger.debug('IMAP UID SEARCH completed', { uids: uids.length, connectionId });
    } catch (error) {
      logger.error('Error in UID SEARCH', { error: error.message, connectionId });
      socket.write(`${tag} NO UID SEARCH failed\r\n`);
    }
  }

  static async handleUIDSort(socket, sortParts, tag, connectionId) {
    try {
      // This would implement UID SORT (similar to SORT but returns UIDs instead of sequence numbers)
      // For now, return a simple response
      const emails = await Email.find().sort({ createdAt: -1 });
      const uids = emails.map(email => email._id);
      
      socket.write(`* SORT ${uids.join(' ')}\r\n`);
      socket.write(`${tag} OK UID SORT completed\r\n`);
      
      logger.debug('IMAP UID SORT completed', { uids: uids.length, connectionId });
    } catch (error) {
      logger.error('Error in UID SORT', { error: error.message, connectionId });
      socket.write(`${tag} NO UID SORT failed\r\n`);
    }
  }

  static async handleUIDStore(socket, storeParts, tag, connectionId) {
    try {
      // This would implement UID STORE for modifying flags
      // For now, return a simple response
      socket.write(`${tag} OK UID STORE completed\r\n`);
      
      logger.debug('IMAP UID STORE completed', { connectionId });
    } catch (error) {
      logger.error('Error in UID STORE', { error: error.message, connectionId });
      socket.write(`${tag} NO UID STORE failed\r\n`);
    }
  }
}

module.exports = UIDCommand; 