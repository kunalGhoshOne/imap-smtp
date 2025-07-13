const net = require('net');
const { simpleParser } = require('mailparser');

// Test configuration
const TEST_CONFIG = {
  host: 'localhost',
  port: 2525,
  sender: 'test@example.com',
  recipients: ['recipient@example.com'],
  subject: 'Test Separate Tables',
  text: 'This is a test email to verify separate table functionality.',
  html: '<h1>Test Email</h1><p>This is a test email to verify separate table functionality.</p>'
};

// Create test email
function createTestEmail() {
  const email = [
    `From: ${TEST_CONFIG.sender}`,
    `To: ${TEST_CONFIG.recipients.join(', ')}`,
    `Subject: ${TEST_CONFIG.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    TEST_CONFIG.html,
    ''
  ].join('\r\n');

  return email;
}

// Test SMTP connection and send email
async function testSMTPConnection() {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let response = '';
    let isDataMode = false;
    let dataSent = false;

    client.connect(TEST_CONFIG.port, TEST_CONFIG.host, () => {
      console.log('📬 Connected to SMTP server');
    });

    client.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        response += trimmedLine + '\n';
        console.log(`📨 Server: ${trimmedLine}`);

        if (trimmedLine.startsWith('220')) {
          // Server ready, send HELO
          const heloCommand = `HELO test.example.com\r\n`;
          console.log(`📤 Client: ${heloCommand.trim()}`);
          client.write(heloCommand);
        } else if (trimmedLine.startsWith('250') && !isDataMode) {
          if (!dataSent) {
            // Send MAIL FROM
            const mailFromCommand = `MAIL FROM:<${TEST_CONFIG.sender}>\r\n`;
            console.log(`📤 Client: ${mailFromCommand.trim()}`);
            client.write(mailFromCommand);
          } else {
            // Email sent successfully
            const quitCommand = 'QUIT\r\n';
            console.log(`📤 Client: ${quitCommand.trim()}`);
            client.write(quitCommand);
          }
        } else if (trimmedLine.startsWith('354')) {
          // Ready for data
          isDataMode = true;
          const emailData = createTestEmail();
          console.log(`📤 Client: Sending email data...`);
          client.write(emailData + '\r\n.\r\n');
          dataSent = true;
        } else if (trimmedLine.startsWith('221')) {
          // Server closing connection
          client.end();
          resolve('Email sent successfully');
        } else if (trimmedLine.startsWith('4') || trimmedLine.startsWith('5')) {
          client.end();
          reject(new Error(`SMTP Error: ${trimmedLine}`));
        }
      }
    });

    client.on('error', (error) => {
      reject(new Error(`Connection error: ${error.message}`));
    });

    client.on('close', () => {
      if (!dataSent) {
        reject(new Error('Connection closed before email could be sent'));
      }
    });

    // Set timeout
    setTimeout(() => {
      client.destroy();
      reject(new Error('Connection timeout'));
    }, 10000);
  });
}

// Test authenticated SMTP connection
async function testAuthenticatedSMTP() {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let response = '';
    let isDataMode = false;
    let dataSent = false;
    let isAuthenticated = false;

    client.connect(587, TEST_CONFIG.host, () => {
      console.log('📬 Connected to SMTP server (port 587)');
    });

    client.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        response += trimmedLine + '\n';
        console.log(`📨 Server: ${trimmedLine}`);

        if (trimmedLine.startsWith('220')) {
          // Server ready, send EHLO
          const ehloCommand = `EHLO test.example.com\r\n`;
          console.log(`📤 Client: ${ehloCommand.trim()}`);
          client.write(ehloCommand);
        } else if (trimmedLine.startsWith('250') && !isDataMode && !isAuthenticated) {
          // Send AUTH LOGIN
          const authCommand = 'AUTH LOGIN\r\n';
          console.log(`📤 Client: ${authCommand.trim()}`);
          client.write(authCommand);
        } else if (trimmedLine.startsWith('334') && !isAuthenticated) {
          // Send username
          const username = Buffer.from('test@example.com').toString('base64');
          console.log(`📤 Client: Sending username (base64)`);
          client.write(username + '\r\n');
        } else if (trimmedLine.startsWith('235')) {
          // Authentication successful
          isAuthenticated = true;
          const mailFromCommand = `MAIL FROM:<${TEST_CONFIG.sender}>\r\n`;
          console.log(`📤 Client: ${mailFromCommand.trim()}`);
          client.write(mailFromCommand);
        } else if (trimmedLine.startsWith('250') && isAuthenticated && !dataSent) {
          // Send RCPT TO
          const rcptCommand = `RCPT TO:<${TEST_CONFIG.recipients[0]}>\r\n`;
          console.log(`📤 Client: ${rcptCommand.trim()}`);
          client.write(rcptCommand);
        } else if (trimmedLine.startsWith('250') && isAuthenticated && dataSent) {
          // Email sent successfully
          const quitCommand = 'QUIT\r\n';
          console.log(`📤 Client: ${quitCommand.trim()}`);
          client.write(quitCommand);
        } else if (trimmedLine.startsWith('354')) {
          // Ready for data
          isDataMode = true;
          const emailData = createTestEmail();
          console.log(`📤 Client: Sending email data...`);
          client.write(emailData + '\r\n.\r\n');
          dataSent = true;
        } else if (trimmedLine.startsWith('221')) {
          // Server closing connection
          client.end();
          resolve('Authenticated email sent successfully');
        } else if (trimmedLine.startsWith('4') || trimmedLine.startsWith('5')) {
          client.end();
          reject(new Error(`SMTP Error: ${trimmedLine}`));
        }
      }
    });

    client.on('error', (error) => {
      reject(new Error(`Connection error: ${error.message}`));
    });

    client.on('close', () => {
      if (!dataSent) {
        reject(new Error('Connection closed before email could be sent'));
      }
    });

    // Set timeout
    setTimeout(() => {
      client.destroy();
      reject(new Error('Connection timeout'));
    }, 10000);
  });
}

// Check API endpoints
async function checkAPIEndpoints() {
  const endpoints = [
    '/api/queue/stats',
    '/api/email-stats',
    '/api/emails?limit=5',
    '/api/successful-emails?limit=5',
    '/api/bounced-emails?limit=5',
    '/api/incoming-emails?limit=5'
  ];

  console.log('\n🔍 Checking API endpoints...');
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`http://localhost:3000${endpoint}`);
      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ ${endpoint}: OK`);
        if (data.data && typeof data.data === 'object') {
          const keys = Object.keys(data.data);
          if (keys.length > 0) {
            console.log(`   Data keys: ${keys.join(', ')}`);
          }
        }
      } else {
        console.log(`❌ ${endpoint}: ${data.error}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  }
}

// Main test function
async function runTests() {
  console.log('🧪 Testing Separate Email Tables\n');

  try {
    // Test 1: Send unauthenticated email (should go to incoming emails)
    console.log('📧 Test 1: Sending unauthenticated email (should be stored as incoming)...');
    await testSMTPConnection();
    console.log('✅ Test 1 completed\n');

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Send authenticated email (should go to outgoing emails)
    console.log('📧 Test 2: Sending authenticated email (should be stored as outgoing)...');
    await testAuthenticatedSMTP();
    console.log('✅ Test 2 completed\n');

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Check API endpoints
    await checkAPIEndpoints();

    console.log('\n🎉 All tests completed!');
    console.log('\n📊 Check the dashboard at: http://localhost:3000');
    console.log('📋 API documentation available at: http://localhost:3000/api/');

  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  }
}

// Run the tests
runTests(); 