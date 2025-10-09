const mongoose = require('mongoose');
const config = require('./config/config');
const Email = require('./models/Email');

async function checkEmails() {
  try {
    await mongoose.connect(config.database.url);
    console.log('✅ Connected to MongoDB');

    const emails = await Email.find({ authenticatedUsername: 'test' })
      .select('uid subject raw text')
      .limit(5)
      .sort({ uid: -1 });

    console.log(`\nFound ${emails.length} emails for user "test":\n`);

    for (const email of emails) {
      console.log(`UID: ${email.uid}`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Has raw field: ${!!email.raw}`);
      console.log(`Raw length: ${email.raw ? email.raw.length : 0}`);
      console.log(`Has text field: ${!!email.text}`);
      console.log(`Text length: ${email.text ? email.text.length : 0}`);
      console.log('\n=== FULL RAW CONTENT ===');
      console.log(email.raw || 'NONE');
      console.log('\n=== END RAW ===\n');
      console.log('---');
      break; // Only show first email
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEmails();
