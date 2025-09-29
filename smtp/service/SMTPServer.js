const net = require('net');
const EmailProcessorNew = require('./EmailProcessor');
const EmailProcessor = new EmailProcessorNew();
class SMTPServer {
  constructor(host = "0.0.0.0", port = 2525) {
    this.host = host;
    this.port = port;
    this.server = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });
    this.server.listen(this.port, this.host, () => {
      console.log(`Listening on port: ${this.port} on host: ${this.host}`);
    });
    this.server.on('error', (error) => {
      console.log("Server Error Occurred", error.message);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log("Stopping SMTP server");
    }
  }

  handleConnection(socket) {
    console.info("Client Connected.");
    let sender = '';
    let recipients = [];
    let rawData = '';
    let isDataMode = false;
    let subject = "";

    socket.write(`220 Mymailserver ESMTP KGMAIL READY\r\n`);

    socket.on('data', async (chunkdata) => {
      const lines = chunkdata.toString().split(/\r?\n/);

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (isDataMode) {
          if (line === ".") {
            isDataMode = false;
            await this.SMTPEmailHandler(socket, sender, recipients, subject, rawData);

            // Reset state for next transaction
            rawData = '';
            sender = '';
            subject = "";
            recipients = [];
          } else {
            rawData += line + '\r\n';
          }
          continue;
        }

        this.handleSMTPCommand(socket, line, {
          setSender: (s) => { sender = s; },
          addRecipient: (r) => { recipients.push(r); },
          setSubject: (sub) => { subject = sub; },
          setDataMode: (mode) => { isDataMode = mode; },
        });
      }
    });

    socket.on('error', (error) => {
      console.error("Error on SMTP Server:", error.message);
    });

    socket.on('end', () => {
      console.info("Client Disconnected.");
    });
  }

  async SMTPEmailHandler(socket, sender, recipients, subject, rawData) {
    try {
      await EmailProcessor.processEmail(sender, recipients, subject, rawData);
      socket.write('250 Message accepted\r\n');
      socket.end();
    } catch (error) {
      console.log('Error on email processor handling', error.message);
      socket.write('550 Failed to process email\r\n');
    }
  }

  async handleSMTPCommand(socket, line, state) {
    if (line.startsWith('HELO') || line.startsWith('EHLO')) {
      socket.write('250 Hello\r\n');
    } else if (line.startsWith('MAIL FROM:')) {
      const sender = line.slice(10).replace(/[<>]/g, '').trim();
      if (EmailProcessor.validateSender(sender)) {
        state.setSender(sender);
        socket.write('250 OK\r\n');
      } else {
        socket.write('501 Invalid sender\r\n');
      }
    } else if (line.startsWith('RCPT TO:')) {
      const rcpt = line.slice(8).replace(/[<>]/g, '').trim();
      if (EmailProcessor.validateRecipients([rcpt])) {
        state.addRecipient(rcpt);
        socket.write('250 OK\r\n');
      } else {
        socket.write('501 Invalid recipient\r\n');
      }
    } else if (line === 'DATA') {
      state.setDataMode(true);
      socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
    }
    else if(line.toString().toLowerCase() == 'subject:'){
      let subjectdata=line.slice(8);
      state.setSubject(subjectdata);
    }
    else if (line === 'QUIT') {
      socket.write('221 Bye\r\n');
      socket.end();
    } else if (line === 'RSET') {
      state.setSender('');
      recipients = []; // clear recipients
      state.setDataMode(false);
      socket.write('250 OK\r\n');
    } else {
      socket.write('502 Command not implemented\r\n');
    }
  }
}

module.exports = SMTPServer;
