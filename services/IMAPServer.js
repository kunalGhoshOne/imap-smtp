const net = require('net');
const tls = require('tls');
const Email = require('../models/Email');
const logger = require('../utils/logger');

class IMAPServer {
  constructor() {
    this.servers = new Map();
    this.connections = new Map();
  }

  start() {
    const config = require('../config/config');
    
    // Start IMAP server on port 143 (no SSL)
    this.startServer(config.server.ports.imap143, 'plain', config.server.host);
    
    // Start IMAP server on port 993 (SSL)
    this.startServer(config.server.ports.imap993, 'ssl', config.server.host);

    logger.info('📬 IMAP servers started', {
      port143: config.server.ports.imap143,
      port993: config.server.ports.imap993
    });
  }

  startServer(port, mode, host) {
    let server;

    if (mode === 'ssl') {
      // SSL server for port 993
      const sslOptions = this.getSSLOptions();
      if (sslOptions === null) {
        // SSL disabled for development, use regular TCP server
        logger.info(`Using regular TCP server for IMAP port ${port} (SSL disabled)`);
        server = net.createServer((socket) => {
          this.handleConnection(socket, 'plain', port);
        });
      } else {
        server = tls.createServer(sslOptions, (socket) => {
          this.handleConnection(socket, mode, port);
        });
      }
    } else {
      // Regular TCP server for port 143
      server = net.createServer((socket) => {
        this.handleConnection(socket, mode, port);
      });
    }

    server.listen(port, host, () => {
      logger.info(`📬 IMAP server listening on port ${port} (${mode.toUpperCase()})`);
    });

    server.on('error', (error) => {
      logger.error(`🔥 IMAP server error on port ${port}`, { error: error.message });
    });

    this.servers.set(port, { server, mode });
  }

  getSSLOptions() {
    // For development mode, disable SSL completely
    if (process.env.NODE_ENV === 'development' || process.env.DISABLE_SSL === 'true') {
      logger.info('SSL disabled for IMAP development mode');
      return null;
    }

    const fs = require('fs');
    const certPath = process.env.SSL_CERT_PATH || './ssl/cert.pem';
    const keyPath = process.env.SSL_KEY_PATH || './ssl/key.pem';

    try {
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        };
      } else {
        logger.warn('SSL certificates not found for IMAP, using self-signed certificate');
        return {};
      }
    } catch (error) {
      logger.warn('Failed to load SSL certificates for IMAP', { error: error.message });
      return {};
    }
  }

  handleConnection(socket, mode, port) {
    const connectionId = `${port}-${Date.now()}`;
    logger.info(`📬 IMAP client connected on port ${port} (${mode.toUpperCase()})`, { connectionId });

    let state = 'NOT_AUTHENTICATED';
    let currentUser = null;
    let selectedMailbox = null;
    let tag = 'A001';

    // Send welcome message
    socket.write('* OK IMAP4rev1 Service Ready\r\n');

    socket.on('data', async (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        try {
          await this.handleIMAPCommand(socket, trimmedLine, {
            setState: (s) => { state = s; },
            getState: () => state,
            setUser: (u) => { currentUser = u; },
            getUser: () => currentUser,
            setMailbox: (m) => { selectedMailbox = m; },
            getMailbox: () => selectedMailbox,
            getTag: () => tag,
            incrementTag: () => { tag = this.incrementTag(tag); }
          }, connectionId);
        } catch (error) {
          logger.error('Error handling IMAP command', { error: error.message, connectionId });
          socket.write(`${tag} BAD Command failed\r\n`);
        }
      }
    });

    socket.on('end', () => {
      logger.info(`❌ IMAP client disconnected from port ${port}`, { connectionId });
      this.connections.delete(connectionId);
    });

    socket.on('error', (err) => {
      logger.error(`🔥 IMAP socket error on port ${port}`, { error: err.message, connectionId });
      this.connections.delete(connectionId);
    });

    this.connections.set(connectionId, { socket, state, user: currentUser, port });
  }

  async handleIMAPCommand(socket, line, state, connectionId) {
    const parts = line.split(' ');
    const command = parts[0].toUpperCase();
    const tag = parts[0];

    switch (command) {
      case 'CAPABILITY':
        await this.handleCapability(socket, tag);
        break;
      case 'NOOP':
        socket.write(`${tag} OK NOOP completed\r\n`);
        break;
      case 'LOGOUT':
        socket.write('* BYE IMAP4rev1 Server logging out\r\n');
        socket.write(`${tag} OK LOGOUT completed\r\n`);
        socket.end();
        break;
      case 'LOGIN':
        if (state.getState() === 'NOT_AUTHENTICATED') {
          await this.handleLogin(socket, parts, state, tag);
        } else {
          socket.write(`${tag} BAD Already authenticated\r\n`);
        }
        break;
      case 'SELECT':
        if (state.getState() === 'AUTHENTICATED') {
          await this.handleSelect(socket, parts, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'LIST':
        if (state.getState() === 'AUTHENTICATED') {
          await this.handleList(socket, parts, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'FETCH':
        if (state.getState() === 'SELECTED') {
          await this.handleFetch(socket, parts, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'SEARCH':
        if (state.getState() === 'SELECTED') {
          await this.handleSearch(socket, parts, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'UID':
        if (state.getState() === 'SELECTED') {
          await this.handleUID(socket, parts, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      default:
        socket.write(`${tag} BAD Unknown command\r\n`);
    }
  }

  async handleCapability(socket, tag) {
    const capabilities = [
      'IMAP4rev1',
      'STARTTLS',
      'AUTH=PLAIN',
      'AUTH=LOGIN',
      'IDLE',
      'NAMESPACE',
      'QUOTA',
      'ID',
      'ENABLE'
    ];
    
    socket.write('* CAPABILITY ' + capabilities.join(' ') + '\r\n');
    socket.write(`${tag} OK CAPABILITY completed\r\n`);
  }

  async handleLogin(socket, parts, state, tag) {
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
      logger.info('IMAP login successful', { user: username, connectionId: tag });
    } else {
      socket.write(`${tag} NO LOGIN failed\r\n`);
      logger.warn('IMAP login failed', { user: username, connectionId: tag });
    }
  }

  async handleSelect(socket, parts, state, tag) {
    const mailbox = parts[1] || 'INBOX';
    
    try {
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
      
      logger.info('IMAP mailbox selected', { mailbox, emailCount, connectionId: tag });
    } catch (error) {
      logger.error('Error selecting mailbox', { error: error.message, mailbox, connectionId: tag });
      socket.write(`${tag} NO SELECT failed\r\n`);
    }
  }

  async handleList(socket, parts, state, tag) {
    const reference = parts[1] || '';
    const mailbox = parts[2] || '*';
    
    // Simple mailbox listing
    socket.write(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n`);
    socket.write(`${tag} OK LIST completed\r\n`);
  }

  async handleFetch(socket, parts, state, tag) {
    const messageSet = parts[1];
    const dataItems = parts.slice(2).join(' ');
    
    try {
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
        socket.write(`* ${messageNumber} FETCH (RFC822.SIZE ${email.raw.length})\r\n`);
      }
      
      if (dataItems.includes('RFC822.HEADER')) {
        const headers = this.extractHeaders(email.raw);
        socket.write(`* ${messageNumber} FETCH (RFC822.HEADER {${headers.length}}\r\n`);
        socket.write(headers);
        socket.write(')\r\n');
      }
      
      if (dataItems.includes('RFC822.TEXT')) {
        socket.write(`* ${messageNumber} FETCH (RFC822.TEXT {${email.raw.length}}\r\n`);
        socket.write(email.raw);
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
      
    } catch (error) {
      logger.error('Error fetching message', { error: error.message, messageSet, connectionId: tag });
      socket.write(`${tag} NO FETCH failed\r\n`);
    }
  }

  async handleSearch(socket, parts, state, tag) {
    try {
      // Get all email IDs
      const emails = await Email.find().sort({ createdAt: -1 });
      const messageNumbers = emails.map((_, index) => index + 1);
      
      socket.write(`* SEARCH ${messageNumbers.join(' ')}\r\n`);
      socket.write(`${tag} OK SEARCH completed\r\n`);
      
    } catch (error) {
      logger.error('Error searching messages', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO SEARCH failed\r\n`);
    }
  }

  async handleUID(socket, parts, state, tag) {
    const subcommand = parts[1];
    const messageSet = parts[2];
    const dataItems = parts.slice(3).join(' ');
    
    if (subcommand === 'FETCH') {
      // Handle UID FETCH
      await this.handleFetch(socket, [tag, messageSet, ...dataItems.split(' ')], state, tag);
    } else if (subcommand === 'SEARCH') {
      // Handle UID SEARCH
      try {
        const emails = await Email.find().sort({ createdAt: -1 });
        const uids = emails.map(email => email._id);
        
        socket.write(`* SEARCH ${uids.join(' ')}\r\n`);
        socket.write(`${tag} OK UID SEARCH completed\r\n`);
      } catch (error) {
        logger.error('Error in UID SEARCH', { error: error.message, connectionId: tag });
        socket.write(`${tag} NO UID SEARCH failed\r\n`);
      }
    } else {
      socket.write(`${tag} BAD Unknown UID command\r\n`);
    }
  }

  extractHeaders(rawEmail) {
    const lines = rawEmail.split('\r\n');
    const headers = [];
    
    for (const line of lines) {
      if (line === '') break; // End of headers
      headers.push(line);
    }
    
    return headers.join('\r\n') + '\r\n';
  }

  buildEnvelope(email) {
    const date = email.createdAt.toDateString();
    const subject = email.subject || '';
    const from = email.sender || '';
    const to = email.recipients.join(', ') || '';
    
    return `("${date}" "${subject}" (("" "" "${from}")) (("" "" "${to}")) (("" "" "${from}")) (("" "" "${from}")) NIL NIL NIL "<${email._id}@localhost>")`;
  }

  incrementTag(tag) {
    const prefix = tag.replace(/\d+$/, '');
    const number = parseInt(tag.match(/\d+$/)[0]) + 1;
    return `${prefix}${number.toString().padStart(3, '0')}`;
  }

  stop() {
    for (const [port, { server }] of this.servers) {
      server.close();
      logger.info(`🛑 IMAP server stopped on port ${port}`);
    }
    this.servers.clear();
    this.connections.clear();
  }

  getServerStats() {
    const stats = {};
    for (const [port, { mode }] of this.servers) {
      stats[port] = {
        mode,
        status: 'running',
        connections: Array.from(this.connections.values()).filter(c => c.port === port).length
      };
    }
    return stats;
  }
}

module.exports = IMAPServer; 