const net = require('net');

// Test email data
const testEmail = {
  sender: 'test@example.com',
  recipient: 'recipient@example.com',
  subject: 'Test Email from Modular SMTP Server',
  body: `From: test@example.com
To: recipient@example.com
Subject: Test Email from Modular SMTP Server
Date: ${new Date().toISOString()}
Content-Type: text/plain; charset=UTF-8

This is a test email sent through the modular SMTP server.

Features tested:
- SMTP protocol handling
- Email queue management
- DNS MX record lookup
- External mail server delivery
- Retry logic and error handling

Best regards,
Test System`
};

function sendTestEmail() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    socket.on('connect', () => {
      console.log('📧 Connected to SMTP server');
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
          // Server ready
          console.log('📤 Sending: HELO example.com');
          socket.write('HELO example.com\r\n');
        } else if (trimmedLine.startsWith('250') && !response.includes('MAIL FROM')) {
          // HELO successful, send MAIL FROM
          console.log(`📤 Sending: MAIL FROM:<${testEmail.sender}>`);
          socket.write(`MAIL FROM:<${testEmail.sender}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('MAIL FROM') && !response.includes('RCPT TO')) {
          // MAIL FROM successful, send RCPT TO
          console.log(`📤 Sending: RCPT TO:<${testEmail.recipient}>`);
          socket.write(`RCPT TO:<${testEmail.recipient}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('RCPT TO') && !response.includes('DATA')) {
          // RCPT TO successful, send DATA
          console.log('📤 Sending: DATA');
          socket.write('DATA\r\n');
        } else if (trimmedLine.startsWith('354')) {
          // Ready for data
          console.log('📤 Sending email content...');
          socket.write(testEmail.body + '\r\n.\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('DATA')) {
          // Email accepted
          console.log('📤 Sending: QUIT');
          socket.write('QUIT\r\n');
        } else if (trimmedLine.startsWith('221')) {
          // Server closing
          console.log('✅ Email sent successfully!');
          socket.end();
          resolve(response);
        } else if (trimmedLine.startsWith('4') || trimmedLine.startsWith('5')) {
          // Error response
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

    // Connect to SMTP server
    console.log('🔌 Connecting to SMTP server...');
    socket.connect(2525, 'localhost');
  });
}

// Run the test
async function runTest() {
  try {
    console.log('🧪 Starting SMTP test...\n');
    await sendTestEmail();
    console.log('\n🎉 Test completed successfully!');
    console.log('\n📊 Check the queue dashboard at: http://localhost:3000');
    console.log('📋 API endpoints available at: http://localhost:3000/api/');
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  }
}

// Check if server is running
const checkServer = new net.Socket();
checkServer.on('error', () => {
  console.error('❌ SMTP server is not running on port 2525');
  console.log('💡 Please start the server first: npm start');
  process.exit(1);
});

checkServer.connect(2525, 'localhost', () => {
  checkServer.destroy();
  runTest();
}); 