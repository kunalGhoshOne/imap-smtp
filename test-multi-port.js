const net = require('net');
const tls = require('tls');
const fs = require('fs');

// Test configuration
const testConfig = {
  port25: 25,    // Forwarding port
  port587: 587,  // STARTTLS port
  port465: 465   // SSL port
};

// Test email data
const testEmail = {
  sender: 'test@example.com',
  recipient: 'recipient@example.com',
  subject: 'Multi-Port SMTP Test',
  body: `From: test@example.com
To: recipient@example.com
Subject: Multi-Port SMTP Test
Date: ${new Date().toISOString()}
Content-Type: text/plain; charset=UTF-8

This is a test email sent through multi-port SMTP server.

Ports tested:
- Port 25: Forwarding to external SMTP
- Port 587: STARTTLS encryption
- Port 465: SSL encryption

Best regards,
Test System`
};

// Test functions for different ports
async function testPort25() {
  console.log('\n🔌 Testing Port 25 (Forwarding)...');
  console.log('─'.repeat(50));
  
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    socket.on('connect', () => {
      console.log('📧 Connected to port 25');
    });

    socket.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        response += trimmedLine + '\n';
        console.log(`📨 Server: ${trimmedLine}`);

        // Handle SMTP responses
        if (trimmedLine.startsWith('220')) {
          console.log('📤 Sending: EHLO example.com');
          socket.write('EHLO example.com\r\n');
        } else if (trimmedLine.startsWith('250') && !response.includes('MAIL FROM')) {
          console.log(`📤 Sending: MAIL FROM:<${testEmail.sender}>`);
          socket.write(`MAIL FROM:<${testEmail.sender}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('MAIL FROM') && !response.includes('RCPT TO')) {
          console.log(`📤 Sending: RCPT TO:<${testEmail.recipient}>`);
          socket.write(`RCPT TO:<${testEmail.recipient}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('RCPT TO') && !response.includes('DATA')) {
          console.log('📤 Sending: DATA');
          socket.write('DATA\r\n');
        } else if (trimmedLine.startsWith('354')) {
          console.log('📤 Sending email content...');
          socket.write(testEmail.body + '\r\n.\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('DATA')) {
          console.log('📤 Sending: QUIT');
          socket.write('QUIT\r\n');
        } else if (trimmedLine.startsWith('221')) {
          console.log('✅ Email forwarded successfully via port 25!');
          socket.end();
          resolve(response);
        } else if (trimmedLine.startsWith('4') || trimmedLine.startsWith('5')) {
          console.error(`❌ SMTP Error: ${trimmedLine}`);
          socket.end();
          reject(new Error(`SMTP Error: ${trimmedLine}`));
        }
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Connection error:', error.message);
      reject(error);
    });

    socket.on('close', () => {
      console.log('🔌 Connection closed');
    });

    console.log('🔌 Connecting to port 25...');
    socket.connect(testConfig.port25, 'localhost');
  });
}

async function testPort587() {
  console.log('\n🔌 Testing Port 587 (STARTTLS)...');
  console.log('─'.repeat(50));
  
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';
    let tlsUpgraded = false;

    socket.on('connect', () => {
      console.log('📧 Connected to port 587');
    });

    socket.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        response += trimmedLine + '\n';
        console.log(`📨 Server: ${trimmedLine}`);

        // Handle SMTP responses
        if (trimmedLine.startsWith('220')) {
          console.log('📤 Sending: EHLO example.com');
          socket.write('EHLO example.com\r\n');
        } else if (trimmedLine.startsWith('250') && !tlsUpgraded) {
          console.log('📤 Sending: STARTTLS');
          socket.write('STARTTLS\r\n');
        } else if (trimmedLine.startsWith('220') && !tlsUpgraded) {
          console.log('🔒 Starting TLS upgrade...');
          tlsUpgraded = true;
          
          // Upgrade to TLS
          const tlsSocket = tls.connect({
            socket: socket,
            rejectUnauthorized: false
          });

          tlsSocket.on('secure', () => {
            console.log('🔒 TLS connection established');
            tlsSocket.write('EHLO example.com\r\n');
          });

          tlsSocket.on('data', (tlsChunk) => {
            const tlsLines = tlsChunk.toString().split(/\r?\n/);
            
            for (const tlsLine of tlsLines) {
              const trimmedTlsLine = tlsLine.trim();
              if (!trimmedTlsLine) continue;

              console.log(`📨 Server (TLS): ${trimmedTlsLine}`);

              if (trimmedTlsLine.startsWith('250')) {
                console.log(`📤 Sending: MAIL FROM:<${testEmail.sender}>`);
                tlsSocket.write(`MAIL FROM:<${testEmail.sender}>\r\n`);
              } else if (trimmedTlsLine.startsWith('250') && response.includes('MAIL FROM') && !response.includes('RCPT TO')) {
                console.log(`📤 Sending: RCPT TO:<${testEmail.recipient}>`);
                tlsSocket.write(`RCPT TO:<${testEmail.recipient}>\r\n`);
              } else if (trimmedTlsLine.startsWith('250') && response.includes('RCPT TO') && !response.includes('DATA')) {
                console.log('📤 Sending: DATA');
                tlsSocket.write('DATA\r\n');
              } else if (trimmedTlsLine.startsWith('354')) {
                console.log('📤 Sending email content...');
                tlsSocket.write(testEmail.body + '\r\n.\r\n');
              } else if (trimmedTlsLine.startsWith('250') && response.includes('DATA')) {
                console.log('📤 Sending: QUIT');
                tlsSocket.write('QUIT\r\n');
              } else if (trimmedTlsLine.startsWith('221')) {
                console.log('✅ Email sent successfully via port 587 (STARTTLS)!');
                tlsSocket.end();
                resolve(response);
              }
            }
          });
        }
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Connection error:', error.message);
      reject(error);
    });

    console.log('🔌 Connecting to port 587...');
    socket.connect(testConfig.port587, 'localhost');
  });
}

async function testPort465() {
  console.log('\n🔌 Testing Port 465 (SSL)...');
  console.log('─'.repeat(50));
  
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      host: 'localhost',
      port: testConfig.port465,
      rejectUnauthorized: false
    });

    let response = '';

    tlsSocket.on('secureConnect', () => {
      console.log('🔒 SSL connection established');
    });

    tlsSocket.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        response += trimmedLine + '\n';
        console.log(`📨 Server: ${trimmedLine}`);

        // Handle SMTP responses
        if (trimmedLine.startsWith('220')) {
          console.log('📤 Sending: EHLO example.com');
          tlsSocket.write('EHLO example.com\r\n');
        } else if (trimmedLine.startsWith('250') && !response.includes('MAIL FROM')) {
          console.log(`📤 Sending: MAIL FROM:<${testEmail.sender}>`);
          tlsSocket.write(`MAIL FROM:<${testEmail.sender}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('MAIL FROM') && !response.includes('RCPT TO')) {
          console.log(`📤 Sending: RCPT TO:<${testEmail.recipient}>`);
          tlsSocket.write(`RCPT TO:<${testEmail.recipient}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('RCPT TO') && !response.includes('DATA')) {
          console.log('📤 Sending: DATA');
          tlsSocket.write('DATA\r\n');
        } else if (trimmedLine.startsWith('354')) {
          console.log('📤 Sending email content...');
          tlsSocket.write(testEmail.body + '\r\n.\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('DATA')) {
          console.log('📤 Sending: QUIT');
          tlsSocket.write('QUIT\r\n');
        } else if (trimmedLine.startsWith('221')) {
          console.log('✅ Email sent successfully via port 465 (SSL)!');
          tlsSocket.end();
          resolve(response);
        } else if (trimmedLine.startsWith('4') || trimmedLine.startsWith('5')) {
          console.error(`❌ SMTP Error: ${trimmedLine}`);
          tlsSocket.end();
          reject(new Error(`SMTP Error: ${trimmedLine}`));
        }
      }
    });

    tlsSocket.on('error', (error) => {
      console.error('❌ SSL connection error:', error.message);
      reject(error);
    });

    tlsSocket.on('close', () => {
      console.log('🔌 SSL connection closed');
    });

    console.log('🔌 Connecting to port 465 (SSL)...');
  });
}

// Run all tests
async function runAllTests() {
  try {
    console.log('🧪 Starting Multi-Port SMTP Tests...\n');
    
    // Test port 25 (forwarding)
    try {
      await testPort25();
    } catch (error) {
      console.error('❌ Port 25 test failed:', error.message);
    }

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test port 587 (STARTTLS)
    try {
      await testPort587();
    } catch (error) {
      console.error('❌ Port 587 test failed:', error.message);
    }

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test port 465 (SSL)
    try {
      await testPort465();
    } catch (error) {
      console.error('❌ Port 465 test failed:', error.message);
    }

    console.log('\n🎉 Multi-port SMTP tests completed!');
    console.log('\n📊 Check the queue dashboard at: http://localhost:3000');
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  }
}

// Check if server is running
const checkServer = new net.Socket();
checkServer.on('error', () => {
  console.error('❌ SMTP server is not running');
  console.log('💡 Please start the server first: npm start');
  process.exit(1);
});

checkServer.connect(25, 'localhost', () => {
  checkServer.destroy();
  runAllTests();
}); 