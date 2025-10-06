const net = require('net');

const host = process.argv[2] || '192.168.62.101';
const port = process.argv[3] || 143;
const username = process.argv[4] || 'test@example.com';
const password = process.argv[5] || 'testpass';

console.log(`\nTesting IMAP connection to ${host}:${port}`);
console.log(`Username: ${username}`);
console.log(`Password: ${password}\n`);

const socket = net.createConnection(port, host);

socket.setTimeout(10000);

socket.on('connect', () => {
  console.log('✓ Connected to server');
});

socket.on('data', (data) => {
  const response = data.toString();
  console.log('← ' + response.trim());

  if (response.includes('* OK')) {
    console.log('→ A001 CAPABILITY');
    socket.write('A001 CAPABILITY\r\n');
  } else if (response.includes('A001 OK')) {
    console.log(`→ A002 LOGIN ${username} ${password}`);
    socket.write(`A002 LOGIN ${username} ${password}\r\n`);
  } else if (response.includes('A002 OK')) {
    console.log('✓ Login successful!');
    console.log('→ A003 SELECT INBOX');
    socket.write('A003 SELECT INBOX\r\n');
  } else if (response.includes('A003 OK')) {
    console.log('✓ SELECT successful!');
    console.log('→ A004 LOGOUT');
    socket.write('A004 LOGOUT\r\n');
  } else if (response.includes('A004 OK')) {
    console.log('✓ Test completed successfully!\n');
    socket.end();
  } else if (response.includes('A002 NO') || response.includes('A002 BAD')) {
    console.error('✗ Login failed!');
    socket.end();
  }
});

socket.on('error', (err) => {
  console.error('✗ Connection error:', err.message);
  process.exit(1);
});

socket.on('timeout', () => {
  console.error('✗ Connection timeout');
  socket.destroy();
  process.exit(1);
});

socket.on('close', () => {
  console.log('Connection closed\n');
  process.exit(0);
});
