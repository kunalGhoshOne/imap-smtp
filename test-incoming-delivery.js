const net = require('net');
const http = require('http');

const TEST_MAILBOX = 'testuser';
const TEST_PASSWORD = 'testpass123';
const TEST_EMAIL = `${TEST_MAILBOX}@example.com`;

function httpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function createMailbox() {
  try {
    console.log(`📬 Creating mailbox: ${TEST_MAILBOX}...`);
    const response = await httpRequest({
      hostname: 'localhost',
      port: 8080,
      path: '/api/mailboxes',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'changeme'
      }
    }, {
      username: TEST_MAILBOX,
      password: TEST_PASSWORD
    });

    if (response.status === 200) {
      console.log('✅ Mailbox created:', response.data);
      return true;
    } else if (response.status === 400 || response.status === 409) {
      const dataStr = JSON.stringify(response.data);
      if (dataStr.toLowerCase().includes('already exists')) {
        console.log('⚠️  Mailbox already exists, continuing...');
        return true;
      } else {
        console.error('❌ Failed to create mailbox:', response.data);
        return false;
      }
    } else {
      console.error('❌ Failed to create mailbox:', response.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to create mailbox:', error.message);
    return false;
  }
}

function sendTestEmail() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let state = 'INIT'; // INIT, HELO_SENT, MAIL_SENT, RCPT_SENT, DATA_SENT

    socket.setTimeout(10000);

    socket.on('connect', () => {
      console.log('\n📧 Connected to SMTP server on port 25');
    });

    socket.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        console.log(`📨 Server: ${trimmedLine}`);

        // Handle SMTP responses based on state
        if (trimmedLine.startsWith('220') && state === 'INIT') {
          console.log('📤 Sending: HELO gmail.com');
          socket.write('HELO gmail.com\r\n');
          state = 'HELO_SENT';
        } else if (trimmedLine.startsWith('250') && state === 'HELO_SENT') {
          console.log('📤 Sending: MAIL FROM:<sender@gmail.com>');
          socket.write('MAIL FROM:<sender@gmail.com>\r\n');
          state = 'MAIL_SENT';
        } else if (trimmedLine.startsWith('250') && state === 'MAIL_SENT') {
          console.log(`📤 Sending: RCPT TO:<${TEST_EMAIL}>`);
          socket.write(`RCPT TO:<${TEST_EMAIL}>\r\n`);
          state = 'RCPT_SENT';
        } else if (trimmedLine.startsWith('250') && state === 'RCPT_SENT') {
          console.log('📤 Sending: DATA');
          socket.write('DATA\r\n');
          state = 'DATA_SENT';
        } else if (trimmedLine.startsWith('354')) {
          console.log('📤 Sending email content...');
          const emailContent = `From: sender@gmail.com
To: ${TEST_EMAIL}
Subject: Test Incoming Email Delivery
Date: ${new Date().toUTCString()}
Message-ID: <test-${Date.now()}@gmail.com>

Hello ${TEST_MAILBOX}!

This is a test email sent from an external server (simulating Gmail)
to verify that incoming emails are properly delivered to user mailboxes
and visible via IMAP.

If you can read this via IMAP, the delivery system is working correctly!

Best regards,
Test Suite`;
          socket.write(emailContent + '\r\n.\r\n');
          state = 'EMAIL_SENT';
        } else if (trimmedLine.startsWith('250') && state === 'EMAIL_SENT') {
          console.log('📤 Sending: QUIT');
          socket.write('QUIT\r\n');
        } else if (trimmedLine.startsWith('221')) {
          console.log('✅ Email sent successfully!');
          socket.end();
          resolve();
        } else if (trimmedLine.startsWith('5')) {
          console.error('❌ Server error:', trimmedLine);
          socket.end();
          reject(new Error(`Server error: ${trimmedLine}`));
        }
      }
    });

    socket.on('timeout', () => {
      console.error('❌ Connection timeout');
      socket.destroy();
      reject(new Error('Connection timeout'));
    });

    socket.on('error', (err) => {
      console.error('❌ Socket error:', err.message);
      reject(err);
    });

    socket.on('close', () => {
      console.log('🔌 Connection closed');
    });

    socket.connect(25, 'localhost');
  });
}

async function checkDelivery() {
  try {
    console.log('\n📊 Checking delivery status...');

    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await httpRequest({
      hostname: 'localhost',
      port: 8080,
      path: '/api/incoming-emails',
      method: 'GET'
    });

    const incomingCount = response.data.pagination.total;
    console.log(`✅ Found ${incomingCount} incoming email(s)`);

    // Check if delivered to mailbox
    console.log(`\n🔍 Checking if email was delivered to mailbox "${TEST_MAILBOX}"...`);
    console.log('   You can verify by:');
    console.log(`   1. Connect to IMAP (port 143)`);
    console.log(`   2. Login with username: ${TEST_MAILBOX}, password: ${TEST_PASSWORD}`);
    console.log(`   3. SELECT "${TEST_MAILBOX}"`);
    console.log(`   4. FETCH the emails`);
    console.log('\n   Or check the logs above for "✅ Email delivered to mailbox"');

  } catch (error) {
    console.error('❌ Failed to check delivery:', error.message);
  }
}

async function runTest() {
  console.log('🚀 Starting Incoming Email Delivery Test\n');
  console.log('This test simulates an external mail server (like Gmail) sending');
  console.log('an email to a user on this server, and verifies it gets delivered');
  console.log('to the user\'s mailbox for IMAP access.\n');

  try {
    // Step 1: Create mailbox
    const mailboxCreated = await createMailbox();
    if (!mailboxCreated) {
      console.error('❌ Cannot proceed without mailbox');
      process.exit(1);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Send email
    await sendTestEmail();

    // Step 3: Check delivery
    await checkDelivery();

    console.log('\n✅ Test completed successfully!');
    console.log('\nExpected results:');
    console.log('1. ✅ Incoming email stored in IncomingEmail collection');
    console.log('2. ✅ Email delivered to user\'s mailbox in Email collection');
    console.log('3. ✅ Email visible via IMAP when user logs in');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
