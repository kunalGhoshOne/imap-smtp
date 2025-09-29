const net = require('net');
const tls = require('tls');

class SMTPConnectionTest {
  constructor(host = 'localhost', port = 2525, secure = false) {
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.socket = null;
    this.isConnected = false;
    this.responses = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (this.secure) {
        this.socket = tls.connect(this.port, this.host, { rejectUnauthorized: false }, () => {
          console.log(`🔒 Connected to SMTP server (SSL) on port ${this.port}`);
          this.isConnected = true;
          resolve();
        });
      } else {
        this.socket = net.createConnection(this.port, this.host, () => {
          console.log(`📧 Connected to SMTP server on port ${this.port}`);
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
        this.responses.push(response);
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

  async sendCommand(command, expectResponse = true) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('Not connected'));
        return;
      }

      console.log(`📧 Client: ${command}`);
      this.socket.write(command + '\r\n');

      if (expectResponse) {
        // Wait for response
        setTimeout(resolve, 500);
      } else {
        resolve();
      }
    });
  }

  getLastResponse() {
    return this.responses[this.responses.length - 1] || '';
  }

  async testEHLO() {
    try {
      await this.sendCommand('EHLO test-client.example.com');
      const response = this.getLastResponse();
      if (response.startsWith('250')) {
        console.log('✅ EHLO command test passed');
        return true;
      } else {
        console.error('❌ EHLO failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ EHLO test failed:', error.message);
      return false;
    }
  }

  async testHELO() {
    try {
      await this.sendCommand('HELO test-client.example.com');
      const response = this.getLastResponse();
      if (response.startsWith('250')) {
        console.log('✅ HELO command test passed');
        return true;
      } else {
        console.error('❌ HELO failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ HELO test failed:', error.message);
      return false;
    }
  }

  async testMAIL(sender = 'test@example.com') {
    try {
      await this.sendCommand(`MAIL FROM:<${sender}>`);
      const response = this.getLastResponse();
      if (response.startsWith('250')) {
        console.log('✅ MAIL FROM command test passed');
        return true;
      } else {
        console.error('❌ MAIL FROM failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ MAIL FROM test failed:', error.message);
      return false;
    }
  }

  async testRCPT(recipient = 'recipient@example.com') {
    try {
      await this.sendCommand(`RCPT TO:<${recipient}>`);
      const response = this.getLastResponse();
      if (response.startsWith('250')) {
        console.log('✅ RCPT TO command test passed');
        return true;
      } else {
        console.error('❌ RCPT TO failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ RCPT TO test failed:', error.message);
      return false;
    }
  }

  async testDATA() {
    try {
      await this.sendCommand('DATA');
      const response = this.getLastResponse();
      if (response.startsWith('354')) {
        console.log('✅ DATA command test passed');
        return true;
      } else {
        console.error('❌ DATA failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ DATA test failed:', error.message);
      return false;
    }
  }

  async testEmailContent() {
    try {
      const emailContent = `From: test@example.com
To: recipient@example.com
Subject: Test Email - SMTP Connection Test
Date: ${new Date().toUTCString()}
Content-Type: text/plain; charset=UTF-8

This is a test email sent during SMTP connection testing.

Features being tested:
- SMTP protocol handling
- Email content transmission
- Message termination

Best regards,
SMTP Test Suite`;

      await this.sendCommand(emailContent);
      await this.sendCommand('.');
      const response = this.getLastResponse();
      if (response.startsWith('250')) {
        console.log('✅ Email content transmission test passed');
        return true;
      } else {
        console.error('❌ Email content transmission failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ Email content test failed:', error.message);
      return false;
    }
  }

  async testRSET() {
    try {
      await this.sendCommand('RSET');
      const response = this.getLastResponse();
      if (response.startsWith('250')) {
        console.log('✅ RSET command test passed');
        return true;
      } else {
        console.error('❌ RSET failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ RSET test failed:', error.message);
      return false;
    }
  }

  async testNOOP() {
    try {
      await this.sendCommand('NOOP');
      const response = this.getLastResponse();
      if (response.startsWith('250') || response.startsWith('502')) {
        console.log('✅ NOOP command test passed');
        return true;
      } else {
        console.error('❌ NOOP failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ NOOP test failed:', error.message);
      return false;
    }
  }

  async testQUIT() {
    try {
      await this.sendCommand('QUIT');
      const response = this.getLastResponse();
      if (response.startsWith('221')) {
        console.log('✅ QUIT command test passed');
        return true;
      } else {
        console.error('❌ QUIT failed - unexpected response');
        return false;
      }
    } catch (error) {
      console.error('❌ QUIT test failed:', error.message);
      return false;
    }
  }

  async testFullEmailTransaction() {
    try {
      console.log('\n🔄 Testing full email transaction...');

      // Reset responses
      this.responses = [];

      await this.sendCommand('EHLO test-full-transaction.example.com');
      await new Promise(resolve => setTimeout(resolve, 200));

      await this.sendCommand('MAIL FROM:<fulltest@example.com>');
      await new Promise(resolve => setTimeout(resolve, 200));

      await this.sendCommand('RCPT TO:<recipient@example.com>');
      await new Promise(resolve => setTimeout(resolve, 200));

      await this.sendCommand('DATA');
      await new Promise(resolve => setTimeout(resolve, 200));

      const emailContent = `From: fulltest@example.com
To: recipient@example.com
Subject: Full Transaction Test
Date: ${new Date().toUTCString()}

This is a complete email transaction test.

Best regards,
Full Transaction Test`;

      await this.sendCommand(emailContent);
      await this.sendCommand('.');
      await new Promise(resolve => setTimeout(resolve, 200));

      const responses = this.responses.join('\n');
      const hasWelcome = responses.includes('220');
      const hasEhloOk = responses.includes('250');
      const hasDataStart = responses.includes('354');
      const hasAccepted = responses.split('250').length >= 4; // EHLO, MAIL, RCPT, final acceptance

      if (hasWelcome && hasEhloOk && hasDataStart && hasAccepted) {
        console.log('✅ Full email transaction test passed');
        return true;
      } else {
        console.error('❌ Full email transaction failed');
        console.log('Debug - responses:', responses);
        return false;
      }

    } catch (error) {
      console.error('❌ Full email transaction test failed:', error.message);
      return false;
    }
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

async function runSMTPTests() {
  const results = {
    port2525: { passed: 0, failed: 0, tests: [] },
    port25: { passed: 0, failed: 0, tests: [] },
    port587: { passed: 0, failed: 0, tests: [] },
    port465: { passed: 0, failed: 0, tests: [] }
  };

  const ports = [
    { port: 2525, name: 'port2525', secure: false, desc: 'Development SMTP' },
    { port: 25, name: 'port25', secure: false, desc: 'Standard SMTP' },
    { port: 587, name: 'port587', secure: false, desc: 'Submission' },
    { port: 465, name: 'port465', secure: true, desc: 'SMTP over SSL' }
  ];

  for (const portConfig of ports) {
    console.log(`\n🧪 Testing SMTP on port ${portConfig.port} (${portConfig.desc})...\n`);

    const client = new SMTPConnectionTest('localhost', portConfig.port, portConfig.secure);

    try {
      await client.connect();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for welcome

      const tests = [
        { name: 'EHLO', fn: () => client.testEHLO() },
        { name: 'RSET', fn: () => client.testRSET() },
        { name: 'HELO', fn: () => client.testHELO() },
        { name: 'MAIL_FROM', fn: () => client.testMAIL() },
        { name: 'RCPT_TO', fn: () => client.testRCPT() },
        { name: 'DATA', fn: () => client.testDATA() },
        { name: 'EMAIL_CONTENT', fn: () => client.testEmailContent() },
        { name: 'NOOP', fn: () => client.testNOOP() },
        { name: 'FULL_TRANSACTION', fn: () => client.testFullEmailTransaction() }
      ];

      for (const test of tests) {
        try {
          const result = await test.fn();
          if (result) {
            results[portConfig.name].passed++;
            results[portConfig.name].tests.push({ name: test.name, status: 'PASSED' });
          } else {
            results[portConfig.name].failed++;
            results[portConfig.name].tests.push({ name: test.name, status: 'FAILED' });
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait between tests
        } catch (error) {
          results[portConfig.name].failed++;
          results[portConfig.name].tests.push({ name: test.name, status: 'ERROR', error: error.message });
        }
      }

      // Test QUIT at the end
      try {
        const result = await client.testQUIT();
        if (result) {
          results[portConfig.name].passed++;
          results[portConfig.name].tests.push({ name: 'QUIT', status: 'PASSED' });
        } else {
          results[portConfig.name].failed++;
          results[portConfig.name].tests.push({ name: 'QUIT', status: 'FAILED' });
        }
      } catch (error) {
        results[portConfig.name].failed++;
        results[portConfig.name].tests.push({ name: 'QUIT', status: 'ERROR', error: error.message });
      }

    } catch (error) {
      console.error(`❌ Failed to connect to SMTP port ${portConfig.port}:`, error.message);
      results[portConfig.name].tests.push({
        name: 'CONNECTION',
        status: 'FAILED',
        error: error.message
      });
      results[portConfig.name].failed++;
    } finally {
      client.close();
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between port tests
  }

  // Print results
  console.log('\n📊 SMTP Test Results:');
  console.log('======================');

  for (const portConfig of ports) {
    const result = results[portConfig.name];
    console.log(`\nPort ${portConfig.port} (${portConfig.desc}): ${result.passed} passed, ${result.failed} failed`);

    for (const test of result.tests) {
      const status = test.status === 'PASSED' ? '✅' : '❌';
      console.log(`  ${status} ${test.name}: ${test.status}${test.error ? ` (${test.error})` : ''}`);
    }
  }

  const totalPassed = Object.values(results).reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);
  console.log(`\n🎯 Total: ${totalPassed} passed, ${totalFailed} failed`);

  return results;
}

// Check if SMTP server is running on a specific port
async function checkServer(port) {
  return new Promise((resolve) => {
    const checkSocket = new net.Socket();
    checkSocket.setTimeout(2000);

    checkSocket.on('error', () => resolve(false));
    checkSocket.on('timeout', () => {
      checkSocket.destroy();
      resolve(false);
    });
    checkSocket.on('connect', () => {
      checkSocket.destroy();
      resolve(true);
    });

    checkSocket.connect(port, 'localhost');
  });
}

async function main() {
  console.log('🚀 Starting SMTP Connection Tests...');

  // Check which ports are available
  const ports = [2525, 25, 587, 465];
  const availablePorts = [];

  for (const port of ports) {
    const isRunning = await checkServer(port);
    if (isRunning) {
      availablePorts.push(port);
    } else {
      console.warn(`⚠️ SMTP server is not running on port ${port}`);
    }
  }

  if (availablePorts.length === 0) {
    console.error('❌ No SMTP servers are running on any expected ports (25, 587, 465, 2525)');
    console.log('💡 Please start the server first: npm start');
    process.exit(1);
  }

  console.log(`🎯 Found SMTP servers running on ports: ${availablePorts.join(', ')}`);

  await runSMTPTests();
  console.log('\n🎉 SMTP tests completed!');
}

main().catch(error => {
  console.error('💥 Test suite failed:', error.message);
  process.exit(1);
});