const net = require('net');

// Mock IP API server for testing
const mockIPAPI = require('http').createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const email = url.searchParams.get('email');
  const recipients = url.searchParams.get('recipients');
  
  console.log('🌐 Mock IP API called with:', { email, recipients });
  
  // Simulate different IPs based on email domain
  const domain = email.split('@')[1];
  let ip;
  
  switch (domain) {
    case 'gmail.com':
      ip = '192.168.1.10';
      break;
    case 'yahoo.com':
      ip = '192.168.1.11';
      break;
    case 'outlook.com':
      ip = '192.168.1.12';
      break;
    default:
      ip = '192.168.1.13';
  }
  
  const response = {
    status: true,
    ip: ip,
    timestamp: new Date().toISOString()
  };
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
});

// Start mock API server
const API_PORT = 3001;
mockIPAPI.listen(API_PORT, () => {
  console.log(`🌐 Mock IP API server running on port ${API_PORT}`);
});

// Test email data
const testEmails = [
  {
    sender: 'test@gmail.com',
    recipient: 'recipient@example.com',
    subject: 'Test Email from Gmail IP',
    body: `From: test@gmail.com
To: recipient@example.com
Subject: Test Email from Gmail IP
Date: ${new Date().toISOString()}
Content-Type: text/plain; charset=UTF-8

This email should be sent from IP 192.168.1.10

Best regards,
Test System`
  },
  {
    sender: 'test@yahoo.com',
    recipient: 'recipient@example.com',
    subject: 'Test Email from Yahoo IP',
    body: `From: test@yahoo.com
To: recipient@example.com
Subject: Test Email from Yahoo IP
Date: ${new Date().toISOString()}
Content-Type: text/plain; charset=UTF-8

This email should be sent from IP 192.168.1.11

Best regards,
Test System`
  }
];

function sendTestEmail(emailData) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    socket.on('connect', () => {
      console.log(`📧 Connected to SMTP server for ${emailData.sender}`);
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
          console.log(`📤 Sending: MAIL FROM:<${emailData.sender}>`);
          socket.write(`MAIL FROM:<${emailData.sender}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('MAIL FROM') && !response.includes('RCPT TO')) {
          // MAIL FROM successful, send RCPT TO
          console.log(`📤 Sending: RCPT TO:<${emailData.recipient}>`);
          socket.write(`RCPT TO:<${emailData.recipient}>\r\n`);
        } else if (trimmedLine.startsWith('250') && response.includes('RCPT TO') && !response.includes('DATA')) {
          // RCPT TO successful, send DATA
          console.log('📤 Sending: DATA');
          socket.write('DATA\r\n');
        } else if (trimmedLine.startsWith('354')) {
          // Ready for data
          console.log('📤 Sending email content...');
          socket.write(emailData.body + '\r\n.\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('DATA')) {
          // Email accepted
          console.log('📤 Sending: QUIT');
          socket.write('QUIT\r\n');
        } else if (trimmedLine.startsWith('221')) {
          // Server closing
          console.log(`✅ Email sent successfully from ${emailData.sender}!`);
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
    console.log(`🔌 Connecting to SMTP server for ${emailData.sender}...`);
    socket.connect(2525, 'localhost');
  });
}

// Run the tests
async function runTests() {
  try {
    console.log('🧪 Starting IP Selection test...\n');
    
    // Wait a bit for the mock API to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    for (const emailData of testEmails) {
      console.log(`\n📧 Testing email from ${emailData.sender}`);
      console.log('─'.repeat(50));
      
      try {
        await sendTestEmail(emailData);
        console.log(`✅ Test completed for ${emailData.sender}`);
      } catch (error) {
        console.error(`❌ Test failed for ${emailData.sender}:`, error.message);
      }
      
      // Wait between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 All IP selection tests completed!');
    console.log('\n📊 Check the queue dashboard at: http://localhost:3000');
    console.log('🌐 Mock IP API is running at: http://localhost:3001');
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  } finally {
    // Clean up
    setTimeout(() => {
      mockIPAPI.close();
      process.exit(0);
    }, 5000);
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
  runTests();
}); 