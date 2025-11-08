const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const EmailProcessor = require('./EmailProcessor');
const IncomingEmailProcessor = require('./IncomingEmailProcessor');
const SMTPForwarder = require('./SMTPForwarder');
const SMTPAuthService = require('./SMTPAuthService');
const RspamdService = require('./RspamdService');
const logger = require('../utils/logger');

class MultiPortSMTPServer {
  constructor() {
    this.servers = new Map();
    this.forwarder = null;
  }

  start() {
    const config = require('../config/config');
    
    // Initialize SMTP forwarder for port 25
    if (config.server.forward25.enabled) {
      this.forwarder = new SMTPForwarder(config.server.forward25);
    }

    // Start servers on different ports
    this.startServer(config.server.ports.smtp25, 'forward', config.server.host);
    this.startServer(config.server.ports.smtp587, 'starttls', config.server.host);
    this.startServer(config.server.ports.smtp465, 'ssl', config.server.host);

    logger.info('🚀 Multi-port SMTP servers started', {
      port25: config.server.ports.smtp25,
      port587: config.server.ports.smtp587,
      port465: config.server.ports.smtp465,
      forwarding: config.server.forward25.enabled
    });
  }

  startServer(port, mode, host) {
    let server;

    if (mode === 'ssl') {
      // SSL server for port 465
      const sslOptions = this.getSSLOptions();
      if (sslOptions === null) {
        // SSL disabled for development, use regular TCP server
        logger.info(`Using regular TCP server for port ${port} (SSL disabled)`);
        server = net.createServer((socket) => {
          this.handleConnection(socket, 'plain', port);
        });
      } else {
        server = tls.createServer(sslOptions, (socket) => {
          this.handleConnection(socket, mode, port);
        });
      }
    } else {
      // Regular TCP server for ports 25 and 587
      server = net.createServer((socket) => {
        this.handleConnection(socket, mode, port);
      });
    }

    server.listen(port, host, () => {
      logger.info(`📬 SMTP server listening on port ${port} (${mode.toUpperCase()})`);
    });

    server.on('error', (error) => {
      logger.error(`🔥 Server error on port ${port}`, { error: error.message });
    });

    this.servers.set(port, { server, mode });
  }

  getSSLOptions() {
    // For development mode, disable SSL completely
    if (process.env.NODE_ENV === 'development' || process.env.DISABLE_SSL === 'true') {
      logger.info('SSL disabled for development mode');
      return null;
    }

    // Try to load SSL certificates
    const certPath = process.env.SSL_CERT_PATH || './ssl/cert.pem';
    const keyPath = process.env.SSL_KEY_PATH || './ssl/key.pem';

    try {
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        };
      } else {
        logger.warn('SSL certificates not found, using self-signed certificate');
        // Generate self-signed certificate for testing
        return this.generateSelfSignedCert();
      }
    } catch (error) {
      logger.warn('Failed to load SSL certificates, using self-signed certificate', { error: error.message });
      return this.generateSelfSignedCert();
    }
  }

  generateSelfSignedCert() {
    // For development/testing purposes
    const { execSync } = require('child_process');
    const sslDir = './ssl';
    
    try {
      if (!fs.existsSync(sslDir)) {
        fs.mkdirSync(sslDir, { recursive: true });
      }

      const certPath = path.join(sslDir, 'cert.pem');
      const keyPath = path.join(sslDir, 'key.pem');

      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        logger.info('Generating self-signed SSL certificate...');
        
        const opensslCmd = `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`;
        
        try {
          execSync(opensslCmd, { stdio: 'ignore' });
          logger.info('Self-signed SSL certificate generated successfully');
        } catch (error) {
          logger.error('Failed to generate SSL certificate', { error: error.message });
          // Fallback to basic SSL options
          return {};
        }
      }

      return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
    } catch (error) {
      logger.error('Error setting up SSL', { error: error.message });
      return {};
    }
  }

  handleConnection(socket, mode, port) {
    logger.info(`📬 Client connected on port ${port} (${mode.toUpperCase()})`);

    let sender = '';
    let recipients = [];
    let rawData = '';
    let isDataMode = false;
    let isAuthenticated = false;
    let authenticatedUsername = null;
    let supportsStartTLS = false;
    let startTLSUpgraded = false;
    let authState = 'none'; // none, waiting_username, waiting_password
    let authUsername = null;
    let clientIp = socket.remoteAddress;
    let helo = '';

    // Send welcome message
    socket.write('220 Multi-Port SMTP Server Ready\r\n');

    socket.on('data', async (chunk) => {
      try {
        const lines = chunk.toString().split(/\r?\n/);

        for (let line of lines) {
          line = line.trim();

        if (isDataMode) {
          if (line === '.') {
            isDataMode = false;
            try {
              await this.handleEmailData(socket, sender, recipients, rawData, mode, port, authenticatedUsername, {
                ip: clientIp,
                helo: helo
              });
            } catch (error) {
              logger.error('Error handling email data', { error: error.message, port });
              socket.write('550 Failed to process email\r\n');
            }

            // Reset state
            rawData = '';
            sender = '';
            recipients = [];
          } else {
            // Skip leading empty lines, but preserve empty lines after we've started collecting data
            // (needed for headers/body separator)
            if (rawData.length === 0 && line === '') {
              // Skip leading blank lines
              continue;
            }
            rawData += line + '\r\n';
          }
          continue;
        }

          // Skip empty lines when NOT in DATA mode
          if (!line) continue;

        try {
          await this.handleSMTPCommand(socket, line, {
          setSender: (s) => { sender = s; },
          addRecipient: (r) => { recipients.push(r); },
          clearRecipients: () => { recipients = []; },
          setDataMode: (mode) => { isDataMode = mode; },
          setAuthenticated: (auth, username) => {
            isAuthenticated = auth;
            authenticatedUsername = username;
          },
          setStartTLS: (tls) => { supportsStartTLS = tls; },
          getStartTLS: () => supportsStartTLS,
          isStartTLSUpgraded: () => startTLSUpgraded,
          upgradeToTLS: () => { startTLSUpgraded = true; },
          setAuthState: (state) => { authState = state; },
          getAuthState: () => authState,
          setAuthUsername: (username) => { authUsername = username; },
          getAuthUsername: () => authUsername,
          isAuthenticated: () => isAuthenticated,
          getAuthenticatedUsername: () => authenticatedUsername,
          setHelo: (h) => { helo = h; }
        }, mode, port);
        } catch (error) {
          logger.error('Error handling SMTP command', { error: error.message, port, line });
          try {
            socket.write('550 Internal server error\r\n');
          } catch (writeError) {
            logger.error('Error writing to socket after command error', { error: writeError.message, port });
          }
        }
      }
      } catch (error) {
        logger.error('Error processing socket data', { error: error.message, port });
        try {
          socket.write('550 Internal server error\r\n');
        } catch (writeError) {
          logger.error('Error writing to socket', { error: writeError.message, port });
        }
      }
    });

    socket.on('end', () => {
      logger.info(`❌ Client disconnected from port ${port}`);
    });

    socket.on('error', (err) => {
      logger.error(`🔥 Socket error on port ${port}`, { error: err.message });
    });
  }

  async handleSMTPCommand(socket, line, state, mode, port) {
    // Handle authentication state for AUTH LOGIN
    if (state.getAuthState() === 'waiting_username') {
      const username = Buffer.from(line, 'base64').toString('utf8');
      state.setAuthUsername(username); // Store username for later use
      state.setAuthState('waiting_password');
      socket.write('334 UGFzc3dvcmQ6\r\n'); // Base64 for "Password:"
      return;
    }

    if (state.getAuthState() === 'waiting_password') {
      const username = state.getAuthUsername(); // Get stored username
      const password = Buffer.from(line, 'base64').toString('utf8');
      state.setAuthState('none');

      try {
        // Perform authentication
        const authResult = await SMTPAuthService.authenticateUser(username, password);
        if (authResult.success) {
          state.setAuthenticated(true, authResult.username);
          socket.write('235 Authentication successful\r\n');
        } else {
          socket.write('535 Authentication failed\r\n');
        }
      } catch (error) {
        logger.error('Authentication error during LOGIN', { error: error.message });
        socket.write('535 Authentication failed\r\n');
      }
      return;
    }

    if (line.startsWith('HELO') || line.startsWith('EHLO')) {
      const domain = line.split(' ')[1] || 'localhost';
      state.setHelo(domain);

      if (line.startsWith('EHLO')) {
        // Extended HELO - advertise capabilities
        socket.write('250-Hello\r\n');
        socket.write('250-SIZE 10485760\r\n');
        
        if (mode === 'starttls' && !state.isStartTLSUpgraded()) {
          socket.write('250-STARTTLS\r\n');
          state.setStartTLS(true);
        }
        
        socket.write('250 AUTH PLAIN LOGIN\r\n');
      } else {
        socket.write('250 Hello\r\n');
      }
    } else if (line === 'STARTTLS' && mode === 'starttls' && !state.isStartTLSUpgraded()) {
      // Send ready response before upgrade
      socket.write('220 Ready to start TLS\r\n');

      // Get SSL options for TLS upgrade
      const tlsOptions = this.getSSLOptions();
      if (tlsOptions === null) {
        logger.error('Cannot perform STARTTLS: SSL options not available');
        socket.write('454 TLS not available\r\n');
        return;
      }

      try {
        // Create TLS socket wrapping the existing socket (server-side)
        const tlsSocket = new tls.TLSSocket(socket, {
          isServer: true,
          server: this.servers.get(port).server,
          ...tlsOptions
        });

        // Mark as upgraded
        state.upgradeToTLS();

        // Transfer all event listeners from old socket to TLS socket
        // Note: The connection state variables are already in closure scope

        // Remove old data listener to prevent duplicate handling
        socket.removeAllListeners('data');

        // Set up TLS socket event handlers
        tlsSocket.on('secure', () => {
          logger.info('🔒 TLS upgrade completed successfully', { port });
        });

        tlsSocket.on('error', (error) => {
          logger.error('TLS socket error', { error: error.message, port });
          try {
            tlsSocket.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        });

        // Replace the socket reference in the state with TLS socket
        // by handling data on the TLS socket instead
        tlsSocket.on('data', async (chunk) => {
          try {
            const lines = chunk.toString().split(/\r?\n/);

            for (let line of lines) {
              line = line.trim();

            if (isDataMode) {
              if (line === '.') {
                isDataMode = false;
                try {
                  await this.handleEmailData(tlsSocket, sender, recipients, rawData, mode, port, authenticatedUsername, {
                    ip: clientIp,
                    helo: helo
                  });
                } catch (error) {
                  logger.error('Error handling email data', { error: error.message, port });
                  tlsSocket.write('550 Failed to process email\r\n');
                }

                // Reset state
                rawData = '';
                sender = '';
                recipients = [];
              } else {
                if (rawData.length === 0 && line === '') {
                  continue;
                }
                rawData += line + '\r\n';
              }
              continue;
            }

              if (!line) continue;

            try {
              await this.handleSMTPCommand(tlsSocket, line, state, mode, port);
            } catch (error) {
              logger.error('Error handling SMTP command', { error: error.message, port, line });
              try {
                tlsSocket.write('550 Internal server error\r\n');
              } catch (writeError) {
                logger.error('Error writing to socket after command error', { error: writeError.message, port });
              }
            }
          }
          } catch (error) {
            logger.error('Error processing socket data', { error: error.message, port });
            try {
              tlsSocket.write('550 Internal server error\r\n');
            } catch (writeError) {
              logger.error('Error writing to socket', { error: writeError.message, port });
            }
          }
        });

        tlsSocket.on('end', () => {
          logger.info(`❌ Client disconnected from port ${port} (TLS)`);
        });

      } catch (error) {
        logger.error('STARTTLS upgrade failed', { error: error.message, port });
        try {
          socket.write('454 TLS not available\r\n');
        } catch (e) {
          // Socket might already be closed
        }
      }

      // Don't process any more commands on the plain socket
      return;

    } else if (line.startsWith('AUTH')) {
      // Handle authentication
      if (line.startsWith('AUTH PLAIN')) {
        const authData = SMTPAuthService.parseAuthPlain(line);
        if (authData) {
          try {
            const authResult = await SMTPAuthService.authenticateUser(authData.username, authData.password);
            if (authResult.success) {
              state.setAuthenticated(true, authResult.username);
              socket.write('235 Authentication successful\r\n');
            } else {
              socket.write('535 Authentication failed\r\n');
            }
          } catch (error) {
            logger.error('Authentication error during PLAIN', { error: error.message });
            socket.write('535 Authentication failed\r\n');
          }
        } else {
          socket.write('501 Invalid authentication data\r\n');
        }
      } else if (line.startsWith('AUTH LOGIN')) {
        state.setAuthState('waiting_username');
        socket.write('334 VXNlcm5hbWU6\r\n'); // Base64 for "Username:"
      } else {
        socket.write('504 Authentication mechanism not supported\r\n');
      }
    } else if (line.startsWith('MAIL FROM:')) {
      const sender = line.slice(10).replace(/[<>]/g, '').trim();
      
      // Check if authentication is required for this port
      if (SMTPAuthService.isAuthenticationRequired(port) && !state.isAuthenticated()) {
        socket.write('530 Authentication required\r\n');
        return;
      }

      // For authenticated users, validate sender
      if (state.isAuthenticated() && !SMTPAuthService.validateSenderForAuthenticatedUser(sender, state.getAuthenticatedUsername())) {
        socket.write('553 Sender not authorized\r\n');
        return;
      }

      if (EmailProcessor.validateSender(sender)) {
        state.setSender(sender);
        socket.write('250 OK\r\n');
      } else {
        socket.write('501 Invalid sender\r\n');
      }
    } else if (line.startsWith('RCPT TO:')) {
      const rcpt = line.slice(8).replace(/[<>]/g, '').trim();
      if (EmailProcessor.validateRecipients([rcpt])) {
        state.addRecipient(rcpt);
        socket.write('250 OK\r\n');
      } else {
        socket.write('501 Invalid recipient\r\n');
      }
    } else if (line === 'DATA') {
      state.setDataMode(true);
      socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
    } else if (line === 'QUIT') {
      socket.write('221 Bye\r\n');
      socket.end();
    } else if (line === 'RSET') {
      // Reset the current transaction
      state.setSender('');
      state.clearRecipients(); // Clear recipients array
      state.setDataMode(false);
      socket.write('250 OK\r\n');
    } else {
      socket.write('502 Command not implemented\r\n');
    }
  }

  async handleEmailData(socket, sender, recipients, rawData, mode, port, authenticatedUsername, options = {}) {
    try {
      // Determine mail type based on authentication and port
      let mailType = 'inbound';

      if (authenticatedUsername) {
        // Authenticated connections are always outbound
        mailType = 'outbound';
      } else if (port === 587 || port === 465) {
        // Submission ports without auth - this shouldn't normally happen
        // but treat as outbound and let the auth check elsewhere handle it
        logger.warn('Unauthenticated mail on submission port', { port, sender });
        mailType = 'outbound';
      } else if (port === 25) {
        // Port 25 without auth is inbound
        mailType = 'inbound';
      }

      // Use separate variable for processed data to avoid mutation issues
      let processedData = rawData;

      // Check if rspamd scanning is enabled for this mail type
      if (RspamdService.isEnabled(mailType)) {
        logger.info('Scanning email with rspamd', {
          sender,
          recipients,
          mailType,
          port,
          authenticated: !!authenticatedUsername
        });

        // Scan email with rspamd
        const scanResult = await RspamdService.scanEmail(rawData, {
          sender,
          recipients,
          ip: options.ip,
          helo: options.helo
        });

        // Get action based on scan result
        const action = RspamdService.getAction(scanResult);

        logger.info('Rspamd scan action', {
          action: action.action,
          reason: action.reason,
          score: action.score,
          sender,
          recipients,
          mailType,
          port
        });

        // Handle reject action
        if (action.action === 'reject') {
          logger.warn('Email rejected by rspamd', {
            sender,
            recipients,
            score: action.score,
            threshold: action.threshold,
            mailType,
            port
          });
          socket.write(action.message + '\r\n');
          return;
        }

        // Handle greylist action
        if (action.action === 'greylist') {
          logger.info('Email greylisted by rspamd', {
            sender,
            recipients,
            score: action.score,
            threshold: action.threshold,
            mailType,
            port
          });
          socket.write(action.message + '\r\n');
          return;
        }

        // Add spam headers if needed
        if (action.addHeaders) {
          const headers = RspamdService.generateHeaders(scanResult);
          processedData = headers + rawData;
          logger.debug('Added spam headers to email');
        }
      }

      // Process email based on mode with processed data
      if (mode === 'forward' && this.forwarder) {
        // Forward email to external SMTP service
        await this.forwarder.forwardEmail(sender, recipients, processedData);
        socket.write('250 Message forwarded successfully\r\n');
      } else if (authenticatedUsername) {
        // Authenticated user - process as outgoing email
        await EmailProcessor.processEmail(sender, recipients, processedData, authenticatedUsername);
        socket.write('250 Message accepted for delivery\r\n');
      } else {
        // Unauthenticated user - process as incoming email
        await IncomingEmailProcessor.processIncomingEmail(sender, recipients, processedData, 'SMTP');
        socket.write('250 Message accepted\r\n');
      }
    } catch (error) {
      logger.error(`❌ Failed to process email on port ${port}`, { error: error.message });
      socket.write('550 Failed to process email\r\n');
    }
  }

  stop() {
    for (const [port, { server }] of this.servers) {
      server.close();
      logger.info(`🛑 SMTP server stopped on port ${port}`);
    }
    this.servers.clear();
  }

  getServerStats() {
    const stats = {};
    for (const [port, { mode }] of this.servers) {
      stats[port] = {
        mode,
        status: 'running'
      };
    }
    return stats;
  }
}

module.exports = MultiPortSMTPServer; 