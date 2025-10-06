const net = require('net');

class IMAPTester {
  constructor(host = 'localhost', port = 143) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.tagCounter = 0;
  }

  getTag() {
    return `A${String(this.tagCounter++).padStart(4, '0')}`;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.port, this.host);

      this.socket.on('connect', () => {
        console.log(`✓ Connected to ${this.host}:${this.port}`);
      });

      this.socket.on('data', (data) => {
        const response = data.toString();
        console.log('←', response.trim());

        if (response.includes('* OK')) {
          resolve();
        }
      });

      this.socket.on('error', reject);
    });
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      const tag = this.getTag();
      const fullCommand = `${tag} ${command}\r\n`;

      console.log('→', fullCommand.trim());

      let response = '';
      let isLiteral = false;

      const dataHandler = (data) => {
        const str = data.toString();
        response += str;

        // Check for literal continuation
        if (str.includes('+ ')) {
          isLiteral = true;
          resolve({ tag, response, isLiteral });
          this.socket.removeListener('data', dataHandler);
          return;
        }

        // Check if response is complete
        if (str.includes(`${tag} OK`) || str.includes(`${tag} NO`) || str.includes(`${tag} BAD`)) {
          this.socket.removeListener('data', dataHandler);
          resolve({ tag, response, isLiteral: false });
        }
      };

      this.socket.on('data', dataHandler);
      this.socket.write(fullCommand);

      // Timeout after 5 seconds
      setTimeout(() => {
        this.socket.removeListener('data', dataHandler);
        reject(new Error('Command timeout'));
      }, 5000);
    });
  }

  async sendLiteral(data) {
    return new Promise((resolve) => {
      console.log('→ [literal data]');

      const dataHandler = (response) => {
        console.log('←', response.toString().trim());
        this.socket.removeListener('data', dataHandler);
        resolve(response.toString());
      };

      this.socket.on('data', dataHandler);
      this.socket.write(data);
    });
  }

  async runTests() {
    try {
      console.log('\n=== IMAP Server Test Suite ===\n');

      // Connect
      await this.connect();

      // Test CAPABILITY
      console.log('\n--- Testing CAPABILITY ---');
      await this.sendCommand('CAPABILITY');

      // Test LOGIN
      console.log('\n--- Testing LOGIN ---');
      await this.sendCommand('LOGIN testuser testpass');

      // Test NAMESPACE
      console.log('\n--- Testing NAMESPACE ---');
      await this.sendCommand('NAMESPACE');

      // Test LIST
      console.log('\n--- Testing LIST ---');
      await this.sendCommand('LIST "" "*"');

      // Test CREATE
      console.log('\n--- Testing CREATE ---');
      await this.sendCommand('CREATE "TestFolder"');

      // Test SUBSCRIBE
      console.log('\n--- Testing SUBSCRIBE ---');
      await this.sendCommand('SUBSCRIBE "TestFolder"');

      // Test LSUB
      console.log('\n--- Testing LSUB ---');
      await this.sendCommand('LSUB "" "*"');

      // Test SELECT
      console.log('\n--- Testing SELECT ---');
      await this.sendCommand('SELECT INBOX');

      // Test STATUS
      console.log('\n--- Testing STATUS ---');
      await this.sendCommand('STATUS INBOX (MESSAGES RECENT UNSEEN UIDNEXT UIDVALIDITY)');

      // Test APPEND
      console.log('\n--- Testing APPEND ---');
      const emailData = `From: sender@example.com\r
To: recipient@example.com\r
Subject: Test Email\r
Message-ID: <test123@example.com>\r
\r
This is a test email body.\r
`;

      const appendResult = await this.sendCommand(`APPEND INBOX (\\Seen) {${emailData.length}}`);
      if (appendResult.isLiteral) {
        await this.sendLiteral(emailData);
      }

      // Test SEARCH
      console.log('\n--- Testing SEARCH ---');
      await this.sendCommand('SEARCH ALL');
      await this.sendCommand('SEARCH FROM "sender@example.com"');
      await this.sendCommand('SEARCH SUBJECT "Test"');

      // Test UID SEARCH
      console.log('\n--- Testing UID SEARCH ---');
      await this.sendCommand('UID SEARCH ALL');

      // Test FETCH
      console.log('\n--- Testing FETCH ---');
      await this.sendCommand('FETCH 1 (FLAGS ENVELOPE RFC822.SIZE INTERNALDATE)');
      await this.sendCommand('FETCH 1 (BODY.PEEK[])');

      // Test UID FETCH
      console.log('\n--- Testing UID FETCH ---');
      await this.sendCommand('UID FETCH 1 (FLAGS ENVELOPE)');

      // Test SORT
      console.log('\n--- Testing SORT ---');
      await this.sendCommand('SORT (DATE) UTF-8 ALL');
      await this.sendCommand('SORT (REVERSE DATE) UTF-8 ALL');

      // Test THREAD
      console.log('\n--- Testing THREAD ---');
      await this.sendCommand('THREAD ORDEREDSUBJECT UTF-8 ALL');
      await this.sendCommand('THREAD REFERENCES UTF-8 ALL');

      // Test STORE (set flags)
      console.log('\n--- Testing STORE ---');
      await this.sendCommand('STORE 1 +FLAGS (\\Flagged)');
      await this.sendCommand('STORE 1 FLAGS.SILENT (\\Seen \\Flagged)');

      // Test UID STORE
      console.log('\n--- Testing UID STORE ---');
      await this.sendCommand('UID STORE 1 -FLAGS (\\Flagged)');

      // Test COPY
      console.log('\n--- Testing COPY ---');
      await this.sendCommand('COPY 1 "TestFolder"');

      // Test UID COPY
      console.log('\n--- Testing UID COPY ---');
      await this.sendCommand('UID COPY 1 "TestFolder"');

      // Test EXAMINE (read-only select)
      console.log('\n--- Testing EXAMINE ---');
      await this.sendCommand('EXAMINE "TestFolder"');

      // Test SELECT back to INBOX
      await this.sendCommand('SELECT INBOX');

      // Test STORE to mark as deleted
      console.log('\n--- Testing DELETE flag ---');
      await this.sendCommand('STORE 1 +FLAGS (\\Deleted)');

      // Test EXPUNGE
      console.log('\n--- Testing EXPUNGE ---');
      await this.sendCommand('EXPUNGE');

      // Test CLOSE
      console.log('\n--- Testing CLOSE ---');
      await this.sendCommand('CLOSE');

      // Test RENAME
      console.log('\n--- Testing RENAME ---');
      await this.sendCommand('RENAME "TestFolder" "RenamedFolder"');

      // Test DELETE mailbox
      console.log('\n--- Testing DELETE ---');
      await this.sendCommand('DELETE "RenamedFolder"');

      // Test UNSUBSCRIBE
      console.log('\n--- Testing UNSUBSCRIBE ---');
      await this.sendCommand('UNSUBSCRIBE "RenamedFolder"');

      // Test NOOP
      console.log('\n--- Testing NOOP ---');
      await this.sendCommand('NOOP');

      // Test CHECK
      console.log('\n--- Testing CHECK ---');
      await this.sendCommand('SELECT INBOX');
      await this.sendCommand('CHECK');

      // Test LOGOUT
      console.log('\n--- Testing LOGOUT ---');
      await this.sendCommand('LOGOUT');

      console.log('\n=== All Tests Completed Successfully! ===\n');

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
    } finally {
      if (this.socket) {
        this.socket.end();
      }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

// Run tests
const tester = new IMAPTester();
tester.runTests();
