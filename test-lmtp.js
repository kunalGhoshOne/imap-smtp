const net = require('net');

class LMTPClient {
  constructor(host = 'localhost', port = 24) {
    this.host = host;
    this.port = port;
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.port, this.host, () => {
        console.log('📧 Connected to LMTP server');
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

  async sendEmail(from, to, subject, body) {
    try {
      // LHLO command
      await this.sendCommand(`LHLO test-client`);
      
      // MAIL command
      await this.sendCommand(`MAIL FROM:<${from}>`);
      
      // RCPT command
      await this.sendCommand(`RCPT TO:<${to}>`);
      
      // DATA command
      await this.sendCommand('DATA');
      
      // Email content
      const emailContent = `From: ${from}
To: ${to}
Subject: ${subject}
Date: ${new Date().toUTCString()}
Content-Type: text/plain; charset=UTF-8

${body}

.`;
      
      await this.sendCommand(emailContent);
      
      // QUIT command
      await this.sendCommand('QUIT');
      
      console.log('✅ Email sent successfully');
      
    } catch (error) {
      console.error('❌ Error sending email:', error.message);
    }
  }

  close() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

async function testLMTP() {
  const client = new LMTPClient();
  
  try {
    await client.connect();
    
    // Test email
    await client.sendEmail(
      'sender@example.com',
      'recipient@example.com',
      'Test LMTP Email',
      'This is a test email sent via LMTP protocol.\n\nBest regards,\nTest Client'
    );
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Wait a bit before closing to see server responses
    setTimeout(() => {
      client.close();
      process.exit(0);
    }, 2000);
  }
}

// Run the test
console.log('🚀 Starting LMTP test...');
testLMTP(); 