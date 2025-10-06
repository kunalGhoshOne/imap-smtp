const net = require('net');
const tls = require('tls');
const Email = require('../models/Email');
const logger = require('../utils/logger');
const IMAPSearchParser = require('../utils/IMAPSearchParser');
const IMAPSortParser = require('../utils/IMAPSortParser');

class IMAPServer {
  constructor() {
    this.servers = new Map();
    this.connections = new Map();
    this.searchParser = new IMAPSearchParser();
    this.sortParser = new IMAPSortParser();
    this.idleConnections = new Map();
    this.mailboxes = new Map(); // Store mailbox metadata
    this.subscriptions = new Map(); // Store user subscriptions
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
    let waitingForContinuation = false;

    // Send welcome message
    socket.write('* OK IMAP4rev1 Service Ready\r\n');

    socket.on('data', async (chunk) => {
      // Skip main command processing if waiting for continuation data
      if (waitingForContinuation) {
        return;
      }

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
            incrementTag: () => { tag = this.incrementTag(tag); },
            setWaitingForContinuation: (w) => { waitingForContinuation = w; },
            getWaitingForContinuation: () => waitingForContinuation
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
      logger.error(`🔥 IMAP socket error on port ${port}`, {
        error: err.message,
        code: err.code,
        stack: err.stack,
        connectionId
      });
      this.connections.delete(connectionId);
    });

    this.connections.set(connectionId, { socket, state, user: currentUser, port });
  }

  async handleIMAPCommand(socket, line, state, connectionId) {
    const parts = line.split(' ');
    const tag = parts[0];
    const command = parts[1]?.toUpperCase() || '';

    // Debug logging
    logger.info('IMAP Command received', { tag, command, parts, line });

    // Pass parts.slice(2) to handlers (excludes tag and command)
    const args = parts.slice(2);

    switch (command) {
      case 'CAPABILITY':
        await this.handleCapability(socket, tag);
        break;
      case 'ID':
        await this.handleId(socket, args, state, tag);
        break;
      case 'AUTHENTICATE':
        if (state.getState() === 'NOT_AUTHENTICATED') {
          await this.handleAuthenticate(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Already authenticated\r\n`);
        }
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
          await this.handleLogin(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Already authenticated\r\n`);
        }
        break;
      case 'SELECT':
        if (state.getState() === 'AUTHENTICATED') {
          await this.handleSelect(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'LIST':
        if (state.getState() === 'AUTHENTICATED') {
          await this.handleList(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'FETCH':
        if (state.getState() === 'SELECTED') {
          await this.handleFetch(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'SEARCH':
        if (state.getState() === 'SELECTED') {
          await this.handleSearch(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'SORT':
        if (state.getState() === 'SELECTED') {
          await this.handleSort(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'THREAD':
        if (state.getState() === 'SELECTED') {
          await this.handleThread(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'UID':
        if (state.getState() === 'SELECTED') {
          await this.handleUID(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'STORE':
        if (state.getState() === 'SELECTED') {
          await this.handleStore(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'COPY':
        if (state.getState() === 'SELECTED') {
          await this.handleCopy(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'MOVE':
        if (state.getState() === 'SELECTED') {
          await this.handleMove(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'EXPUNGE':
        if (state.getState() === 'SELECTED') {
          await this.handleExpunge(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'CLOSE':
        if (state.getState() === 'SELECTED') {
          await this.handleClose(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      case 'STATUS':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleStatus(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'APPEND':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleAppend(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'CREATE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleCreate(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'DELETE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleDelete(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'RENAME':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleRename(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'EXAMINE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleExamine(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'SUBSCRIBE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleSubscribe(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'UNSUBSCRIBE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleUnsubscribe(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'LSUB':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleLsub(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'IDLE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleIdle(socket, args, state, tag, connectionId);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'NAMESPACE':
        if (state.getState() === 'AUTHENTICATED' || state.getState() === 'SELECTED') {
          await this.handleNamespace(socket, args, state, tag);
        } else {
          socket.write(`${tag} BAD Not authenticated\r\n`);
        }
        break;
      case 'CHECK':
        if (state.getState() === 'SELECTED') {
          socket.write(`${tag} OK CHECK completed\r\n`);
        } else {
          socket.write(`${tag} BAD No mailbox selected\r\n`);
        }
        break;
      default:
        logger.warn('Unknown IMAP command received', {
          tag,
          command,
          fullLine: line,
          parts,
          connectionId
        });
        socket.write(`${tag} BAD Unknown command: ${command}\r\n`);
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
      'ID',
      'ENABLE',
      'UIDPLUS',
      'SORT',
      'SORT=DISPLAY',
      'THREAD=ORDEREDSUBJECT',
      'THREAD=REFERENCES',
      'ESEARCH',
      'WITHIN',
      'CONDSTORE',
      'QRESYNC',
      'MOVE',
      'SPECIAL-USE',
      'UNSELECT',
      'CHILDREN'
    ];

    socket.write('* CAPABILITY ' + capabilities.join(' ') + '\r\n');
    socket.write(`${tag} OK CAPABILITY completed\r\n`);
  }

  async handleId(socket, args, state, tag) {
    // RFC 2971 - ID extension for client/server identification
    // Client sends ID (key val key val ...), server responds with same format
    // For now, send minimal server ID
    const serverId = [
      '"name"', '"IMAP Server"',
      '"version"', '"1.0"',
      '"vendor"', '"Custom"'
    ];

    socket.write(`* ID (${serverId.join(' ')})\r\n`);
    socket.write(`${tag} OK ID completed\r\n`);
  }

  async handleAuthenticate(socket, args, state, tag) {
    // RFC 3501 - AUTHENTICATE command
    // Supports PLAIN and LOGIN SASL mechanisms

    if (args.length < 1) {
      socket.write(`${tag} BAD AUTHENTICATE requires mechanism\r\n`);
      return;
    }

    const mechanism = args[0].toUpperCase();

    if (mechanism === 'PLAIN') {
      // PLAIN: client sends base64(\0username\0password)
      state.setWaitingForContinuation(true);
      socket.write('+ \r\n'); // Ready for credentials

      // Set up one-time listener for the authentication data
      const authListener = (data) => {
        const authData = data.toString().trim();

        try {
          // Decode base64 and extract username/password
          const decoded = Buffer.from(authData, 'base64').toString('utf8');
          const parts = decoded.split('\0');
          const username = parts[1] || parts[0];
          const password = parts[2] || parts[1];

          if (username && password) {
            state.setUser(username);
            state.setState('AUTHENTICATED');
            socket.write(`${tag} OK AUTHENTICATE completed\r\n`);
            logger.info('IMAP AUTHENTICATE PLAIN successful', { user: username, connectionId: tag });
          } else {
            socket.write(`${tag} NO AUTHENTICATE failed\r\n`);
          }
        } catch (error) {
          socket.write(`${tag} BAD AUTHENTICATE failed\r\n`);
          logger.error('AUTHENTICATE PLAIN error', { error: error.message });
        }

        socket.removeListener('data', authListener);
        state.setWaitingForContinuation(false);
      };

      socket.once('data', authListener);

    } else if (mechanism === 'LOGIN') {
      // LOGIN: interactive username/password exchange
      state.setWaitingForContinuation(true);
      socket.write('+ VXNlcm5hbWU6\r\n'); // base64("Username:")

      let step = 0;
      let username = '';

      const loginListener = (data) => {
        const input = data.toString().trim();

        if (step === 0) {
          // Received username
          username = Buffer.from(input, 'base64').toString('utf8');
          socket.write('+ UGFzc3dvcmQ6\r\n'); // base64("Password:")
          step = 1;
        } else if (step === 1) {
          // Received password
          const password = Buffer.from(input, 'base64').toString('utf8');

          if (username && password) {
            state.setUser(username);
            state.setState('AUTHENTICATED');
            socket.write(`${tag} OK AUTHENTICATE completed\r\n`);
            logger.info('IMAP AUTHENTICATE LOGIN successful', { user: username, connectionId: tag });
          } else {
            socket.write(`${tag} NO AUTHENTICATE failed\r\n`);
          }

          socket.removeListener('data', loginListener);
          state.setWaitingForContinuation(false);
        }
      };

      socket.on('data', loginListener);

    } else {
      socket.write(`${tag} NO AUTHENTICATE mechanism not supported\r\n`);
    }
  }

  async handleLogin(socket, args, state, tag) {
    if (args.length < 2) {
      socket.write(`${tag} BAD LOGIN command requires username and password\r\n`);
      return;
    }

    const username = args[0];
    const password = args[1];

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

  async handleSelect(socket, args, state, tag) {
    const mailbox = (args[0] || 'INBOX').replace(/"/g, '');
    const user = state.getUser();

    try {
      // Get all emails for this user (folder doesn't matter, only user ownership)
      const emailCount = await Email.countDocuments({
        authenticatedUsername: user
      });

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

  async handleList(socket, args, state, tag) {
    try {
      const user = state.getUser();

      // Standard folders that every user should have
      const standardFolders = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam'];

      // Get all unique mailboxes for this user from database
      const existingMailboxes = await Email.distinct('mailbox', {
        authenticatedUsername: user
      });

      // Combine standard folders with any custom folders the user has
      const allMailboxes = new Set([...standardFolders, ...existingMailboxes]);

      // Send LIST response for each mailbox
      for (const mb of allMailboxes) {
        let attributes = '\\HasNoChildren';

        // Add special-use attributes (RFC 6154)
        if (mb === 'INBOX') attributes = '\\HasNoChildren';
        else if (mb === 'Sent') attributes = '\\Sent \\HasNoChildren';
        else if (mb === 'Trash') attributes = '\\Trash \\HasNoChildren';
        else if (mb === 'Spam' || mb === 'Junk') attributes = '\\Junk \\HasNoChildren';
        else if (mb === 'Drafts') attributes = '\\Drafts \\HasNoChildren';

        socket.write(`* LIST (${attributes}) "/" "${mb}"\r\n`);
      }

      socket.write(`${tag} OK LIST completed\r\n`);
    } catch (error) {
      logger.error('Error in LIST', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO LIST failed\r\n`);
    }
  }

  async handleFetch(socket, args, state, tag) {
    const messageSet = args[0];
    const dataItems = args.slice(1).join(' ').toUpperCase();

    try {
      const user = state.getUser();
      const messageNumbers = this.parseMessageSet(messageSet);

      // Determine which fields we need
      const projection = { uid: 1, mailbox: 1, internalDate: 1 };
      if (dataItems.includes('FLAGS')) projection.flags = 1;
      if (dataItems.includes('RFC822') || dataItems.includes('BODY')) {
        projection.raw = 1;
        projection.text = 1;
      }
      if (dataItems.includes('ENVELOPE')) {
        projection.sender = 1;
        projection.recipients = 1;
        projection.subject = 1;
        projection.createdAt = 1;
        projection._id = 1;
      }

      // Fetch emails for this user (ignore folder, show all emails)
      const emails = await Email.find(this.getUserEmailQuery(user), projection)
        .sort({ internalDate: 1 })
        .limit(Math.max(...messageNumbers));

      for (const msgNum of messageNumbers) {
        const email = emails[msgNum - 1];
        if (!email) continue;

        const fetchResponse = [];
        let literalData = null;

        if (dataItems.includes('FLAGS')) {
          const flagsStr = this.formatFlags(email.flags || {});
          fetchResponse.push(`FLAGS (${flagsStr})`);
        }

        if (dataItems.includes('RFC822.SIZE')) {
          fetchResponse.push(`RFC822.SIZE ${email.raw ? email.raw.length : 0}`);
        }

        // Handle BODY.PEEK[HEADER.FIELDS ...] - most common
        if (dataItems.includes('BODY.PEEK[HEADER.FIELDS') || dataItems.includes('BODY[HEADER.FIELDS')) {
          const headers = this.extractHeaders(email.raw || '');
          fetchResponse.push(`BODY[HEADER.FIELDS (From To Cc Bcc Subject Date Message-ID Priority X-Priority References Newsgroups In-Reply-To Content-Type Reply-To)] {${headers.length}}`);
          literalData = headers;
        } else if (dataItems.includes('RFC822.HEADER')) {
          const headers = this.extractHeaders(email.raw || '');
          fetchResponse.push(`RFC822.HEADER {${headers.length}}`);
          literalData = headers;
        } else if (dataItems.includes('RFC822.TEXT') || dataItems.includes('RFC822')) {
          const body = email.raw || '';
          fetchResponse.push(`RFC822 {${body.length}}`);
          literalData = body;
        } else if (dataItems.includes('BODY[]') || dataItems.includes('BODY.PEEK[]')) {
          const body = email.raw || '';
          fetchResponse.push(`BODY[] {${body.length}}`);
          literalData = body;
        } else if (dataItems.includes('BODYSTRUCTURE')) {
          fetchResponse.push(`BODYSTRUCTURE ("text" "plain" ("charset" "UTF-8") NIL NIL "7bit" ${email.text ? email.text.length : 0} ${email.text ? email.text.split('\n').length : 0})`);
        } else if (dataItems.includes('BODY') && !dataItems.includes('BODY[')) {
          fetchResponse.push(`BODY ("text" "plain" ("charset" "UTF-8") NIL NIL "7bit" ${email.text ? email.text.length : 0})`);
        }

        if (dataItems.includes('ENVELOPE')) {
          const envelope = this.buildEnvelope(email);
          fetchResponse.push(`ENVELOPE ${envelope}`);
        }

        if (dataItems.includes('UID')) {
          fetchResponse.push(`UID ${email.uid}`);
        }

        if (dataItems.includes('INTERNALDATE')) {
          const date = email.internalDate || email.createdAt;
          fetchResponse.push(`INTERNALDATE "${this.formatInternalDate(date)}"`);
        }

        // Write FETCH response with proper literal formatting
        if (literalData) {
          socket.write(`* ${msgNum} FETCH (${fetchResponse.join(' ')}\r\n${literalData})\r\n`);
        } else {
          socket.write(`* ${msgNum} FETCH (${fetchResponse.join(' ')})\r\n`);
        }
      }

      socket.write(`${tag} OK FETCH completed\r\n`);

    } catch (error) {
      logger.error('Error fetching message', { error: error.message, messageSet, connectionId: tag });
      socket.write(`${tag} NO FETCH failed\r\n`);
    }
  }

  formatInternalDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = new Date(date);
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const tzOffset = -d.getTimezoneOffset();
    const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
    const tzMins = String(Math.abs(tzOffset) % 60).padStart(2, '0');
    const tzSign = tzOffset >= 0 ? '+' : '-';

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} ${tzSign}${tzHours}${tzMins}`;
  }

  async handleSearch(socket, args, state, tag) {
    try {
      const searchCriteria = args; // args already excludes tag and command
      const user = state.getUser();

      // Parse search criteria
      const mongoQuery = this.searchParser.parse(searchCriteria);

      // Add user filter (ignore folder, search all user's emails)
      mongoQuery.authenticatedUsername = user;

      // Execute search
      const emails = await Email.find(mongoQuery).sort({ internalDate: 1 });
      const messageNumbers = emails.map((email, index) => index + 1);

      socket.write(`* SEARCH ${messageNumbers.join(' ')}\r\n`);
      socket.write(`${tag} OK SEARCH completed\r\n`);

    } catch (error) {
      logger.error('Error searching messages', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO SEARCH failed\r\n`);
    }
  }

  async handleUID(socket, args, state, tag) {
    const subcommand = args[0]?.toUpperCase();
    const user = state.getUser();

    try {
      if (subcommand === 'FETCH') {
        // UID FETCH - fetch by UID instead of sequence number
        const uidSet = args[1];
        const dataItems = args.slice(2).join(' ').toUpperCase();

        const uids = this.parseMessageSet(uidSet);

        // Determine which fields we need from MongoDB
        const projection = { uid: 1, mailbox: 1 };
        if (dataItems.includes('FLAGS')) projection.flags = 1;
        if (dataItems.includes('RFC822') || dataItems.includes('BODY') || dataItems.includes('INTERNALDATE')) {
          projection.raw = 1;
          projection.internalDate = 1;
          projection.createdAt = 1;
        }
        if (dataItems.includes('ENVELOPE') || dataItems.includes('BODYSTRUCTURE')) {
          projection.sender = 1;
          projection.recipients = 1;
          projection.subject = 1;
          projection.text = 1;
          projection.createdAt = 1;
          projection._id = 1;
        }

        // Fetch all emails for this user with matching UIDs
        const emails = await Email.find({
          authenticatedUsername: user,
          uid: { $in: uids }
        }, projection);

        // Build responses
        for (const email of emails) {
          const fetchResponse = [];
          let literalData = null;

          if (dataItems.includes('FLAGS')) {
            const flagsStr = this.formatFlags(email.flags || {});
            fetchResponse.push(`FLAGS (${flagsStr})`);
          }

          if (dataItems.includes('RFC822.SIZE')) {
            fetchResponse.push(`RFC822.SIZE ${email.raw ? email.raw.length : 0}`);
          }

          // Handle BODY.PEEK[HEADER.FIELDS ...] - most common request from Thunderbird
          if (dataItems.includes('BODY.PEEK[HEADER.FIELDS') || dataItems.includes('BODY[HEADER.FIELDS')) {
            const headers = this.extractHeaders(email.raw || '');
            fetchResponse.push(`BODY[HEADER.FIELDS (From To Cc Bcc Subject Date Message-ID Priority X-Priority References Newsgroups In-Reply-To Content-Type Reply-To)] {${headers.length}}`);
            literalData = headers;
          } else if (dataItems.includes('RFC822') || dataItems.includes('BODY[]')) {
            const body = email.raw || '';
            fetchResponse.push(`BODY[] {${body.length}}`);
            literalData = body;
          }

          if (dataItems.includes('ENVELOPE')) {
            const envelope = this.buildEnvelope(email);
            fetchResponse.push(`ENVELOPE ${envelope}`);
          }

          if (dataItems.includes('BODYSTRUCTURE')) {
            fetchResponse.push(`BODYSTRUCTURE ("text" "plain" ("charset" "UTF-8") NIL NIL "7bit" ${email.text ? email.text.length : 0} ${email.text ? email.text.split('\n').length : 0})`);
          }

          if (dataItems.includes('INTERNALDATE')) {
            const date = email.internalDate || email.createdAt;
            fetchResponse.push(`INTERNALDATE "${this.formatInternalDate(date)}"`);
          }

          // Always include UID in response
          fetchResponse.push(`UID ${email.uid}`);

          // Write FETCH response with proper literal formatting
          if (literalData) {
            socket.write(`* ${email.uid} FETCH (${fetchResponse.join(' ')}\r\n${literalData})\r\n`);
          } else {
            socket.write(`* ${email.uid} FETCH (${fetchResponse.join(' ')})\r\n`);
          }
        }

        socket.write(`${tag} OK UID FETCH completed\r\n`);

      } else if (subcommand === 'SEARCH') {
        // UID SEARCH - return UIDs instead of sequence numbers
        const searchCriteria = args.slice(1);

        const mongoQuery = this.searchParser.parse(searchCriteria);
        mongoQuery.authenticatedUsername = user;

        const emails = await Email.find(mongoQuery).sort({ internalDate: 1 });

        // Ensure all emails have UIDs
        for (const email of emails) {
          if (!email.uid) {
            email.uid = await this.getNextUID(mailbox);
            await email.save();
          }
        }

        const uids = emails.map(email => email.uid);

        socket.write(`* SEARCH ${uids.join(' ')}\r\n`);
        socket.write(`${tag} OK UID SEARCH completed\r\n`);

      } else if (subcommand === 'COPY') {
        // UID COPY
        const uidSet = args[1];
        const destMailbox = args[2].replace(/"/g, '');

        const uids = this.parseMessageSet(uidSet);

        for (const uid of uids) {
          const email = await Email.findOne({
            authenticatedUsername: user,
            uid
          });
          if (!email) continue;

          const emailCopy = new Email(email.toObject());
          emailCopy._id = undefined;
          emailCopy.isNew = true;
          emailCopy.mailbox = destMailbox;
          emailCopy.uid = await this.getNextUID(destMailbox);
          emailCopy.flags = { ...email.flags.toObject ? email.flags.toObject() : email.flags };
          emailCopy.flags.recent = true;

          await emailCopy.save();
        }

        socket.write(`${tag} OK UID COPY completed\r\n`);

      } else if (subcommand === 'STORE') {
        // UID STORE
        const uidSet = args[1];
        let dataItem = args[2];
        const silent = dataItem.endsWith('.SILENT');
        if (silent) {
          dataItem = dataItem.replace('.SILENT', '');
        }

        const flags = args.slice(3).join(' ').replace(/[()]/g, '').split(' ').filter(f => f);
        const uids = this.parseMessageSet(uidSet);

        for (const uid of uids) {
          const email = await Email.findOne({
            authenticatedUsername: user,
            uid
          });
          if (!email) continue;

          if (!email.flags) {
            email.flags = {};
          }

          if (dataItem === 'FLAGS') {
            email.flags = this.parseFlagsToObject(flags);
          } else if (dataItem === '+FLAGS') {
            const newFlags = this.parseFlagsToObject(flags);
            email.flags = { ...email.flags.toObject ? email.flags.toObject() : email.flags, ...newFlags };
          } else if (dataItem === '-FLAGS') {
            const removeFlags = this.parseFlagsToObject(flags);
            for (const flag of Object.keys(removeFlags)) {
              if (email.flags[flag] !== undefined) {
                email.flags[flag] = false;
              }
            }
          }

          email.modseq = (email.modseq || 0) + 1;
          await email.save();

          if (!silent) {
            const flagsStr = this.formatFlags(email.flags);
            socket.write(`* ${uid} FETCH (UID ${uid} FLAGS (${flagsStr}))\r\n`);
          }
        }

        socket.write(`${tag} OK UID STORE completed\r\n`);

      } else {
        socket.write(`${tag} BAD Unknown UID command: ${subcommand}\r\n`);
      }
    } catch (error) {
      logger.error('Error in UID command', { error: error.message, subcommand, connectionId: tag });
      socket.write(`${tag} NO UID ${subcommand} failed: ${error.message}\r\n`);
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

  async handleSort(socket, args, state, tag) {
    try {
      // Parse: SORT (SORT_KEYS) CHARSET SEARCH_CRITERIA
      const sortData = this.sortParser.parse(args);
      const user = state.getUser();

      // Parse search criteria
      const mongoQuery = this.searchParser.parse(sortData.searchCriteria);
      mongoQuery.authenticatedUsername = user;

      // Get MongoDB sort object
      const mongoSort = this.sortParser.toMongoSort(sortData.sortKeys);

      // Execute query with sort
      const emails = await Email.find(mongoQuery).sort(mongoSort);
      const messageNumbers = emails.map((email, index) => index + 1);

      socket.write(`* SORT ${messageNumbers.join(' ')}\r\n`);
      socket.write(`${tag} OK SORT completed\r\n`);

    } catch (error) {
      logger.error('Error in SORT', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO SORT failed\r\n`);
    }
  }

  async handleThread(socket, args, state, tag) {
    try {
      const algorithm = args[0]; // ORDEREDSUBJECT or REFERENCES
      const charset = args[1];
      const searchCriteria = args.slice(2);
      const mailbox = state.getMailbox() || 'INBOX';

      // Parse search criteria
      const mongoQuery = this.searchParser.parse(searchCriteria);
      mongoQuery.mailbox = mailbox;

      // Get matching emails
      const emails = await Email.find(mongoQuery).sort({ internalDate: 1 });

      let threadTree;
      if (algorithm.toUpperCase() === 'ORDEREDSUBJECT') {
        threadTree = this.threadBySubject(emails);
      } else if (algorithm.toUpperCase() === 'REFERENCES') {
        threadTree = this.threadByReferences(emails);
      } else {
        socket.write(`${tag} BAD Unknown threading algorithm\r\n`);
        return;
      }

      socket.write(`* THREAD ${threadTree}\r\n`);
      socket.write(`${tag} OK THREAD completed\r\n`);

    } catch (error) {
      logger.error('Error in THREAD', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO THREAD failed\r\n`);
    }
  }

  threadBySubject(emails) {
    const threads = {};
    const result = [];

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const subject = this.normalizeSubject(email.subject || '');

      if (!threads[subject]) {
        threads[subject] = [];
      }
      threads[subject].push(i + 1);
    }

    for (const thread of Object.values(threads)) {
      if (thread.length === 1) {
        result.push(thread[0]);
      } else {
        result.push('(' + thread.join(' ') + ')');
      }
    }

    return result.join(' ');
  }

  threadByReferences(emails) {
    const messageMap = new Map();
    const rootMessages = [];

    // Build message map - handle missing messageId
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const msgNum = i + 1;
      const msgId = email.messageId || email._id.toString();

      messageMap.set(msgId, { num: msgNum, children: [], email });
    }

    // Build thread tree
    for (const [msgId, data] of messageMap.entries()) {
      const inReplyTo = data.email.inReplyTo;

      if (inReplyTo && messageMap.has(inReplyTo)) {
        messageMap.get(inReplyTo).children.push(data);
      } else if (data.email.references && data.email.references.length > 0) {
        // Try to find parent in references
        let foundParent = false;
        for (const ref of data.email.references.reverse()) {
          if (messageMap.has(ref)) {
            messageMap.get(ref).children.push(data);
            foundParent = true;
            break;
          }
        }
        if (!foundParent) {
          rootMessages.push(data);
        }
      } else {
        rootMessages.push(data);
      }
    }

    // Format output
    const formatThread = (msg) => {
      if (msg.children.length === 0) {
        return msg.num.toString();
      }
      const children = msg.children.map(formatThread).join(' ');
      return `(${msg.num} ${children})`;
    };

    return rootMessages.map(formatThread).join(' ') || '1';
  }

  normalizeSubject(subject) {
    // Remove Re:, Fwd:, etc.
    return subject.replace(/^(Re|Fwd|Fw):\s*/gi, '').trim().toLowerCase();
  }

  async getNextUID(mailbox) {
    const maxUidEmail = await Email.findOne({ mailbox })
      .sort({ uid: -1 })
      .select('uid');

    return (maxUidEmail?.uid || 0) + 1;
  }

  // Helper: Get base query for user's emails (ignores folder, only filters by user)
  getUserEmailQuery(username) {
    return { authenticatedUsername: username };
  }

  async getEmailBySequence(username, sequenceNumber) {
    return await Email.findOne(this.getUserEmailQuery(username))
      .sort({ internalDate: 1 })
      .skip(sequenceNumber - 1);
  }

  async handleStore(socket, args, state, tag) {
    try {
      const messageSet = args[0];
      let dataItem = args[1];
      const silent = dataItem.endsWith('.SILENT');
      if (silent) {
        dataItem = dataItem.replace('.SILENT', '');
      }

      const flags = args.slice(2).join(' ').replace(/[()]/g, '').split(' ').filter(f => f);

      // Parse message set
      const messageNumbers = this.parseMessageSet(messageSet);
      const mailbox = state.getMailbox() || 'INBOX';

      for (const msgNum of messageNumbers) {
        const email = await this.getEmailBySequence(mailbox, msgNum);

        if (!email) continue;

        // Ensure flags object exists
        if (!email.flags) {
          email.flags = {};
        }

        // Update flags based on operation
        if (dataItem === 'FLAGS') {
          // Replace all flags
          email.flags = this.parseFlagsToObject(flags);
        } else if (dataItem === '+FLAGS') {
          // Add flags
          const newFlags = this.parseFlagsToObject(flags);
          email.flags = { ...email.flags.toObject ? email.flags.toObject() : email.flags, ...newFlags };
        } else if (dataItem === '-FLAGS') {
          // Remove flags
          const removeFlags = this.parseFlagsToObject(flags);
          for (const flag of Object.keys(removeFlags)) {
            if (email.flags[flag] !== undefined) {
              email.flags[flag] = false;
            }
          }
        }

        // Increment MODSEQ for CONDSTORE
        email.modseq = (email.modseq || 0) + 1;

        await email.save();

        if (!silent) {
          const flagsStr = this.formatFlags(email.flags);
          socket.write(`* ${msgNum} FETCH (FLAGS (${flagsStr}))\r\n`);
        }
      }

      socket.write(`${tag} OK STORE completed\r\n`);

    } catch (error) {
      logger.error('Error in STORE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO STORE failed\r\n`);
    }
  }

  parseFlagsToObject(flags) {
    const flagObj = {};
    for (const flag of flags) {
      const flagLower = flag.toLowerCase().replace('\\', '');
      if (['seen', 'answered', 'flagged', 'deleted', 'draft'].includes(flagLower)) {
        flagObj[flagLower] = true;
      }
    }
    return flagObj;
  }

  formatFlags(flagsObj) {
    const flags = [];
    if (flagsObj.seen) flags.push('\\Seen');
    if (flagsObj.answered) flags.push('\\Answered');
    if (flagsObj.flagged) flags.push('\\Flagged');
    if (flagsObj.deleted) flags.push('\\Deleted');
    if (flagsObj.draft) flags.push('\\Draft');
    if (flagsObj.recent) flags.push('\\Recent');
    return flags.join(' ');
  }

  parseMessageSet(setStr) {
    const numbers = [];
    const parts = setStr.split(',');

    for (const part of parts) {
      if (part.includes(':')) {
        const [start, end] = part.split(':');
        const startNum = start === '*' ? 999999 : parseInt(start);
        const endNum = end === '*' ? 999999 : parseInt(end);
        for (let i = startNum; i <= endNum && i < 100000; i++) {
          numbers.push(i);
        }
      } else if (part === '*') {
        numbers.push(999999);
      } else {
        numbers.push(parseInt(part));
      }
    }

    return numbers;
  }

  async handleCopy(socket, args, state, tag) {
    try {
      const messageSet = args[0];
      const destMailbox = args[1].replace(/"/g, '');
      const sourceMailbox = state.getMailbox() || 'INBOX';

      const messageNumbers = this.parseMessageSet(messageSet);
      const copiedUids = [];

      for (const msgNum of messageNumbers) {
        const email = await this.getEmailBySequence(sourceMailbox, msgNum);

        if (!email) continue;

        // Create copy
        const emailCopy = new Email(email.toObject());
        emailCopy._id = undefined;
        emailCopy.isNew = true;
        emailCopy.mailbox = destMailbox;
        emailCopy.uid = await this.getNextUID(destMailbox);
        emailCopy.flags = { ...email.flags.toObject ? email.flags.toObject() : email.flags };
        emailCopy.flags.recent = true; // Mark as recent in new mailbox

        await emailCopy.save();
        copiedUids.push(emailCopy.uid);
      }

      // UIDPLUS extension response
      if (copiedUids.length > 0) {
        socket.write(`${tag} OK [COPYUID 1 ${messageNumbers.join(',')} ${copiedUids.join(',')}] COPY completed\r\n`);
      } else {
        socket.write(`${tag} OK COPY completed\r\n`);
      }

    } catch (error) {
      logger.error('Error in COPY', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO COPY failed\r\n`);
    }
  }

  async handleMove(socket, args, state, tag) {
    try {
      const messageSet = args[0];
      const destMailbox = args[1].replace(/"/g, '');
      const sourceMailbox = state.getMailbox() || 'INBOX';

      const messageNumbers = this.parseMessageSet(messageSet);
      const movedUids = [];

      for (const msgNum of messageNumbers) {
        const email = await this.getEmailBySequence(sourceMailbox, msgNum);

        if (!email) continue;

        const oldUid = email.uid;

        // Move email to new mailbox
        email.mailbox = destMailbox;
        email.uid = await this.getNextUID(destMailbox);
        email.flags.recent = true; // Mark as recent in new mailbox

        await email.save();
        movedUids.push(email.uid);
      }

      socket.write(`${tag} OK MOVE completed\r\n`);

    } catch (error) {
      logger.error('Error in MOVE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO MOVE failed\r\n`);
    }
  }

  async handleExpunge(socket, args, state, tag) {
    try {
      const user = state.getUser();

      // Find and delete all messages marked as deleted for this user
      const deletedEmails = await Email.find({
        authenticatedUsername: user,
        'flags.deleted': true
      }).sort({ internalDate: 1 });

      for (let i = 0; i < deletedEmails.length; i++) {
        const email = deletedEmails[i];
        const msgNum = i + 1;

        await Email.deleteOne({ _id: email._id });

        // Send untagged EXPUNGE response
        socket.write(`* ${msgNum} EXPUNGE\r\n`);
      }

      socket.write(`${tag} OK EXPUNGE completed\r\n`);

    } catch (error) {
      logger.error('Error in EXPUNGE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO EXPUNGE failed\r\n`);
    }
  }

  async handleClose(socket, args, state, tag) {
    try {
      // Perform implicit EXPUNGE
      const user = state.getUser();
      await Email.deleteMany({
        authenticatedUsername: user,
        'flags.deleted': true
      });

      // Return to AUTHENTICATED state
      state.setMailbox(null);
      state.setState('AUTHENTICATED');

      socket.write(`${tag} OK CLOSE completed\r\n`);

    } catch (error) {
      logger.error('Error in CLOSE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO CLOSE failed\r\n`);
    }
  }

  async handleStatus(socket, args, state, tag) {
    try {
      const mailbox = args[0].replace(/"/g, '');
      const user = state.getUser();

      const statusItems = args.slice(1).join(' ').replace(/[()]/g, '').split(' ').filter(s => s);

      const response = [];

      // Query by user, not by mailbox (ignore folders)
      const userQuery = this.getUserEmailQuery(user);

      for (const item of statusItems) {
        switch (item.toUpperCase()) {
          case 'MESSAGES':
            const count = await Email.countDocuments(userQuery);
            response.push(`MESSAGES ${count}`);
            break;
          case 'RECENT':
            const recentCount = await Email.countDocuments({
              ...userQuery,
              'flags.recent': true
            });
            response.push(`RECENT ${recentCount}`);
            break;
          case 'UNSEEN':
            const unseenCount = await Email.countDocuments({
              ...userQuery,
              'flags.seen': { $ne: true }
            });
            response.push(`UNSEEN ${unseenCount}`);
            break;
          case 'UIDNEXT':
            const maxUid = await Email.findOne(userQuery).sort({ uid: -1 });
            response.push(`UIDNEXT ${(maxUid?.uid || 0) + 1}`);
            break;
          case 'UIDVALIDITY':
            response.push('UIDVALIDITY 1');
            break;
        }
      }

      socket.write(`* STATUS "${mailbox}" (${response.join(' ')})\r\n`);
      socket.write(`${tag} OK STATUS completed\r\n`);

    } catch (error) {
      logger.error('Error in STATUS', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO STATUS failed\r\n`);
    }
  }

  async handleAppend(socket, args, state, tag) {
    try {
      const mailbox = args[0].replace(/"/g, '');

      // Check for flags (optional)
      let flags = {};
      let dateTime = null;
      let literalSize = 0;
      let argIndex = 1; // Start after mailbox

      // Parse optional flags
      if (args[argIndex] === '(' || (args[argIndex] && args[argIndex].startsWith('(\\'))) {
        const flagParts = [];
        while (argIndex < args.length && args[argIndex] !== ')') {
          if (args[argIndex] !== '(') {
            flagParts.push(args[argIndex]);
          }
          argIndex++;
        }
        argIndex++; // Skip closing paren
        flags = this.parseFlagsToObject(flagParts);
      }

      // Parse optional date-time
      if (args[argIndex] && args[argIndex].startsWith('"')) {
        dateTime = args[argIndex].replace(/"/g, '');
        argIndex++;
      }

      // Parse literal size {size}
      const literalMatch = args[argIndex]?.match(/\{(\d+)\}/);
      if (literalMatch) {
        literalSize = parseInt(literalMatch[1]);

        // Send continuation response
        state.setWaitingForContinuation(true);
        socket.write('+ Ready for literal data\r\n');

        // Set up one-time listener for literal data
        const literalHandler = async (chunk) => {
          socket.removeListener('data', literalHandler);

          const literalData = chunk.toString();

          // Create new email
          const email = new Email({
            mailbox,
            raw: literalData,
            internalDate: dateTime ? new Date(dateTime) : new Date(),
            uid: await this.getNextUID(mailbox),
            flags: { ...flags, recent: true },
            status: 'received'
          });

          // Parse email headers for sender, recipients, subject
          const headerMatch = literalData.match(/^([\s\S]*?)\r?\n\r?\n/);
          if (headerMatch) {
            const headers = headerMatch[1];
            const fromMatch = headers.match(/^From:\s*(.+)$/im);
            const toMatch = headers.match(/^To:\s*(.+)$/im);
            const subjectMatch = headers.match(/^Subject:\s*(.+)$/im);
            const messageIdMatch = headers.match(/^Message-ID:\s*<(.+)>$/im);
            const inReplyToMatch = headers.match(/^In-Reply-To:\s*<(.+)>$/im);
            const referencesMatch = headers.match(/^References:\s*(.+)$/im);

            if (fromMatch) email.sender = fromMatch[1].trim();
            if (toMatch) email.recipients = [toMatch[1].trim()];
            if (subjectMatch) email.subject = subjectMatch[1].trim();
            if (messageIdMatch) email.messageId = messageIdMatch[1].trim();
            if (inReplyToMatch) email.inReplyTo = inReplyToMatch[1].trim();
            if (referencesMatch) {
              email.references = referencesMatch[1]
                .match(/<([^>]+)>/g)
                ?.map(ref => ref.slice(1, -1)) || [];
            }
          }

          await email.save();

          // UIDPLUS response
          socket.write(`${tag} OK [APPENDUID 1 ${email.uid}] APPEND completed\r\n`);

          logger.info('APPEND completed', { mailbox, uid: email.uid, size: literalSize });
          state.setWaitingForContinuation(false);
        };

        socket.once('data', literalHandler);
      } else {
        socket.write(`${tag} BAD APPEND requires literal data\r\n`);
      }

    } catch (error) {
      logger.error('Error in APPEND', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO APPEND failed: ${error.message}\r\n`);
    }
  }

  async handleCreate(socket, args, state, tag) {
    try {
      const mailbox = args[0].replace(/"/g, '');

      // Store mailbox metadata
      this.mailboxes.set(mailbox, {
        name: mailbox,
        created: new Date()
      });

      socket.write(`${tag} OK CREATE completed\r\n`);

    } catch (error) {
      logger.error('Error in CREATE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO CREATE failed\r\n`);
    }
  }

  async handleDelete(socket, args, state, tag) {
    try {
      const mailbox = args[0].replace(/"/g, '');

      // Delete all emails in mailbox
      await Email.deleteMany({ mailbox });

      // Remove mailbox metadata
      this.mailboxes.delete(mailbox);

      socket.write(`${tag} OK DELETE completed\r\n`);

    } catch (error) {
      logger.error('Error in DELETE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO DELETE failed\r\n`);
    }
  }

  async handleRename(socket, args, state, tag) {
    try {
      const oldMailbox = args[0].replace(/"/g, '');
      const newMailbox = args[1].replace(/"/g, '');

      // Rename all emails in mailbox
      await Email.updateMany({ mailbox: oldMailbox }, { mailbox: newMailbox });

      // Update mailbox metadata
      if (this.mailboxes.has(oldMailbox)) {
        const metadata = this.mailboxes.get(oldMailbox);
        this.mailboxes.delete(oldMailbox);
        this.mailboxes.set(newMailbox, { ...metadata, name: newMailbox });
      }

      socket.write(`${tag} OK RENAME completed\r\n`);

    } catch (error) {
      logger.error('Error in RENAME', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO RENAME failed\r\n`);
    }
  }

  async handleExamine(socket, args, state, tag) {
    try {
      const mailbox = (args[0] || 'INBOX').replace(/"/g, '');
      const user = state.getUser();

      // Same as SELECT but read-only - get all user's emails
      const emailCount = await Email.countDocuments(this.getUserEmailQuery(user));

      state.setMailbox(mailbox);
      state.setState('SELECTED');

      socket.write(`* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n`);
      socket.write(`* OK [PERMANENTFLAGS ()] Flags permitted\r\n`);
      socket.write(`* ${emailCount} EXISTS\r\n`);
      socket.write(`* 0 RECENT\r\n`);
      socket.write(`* OK [UIDVALIDITY 1] UIDs valid\r\n`);
      socket.write(`* OK [UIDNEXT ${emailCount + 1}] Predicted next UID\r\n`);
      socket.write(`${tag} OK [READ-ONLY] EXAMINE completed\r\n`);

    } catch (error) {
      logger.error('Error in EXAMINE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO EXAMINE failed\r\n`);
    }
  }

  async handleSubscribe(socket, args, state, tag) {
    try {
      const mailbox = args[0].replace(/"/g, '');
      const user = state.getUser();

      if (!this.subscriptions.has(user)) {
        this.subscriptions.set(user, new Set());
      }

      this.subscriptions.get(user).add(mailbox);

      socket.write(`${tag} OK SUBSCRIBE completed\r\n`);

    } catch (error) {
      logger.error('Error in SUBSCRIBE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO SUBSCRIBE failed\r\n`);
    }
  }

  async handleUnsubscribe(socket, args, state, tag) {
    try {
      const mailbox = args[0].replace(/"/g, '');
      const user = state.getUser();

      if (this.subscriptions.has(user)) {
        this.subscriptions.get(user).delete(mailbox);
      }

      socket.write(`${tag} OK UNSUBSCRIBE completed\r\n`);

    } catch (error) {
      logger.error('Error in UNSUBSCRIBE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO UNSUBSCRIBE failed\r\n`);
    }
  }

  async handleLsub(socket, args, state, tag) {
    try {
      const user = state.getUser();

      if (this.subscriptions.has(user)) {
        for (const mailbox of this.subscriptions.get(user)) {
          socket.write(`* LSUB () "/" "${mailbox}"\r\n`);
        }
      }

      socket.write(`${tag} OK LSUB completed\r\n`);

    } catch (error) {
      logger.error('Error in LSUB', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO LSUB failed\r\n`);
    }
  }

  async handleIdle(socket, args, state, tag, connectionId) {
    try {
      state.setWaitingForContinuation(true);
      socket.write('+ idling\r\n');

      // Store connection in idle map
      this.idleConnections.set(connectionId, { socket, state });

      // Set up listener for DONE command
      const doneHandler = (chunk) => {
        const line = chunk.toString().trim().toUpperCase();
        if (line === 'DONE') {
          socket.removeListener('data', doneHandler);
          this.idleConnections.delete(connectionId);
          socket.write(`${tag} OK IDLE terminated\r\n`);
          state.setWaitingForContinuation(false);
        }
      };

      socket.on('data', doneHandler);

    } catch (error) {
      logger.error('Error in IDLE', { error: error.message, connectionId: tag });
      socket.write(`${tag} NO IDLE failed\r\n`);
    }
  }

  async handleNamespace(socket, args, state, tag) {
    // Return namespace information
    socket.write('* NAMESPACE (("" "/")) NIL NIL\r\n');
    socket.write(`${tag} OK NAMESPACE completed\r\n`);
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