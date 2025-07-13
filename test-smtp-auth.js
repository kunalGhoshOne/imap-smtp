const net = require('net');
const tls = require('tls');

class SMTPAuthTest {
  constructor(host = 'localhost', port = 587) {
    this.host = host;
    this.port = port;
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.port, this.host, () => {
        console.log(`📧 Connected to SMTP server on port ${this.port}`);
        resolve();
      });

      this.socket.on('error', (error) => {
        console.error('❌ Connection error:', error.message);
        reject(error);
      });

      this.socket.on('data', (data) => {
        const response = data.toString().trim();
        console.log(`📧 Server: ${response}`);
      });

      this.socket.on('close', () => {
        console.log('📧 Connection closed');
      });
    });
  }

  sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      console.log(`📧 Client: ${command}`);
      this.socket.write(command + '\r\n');
      resolve();
    });
  }

  async testAuthPlain(username, password) {
    try {
      // EHLO to get capabilities
      await this.sendCommand('EHLO test-client');
      
      // AUTH PLAIN with base64 encoded credentials
      const credentials = Buffer.from(`\0${username}\0${password}`).toString('base64');
      await this.sendCommand(`AUTH PLAIN ${credentials}`);
      
      // Try to send email
      await this.sendCommand('MAIL FROM:<test@example.com>');
      await this.sendCommand('RCPT TO:<recipient@example.com>');
      await this.sendCommand('DATA');
      
      const emailContent = `From: test@example.com
To: recipient@example.com
Subject: Test Email with AUTH PLAIN
Date: ${new Date().toUTCString()}

This is a test email sent using AUTH PLAIN authentication.

.`;
      
      await this.sendCommand(emailContent);
      
      // QUIT
      await this.sendCommand('QUIT');
      
      console.log('✅ AUTH PLAIN test completed');
      
    } catch (error) {
      console.error('❌ AUTH PLAIN test failed:', error.message);
    }
  }

  async testAuthLogin(username, password) {
    try {
      // EHLO to get capabilities
      await this.sendCommand('EHLO test-client');
      
      // AUTH LOGIN
      await this.sendCommand('AUTH LOGIN');
      
      // Send username (base64 encoded)
      const encodedUsername = Buffer.from(username).toString('base64');
      await this.sendCommand(encodedUsername);
      
      // Send password (base64 encoded)
      const encodedPassword = Buffer.from(password).toString('base64');
      await this.sendCommand(encodedPassword);
      
      // Try to send email
      await this.sendCommand('MAIL FROM:<test@example.com>');
      await this.sendCommand('RCPT TO:<recipient@example.com>');
      await this.sendCommand('DATA');
      
      const emailContent = `From: test@example.com
To: recipient@example.com
Subject: Test Email with AUTH LOGIN
Date: ${new Date().toUTCString()}

This is a test email sent using AUTH LOGIN authentication.

.`;
      
      await this.sendCommand(emailContent);
      
      // QUIT
      await this.sendCommand('QUIT');
      
      console.log('✅ AUTH LOGIN test completed');
      
    } catch (error) {
      console.error('❌ AUTH LOGIN test failed:', error.message);
    }
  }

  async testWithoutAuth() {
    try {
      // EHLO to get capabilities
      await this.sendCommand('EHLO test-client');
      
      // Try to send email without authentication (should fail on port 587/465)
      await this.sendCommand('MAIL FROM:<test@example.com>');
      
      // QUIT
      await this.sendCommand('QUIT');
      
      console.log('✅ No auth test completed');
      
    } catch (error) {
      console.error('❌ No auth test failed:', error.message);
    }
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

async function runTests() {
  const client = new SMTPAuthTest();
  
  try {
    await client.connect();
    
    // Wait for welcome message
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n🔐 Testing AUTH PLAIN...');
    await client.testAuthPlain('user@example.com', 'password123');
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🔐 Testing AUTH LOGIN...');
    await client.testAuthLogin('user@example.com', 'password123');
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🚫 Testing without authentication...');
    await client.testWithoutAuth();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Wait a bit before closing to see server responses
    setTimeout(() => {
      client.close();
      process.exit(0);
    }, 3000);
  }
}

// Run the tests
console.log('🚀 Starting SMTP Authentication Tests...');
console.log('Make sure you have created a mailbox with:');
console.log('POST http://localhost:8080/api/mailboxes');
console.log('Body: {"username": "user@example.com", "password": "password123"}');
console.log('Header: x-api-key: your-api-key\n');

runTests(); 