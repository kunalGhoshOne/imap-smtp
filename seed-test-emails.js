const mongoose = require('mongoose');
const Email = require('./models/Email');

async function seedTestEmails() {
  try {
    await mongoose.connect('mongodb://smtp-imap-mongo:27017/smtp-server');
    console.log('Connected to MongoDB');

    await Email.deleteMany({});
    console.log('Cleared existing emails');

    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);

    const testEmails = [
      {
        mailbox: 'INBOX',
        sender: 'alice@example.com',
        recipients: ['test@test.com'],
        subject: 'Welcome to our service!',
        text: 'Hello! Welcome to our amazing service. We are glad to have you here.',
        html: '<p>Hello! Welcome to our amazing service. We are glad to have you here.</p>',
        raw: 'From: alice@example.com\r\nTo: test@test.com\r\nSubject: Welcome to our service!\r\nDate: ' + twoDaysAgo.toUTCString() + '\r\nMessage-ID: <msg001@example.com>\r\n\r\nHello! Welcome to our amazing service.',
        messageId: 'msg001@example.com',
        internalDate: twoDaysAgo,
        flags: { seen: false, answered: false, flagged: false, deleted: false, draft: false, recent: false }
      },
      {
        mailbox: 'INBOX',
        sender: 'bob@company.com',
        recipients: ['test@test.com'],
        subject: 'Meeting scheduled for tomorrow',
        text: 'Hi,\n\nJust a reminder that we have a meeting scheduled for tomorrow at 10 AM.\n\nBest regards,\nBob',
        html: '<p>Hi,</p><p>Just a reminder that we have a meeting scheduled for tomorrow at 10 AM.</p><p>Best regards,<br>Bob</p>',
        raw: 'From: bob@company.com\r\nTo: test@test.com\r\nSubject: Meeting scheduled for tomorrow\r\nDate: ' + yesterday.toUTCString() + '\r\nMessage-ID: <msg002@company.com>\r\n\r\nHi,\n\nJust a reminder.',
        messageId: 'msg002@company.com',
        internalDate: yesterday,
        flags: { seen: true, answered: false, flagged: false, deleted: false, draft: false, recent: false }
      },
      {
        mailbox: 'Trash',
        sender: 'newsletter@spam.com',
        recipients: ['test@test.com'],
        subject: 'You won a million dollars!',
        text: 'Congratulations! You are our lucky winner.',
        html: '<p>Congratulations! You are our lucky winner.</p>',
        raw: 'From: newsletter@spam.com\r\nTo: test@test.com\r\nSubject: You won a million dollars!\r\nDate: ' + twoDaysAgo.toUTCString() + '\r\nMessage-ID: <msg003@spam.com>\r\n\r\nCongratulations!',
        messageId: 'msg003@spam.com',
        internalDate: twoDaysAgo,
        flags: { seen: true, answered: false, flagged: false, deleted: true, draft: false, recent: false }
      },
      {
        mailbox: 'Junk',
        sender: 'suspicious@phishing.com',
        recipients: ['test@test.com'],
        subject: 'Verify your account immediately',
        text: 'Your account has been compromised.',
        html: '<p>Your account has been compromised.</p>',
        raw: 'From: suspicious@phishing.com\r\nTo: test@test.com\r\nSubject: Verify your account immediately\r\nDate: ' + yesterday.toUTCString() + '\r\nMessage-ID: <msg004@phishing.com>\r\n\r\nYour account has been compromised.',
        messageId: 'msg004@phishing.com',
        internalDate: yesterday,
        flags: { seen: false, answered: false, flagged: false, deleted: false, draft: false, recent: false }
      },
      {
        mailbox: 'Sent',
        sender: 'test@test.com',
        recipients: ['colleague@work.com'],
        subject: 'Project update',
        text: 'Hi,\n\nHere is the latest update on our project.\n\nThanks,\nTest User',
        html: '<p>Hi,</p><p>Here is the latest update on our project.</p><p>Thanks,<br>Test User</p>',
        raw: 'From: test@test.com\r\nTo: colleague@work.com\r\nSubject: Project update\r\nDate: ' + now.toUTCString() + '\r\nMessage-ID: <msg005@test.com>\r\n\r\nHi,\n\nHere is the latest update.',
        messageId: 'msg005@test.com',
        internalDate: now,
        flags: { seen: true, answered: false, flagged: false, deleted: false, draft: false, recent: false }
      }
    ];

    for (const emailData of testEmails) {
      const email = new Email(emailData);
      await email.save();
      console.log(`✓ Created: ${email.mailbox}/${email.subject} (UID: ${email.uid})`);
    }

    console.log('\n✅ Successfully seeded 5 test emails!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

seedTestEmails();
