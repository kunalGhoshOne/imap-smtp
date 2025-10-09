const net = require('net');
const http = require('http');

const TEST_MAILBOX = 'test';  // Your actual username
const TEST_PASSWORD = 'test123';
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
    let state = 'INIT';

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
          const emailContent = [
            `From: sender@gmail.com`,
            `To: ${TEST_EMAIL}`,
            `Subject: Test Email for User "${TEST_MAILBOX}"`,
            `Date: ${new Date().toUTCString()}`,
            `Message-ID: <test-${Date.now()}@gmail.com>`,
            '', // Blank line between headers and body
            `Hello ${TEST_MAILBOX}!`,
            '',
            `This is a test email sent to ${TEST_EMAIL}.`,
            '',
            `If you can see this via IMAP when logging in with username "${TEST_MAILBOX}",`,
            `then the email delivery system is working correctly!`,
            '',
            `Your IMAP credentials:`,
            `- Server: your-server-ip`,
            `- Port: 143`,
            `- Username: ${TEST_MAILBOX}`,
            `- Password: ${TEST_PASSWORD}`,
            '',
            `Best regards,`,
            `Test Suite`
          ].join('\r\n');
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

async function runTest() {
  console.log('🚀 Starting Email Delivery Test for User "test"\n');
  console.log(`This test will:`);
  console.log(`1. Create mailbox for username: ${TEST_MAILBOX}`);
  console.log(`2. Send an email to: ${TEST_EMAIL}`);
  console.log(`3. Email should be visible when you login via IMAP with username: ${TEST_MAILBOX}\n`);

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

    console.log('\n✅ Test completed successfully!');
    console.log('\n📧 To view the email via IMAP:');
    console.log(`   Server: localhost (or your server IP)`);
    console.log(`   Port: 143`);
    console.log(`   Username: ${TEST_MAILBOX}`);
    console.log(`   Password: ${TEST_PASSWORD}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
