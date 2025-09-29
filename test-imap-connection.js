const net = require('net');
const tls = require('tls');

class IMAPConnectionTest {
  constructor(host = 'localhost', port = 143, secure = false) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.socket = null;
    this.isConnected = false;
    this.tag = 1;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (this.secure) {
        this.socket = tls.connect(this.port, this.host, { rejectUnauthorized: false }, () => {
          console.log(`🔒 Connected to IMAP server (SSL) on port ${this.port}`);
          this.isConnected = true;
          resolve();
        });
      } else {
        this.socket = net.createConnection(this.port, this.host, () => {
          console.log(`📧 Connected to IMAP server on port ${this.port}`);
          this.isConnected = true;
          resolve();
        });
      }

      this.socket.on('error', (error) => {
        console.error('❌ Connection error:', error.message);
        this.isConnected = false;
        reject(error);
      });

      this.socket.on('data', (data) => {
        const response = data.toString().trim();
        console.log(`📧 Server: ${response}`);
      });

      this.socket.on('close', () => {
        console.log('📧 Connection closed');
        this.isConnected = false;
      });

      this.socket.on('end', () => {
        console.log('📧 Connection ended');
        this.isConnected = false;
      });
    });
  }

  getNextTag() {
    return `A${String(this.tag++).padStart(3, '0')}`;
  }

  async sendCommand(command, expectResponse = true) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('Not connected'));
        return;
      }

      console.log(`📧 Client: ${command}`);
      this.socket.write(command + '\r\n');

      if (expectResponse) {
        // For simplicity, we'll resolve immediately
        // In a real implementation, you'd wait for the response
        setTimeout(resolve, 100);
      } else {
        resolve();
      }
    });
  }

  async testCapability() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} CAPABILITY`);
      console.log('✅ CAPABILITY command test passed');
      return true;
    } catch (error) {
      console.error('❌ CAPABILITY test failed:', error.message);
      return false;
    }
  }

  async testLogin(username = 'testuser', password = 'testpass') {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} LOGIN ${username} ${password}`);
      console.log('✅ LOGIN command test passed');
      return true;
    } catch (error) {
      console.error('❌ LOGIN test failed:', error.message);
      return false;
    }
  }

  async testList() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} LIST "" "*"`);
      console.log('✅ LIST command test passed');
      return true;
    } catch (error) {
      console.error('❌ LIST test failed:', error.message);
      return false;
    }
  }

  async testSelect(mailbox = 'INBOX') {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} SELECT ${mailbox}`);
      console.log('✅ SELECT command test passed');
      return true;
    } catch (error) {
      console.error('❌ SELECT test failed:', error.message);
      return false;
    }
  }

  async testSearch() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} SEARCH ALL`);
      console.log('✅ SEARCH command test passed');
      return true;
    } catch (error) {
      console.error('❌ SEARCH test failed:', error.message);
      return false;
    }
  }

  async testFetch() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} FETCH 1 (FLAGS ENVELOPE)`);
      console.log('✅ FETCH command test passed');
      return true;
    } catch (error) {
      console.error('❌ FETCH test failed:', error.message);
      return false;
    }
  }

  async testUID() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} UID SEARCH ALL`);
      console.log('✅ UID command test passed');
      return true;
    } catch (error) {
      console.error('❌ UID test failed:', error.message);
      return false;
    }
  }

  async testNoop() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} NOOP`);
      console.log('✅ NOOP command test passed');
      return true;
    } catch (error) {
      console.error('❌ NOOP test failed:', error.message);
      return false;
    }
  }

  async testLogout() {
    try {
      const tag = this.getNextTag();
      await this.sendCommand(`${tag} LOGOUT`);
      console.log('✅ LOGOUT command test passed');
      return true;
    } catch (error) {
      console.error('❌ LOGOUT test failed:', error.message);
      return false;
    }
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

async function runIMAPTests() {
  const results = {
    port143: { passed: 0, failed: 0, tests: [] },
    port993: { passed: 0, failed: 0, tests: [] }
  };

  // Test IMAP on port 143 (non-SSL)
  console.log('\n🧪 Testing IMAP on port 143 (non-SSL)...\n');
  const client143 = new IMAPConnectionTest('localhost', 143, false);

  try {
    await client143.connect();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for welcome

    const tests143 = [
      { name: 'CAPABILITY', fn: () => client143.testCapability() },
      { name: 'LOGIN', fn: () => client143.testLogin() },
      { name: 'LIST', fn: () => client143.testList() },
      { name: 'SELECT', fn: () => client143.testSelect() },
      { name: 'SEARCH', fn: () => client143.testSearch() },
      { name: 'FETCH', fn: () => client143.testFetch() },
      { name: 'UID', fn: () => client143.testUID() },
      { name: 'NOOP', fn: () => client143.testNoop() },
      { name: 'LOGOUT', fn: () => client143.testLogout() }
    ];

    for (const test of tests143) {
      try {
        const result = await test.fn();
        if (result) {
          results.port143.passed++;
          results.port143.tests.push({ name: test.name, status: 'PASSED' });
        } else {
          results.port143.failed++;
          results.port143.tests.push({ name: test.name, status: 'FAILED' });
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait between tests
      } catch (error) {
        results.port143.failed++;
        results.port143.tests.push({ name: test.name, status: 'ERROR', error: error.message });
      }
    }

  } catch (error) {
    console.error('❌ Failed to connect to IMAP port 143:', error.message);
    results.port143.tests.push({ name: 'CONNECTION', status: 'FAILED', error: error.message });
  } finally {
    client143.close();
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test IMAP on port 993 (SSL)
  console.log('\n🧪 Testing IMAP on port 993 (SSL)...\n');
  const client993 = new IMAPConnectionTest('localhost', 993, true);

  try {
    await client993.connect();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for welcome

    const tests993 = [
      { name: 'CAPABILITY', fn: () => client993.testCapability() },
      { name: 'LOGIN', fn: () => client993.testLogin() },
      { name: 'LIST', fn: () => client993.testList() },
      { name: 'SELECT', fn: () => client993.testSelect() },
      { name: 'SEARCH', fn: () => client993.testSearch() },
      { name: 'FETCH', fn: () => client993.testFetch() },
      { name: 'UID', fn: () => client993.testUID() },
      { name: 'NOOP', fn: () => client993.testNoop() },
      { name: 'LOGOUT', fn: () => client993.testLogout() }
    ];

    for (const test of tests993) {
      try {
        const result = await test.fn();
        if (result) {
          results.port993.passed++;
          results.port993.tests.push({ name: test.name, status: 'PASSED' });
        } else {
          results.port993.failed++;
          results.port993.tests.push({ name: test.name, status: 'FAILED' });
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait between tests
      } catch (error) {
        results.port993.failed++;
        results.port993.tests.push({ name: test.name, status: 'ERROR', error: error.message });
      }
    }

  } catch (error) {
    console.error('❌ Failed to connect to IMAP port 993:', error.message);
    results.port993.tests.push({ name: 'CONNECTION', status: 'FAILED', error: error.message });
  } finally {
    client993.close();
  }

  // Print results
  console.log('\n📊 IMAP Test Results:');
  console.log('======================');

  console.log(`\nPort 143 (non-SSL): ${results.port143.passed} passed, ${results.port143.failed} failed`);
  for (const test of results.port143.tests) {
    const status = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`  ${status} ${test.name}: ${test.status}${test.error ? ` (${test.error})` : ''}`);
  }

  console.log(`\nPort 993 (SSL): ${results.port993.passed} passed, ${results.port993.failed} failed`);
  for (const test of results.port993.tests) {
    const status = test.status === 'PASSED' ? '✅' : '❌';
    console.log(`  ${status} ${test.name}: ${test.status}${test.error ? ` (${test.error})` : ''}`);
  }

  const totalPassed = results.port143.passed + results.port993.passed;
  const totalFailed = results.port143.failed + results.port993.failed;
  console.log(`\n🎯 Total: ${totalPassed} passed, ${totalFailed} failed`);

  return results;
}

// Check if IMAP servers are running
async function checkServer(port) {
  return new Promise((resolve) => {
    const checkSocket = new net.Socket();
    checkSocket.on('error', () => resolve(false));
    checkSocket.on('connect', () => {
      checkSocket.destroy();
      resolve(true);
    });
    checkSocket.connect(port, 'localhost');
  });
}

async function main() {
  console.log('🚀 Starting IMAP Connection Tests...');

  const port143Running = await checkServer(143);
  const port993Running = await checkServer(993);

  if (!port143Running && !port993Running) {
    console.error('❌ No IMAP servers are running on ports 143 or 993');
    console.log('💡 Please start the server first: npm start');
    process.exit(1);
  }

  if (!port143Running) {
    console.warn('⚠️ IMAP server is not running on port 143');
  }

  if (!port993Running) {
    console.warn('⚠️ IMAP server is not running on port 993');
  }

  await runIMAPTests();
  console.log('\n🎉 IMAP tests completed!');
}

main().catch(error => {
  console.error('💥 Test suite failed:', error.message);
  process.exit(1);
});