const SMTPServer = require('./smtp/service/SMTPServer');

const IMAPServer = require('./imap/service/IMAPServer');
const SmtpServer = new SMTPServer();
const ImapServer = new IMAPServer();

ImapServer.start();
SmtpServer.start();