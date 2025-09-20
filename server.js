const SMTPServer = require('./service/SMTPServer');


const SmtpServer = new SMTPServer();
SmtpServer.start();