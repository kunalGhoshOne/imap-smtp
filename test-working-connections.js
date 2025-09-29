const net = require('net');

async function testConnection(port, name) {
  return new Promise((resolve) => {
    console.log(`🧪 Testing ${name} on port ${port}...`);

    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      console.log(`✅ ${name} connection successful on port ${port}`);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (error) => {
      console.log(`❌ ${name} connection failed on port ${port}: ${error.message}`);
      resolve(false);
    });

    socket.on('timeout', () => {
      console.log(`⏰ ${name} connection timeout on port ${port}`);
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, 'localhost');
  });
}

async function main() {
  console.log('🚀 Testing Email Server Connections');
  console.log('==================================');

  const tests = [
    { port: 25, name: 'SMTP (Standard)' },
    { port: 587, name: 'SMTP (Submission)' },
    { port: 465, name: 'SMTP (SSL)' },
    { port: 143, name: 'IMAP (Standard)' },
    { port: 993, name: 'IMAP (SSL)' },
    { port: 24, name: 'LMTP' },
    { port: 3000, name: 'Queue API' },
    { port: 8080, name: 'Mailbox API' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await testConnection(test.port, test.name);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Connection Test Results');
  console.log('=========================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 ALL CONNECTIONS WORKING! Email server is fully operational.');
  } else if (passed > failed) {
    console.log('\n🚀 Most connections working! Email server is mostly operational.');
  } else {
    console.log('\n⚠️ Several connections failed. Check server configuration.');
  }
}

main().catch(console.error);