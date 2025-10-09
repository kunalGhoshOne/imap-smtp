const mongoose = require('mongoose');
const config = require('./config/config');
const Email = require('./models/Email');

async function checkMailboxes() {
  try {
    await mongoose.connect(config.database.url);
    console.log('✅ Connected to MongoDB\n');

    const mailboxes = ['INBOX', 'Sent', 'Drafts', 'Spam', 'Trash'];

    for (const mailbox of mailboxes) {
      const emails = await Email.find({
        authenticatedUsername: 'test',
        mailbox: mailbox
      }).select('uid subject mailbox').sort({ uid: 1 });

      console.log(`📬 ${mailbox}: ${emails.length} emails`);
      emails.forEach(email => {
        console.log(`  - UID ${email.uid}: ${email.subject}`);
      });
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMailboxes();
