const net = require('net');

function sendTestEmail() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    socket.on('connect', () => {
      console.log('📧 Connected to SMTP server on port 25');
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
          console.log('📤 Sending: HELO example.com');
          socket.write('HELO example.com\r\n');
        } else if (trimmedLine.startsWith('250') && !response.includes('MAIL FROM')) {
          console.log('📤 Sending: MAIL FROM:<test@example.com>');
          socket.write('MAIL FROM:<test@example.com>\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('MAIL FROM') && !response.includes('RCPT TO')) {
          console.log('📤 Sending: RCPT TO:<recipient@example.com>');
          socket.write('RCPT TO:<recipient@example.com>\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('RCPT TO') && !response.includes('DATA')) {
          console.log('📤 Sending: DATA');
          socket.write('DATA\r\n');
        } else if (trimmedLine.startsWith('354')) {
          console.log('📤 Sending email content...');
          const emailContent = `From: test@example.com
To: recipient@example.com
Subject: SMTP Test Email
Date: ${new Date().toISOString()}

This is a test email to verify SMTP functionality.

Best regards,
SMTP Test Suite`;
          socket.write(emailContent + '\r\n.\r\n');
        } else if (trimmedLine.startsWith('250') && response.includes('DATA')) {
          console.log('📤 Sending: QUIT');
          socket.write('QUIT\r\n');
        } else if (trimmedLine.startsWith('221')) {
          console.log('✅ Email sent successfully!');
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

    console.log('🔌 Connecting to SMTP server on port 25...');
    socket.connect(25, 'localhost');
  });
}

async function main() {
  try {
    console.log('🧪 Starting SMTP functionality test on port 25...\n');
    await sendTestEmail();
    console.log('\n🎉 SMTP test completed successfully!');
    console.log('✅ SMTP server is working correctly on port 25');
  } catch (error) {
    console.error('\n💥 SMTP test failed:', error.message);
    console.log('❌ SMTP server has issues on port 25');
  }
}

main();