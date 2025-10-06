const mongoose = require('mongoose');
const config = require('./config/config');
const Email = require('./models/Email');
const logger = require('./utils/logger');

async function migrate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.database.url);
    logger.info('✅ Connected to MongoDB for migration');

    // Find all emails without authenticatedUsername
    const emailsWithoutAuth = await Email.find({
      $or: [
        { authenticatedUsername: { $exists: false } },
        { authenticatedUsername: null },
        { authenticatedUsername: '' }
      ]
    });

    logger.info(`📊 Found ${emailsWithoutAuth.length} emails without authenticatedUsername`);

    let updated = 0;
    let skipped = 0;

    for (const email of emailsWithoutAuth) {
      // Use mailbox field as the authenticatedUsername
      // (mailbox field was previously used to store the username)
      if (email.mailbox && email.mailbox !== 'INBOX') {
        email.authenticatedUsername = email.mailbox;
        email.mailbox = 'INBOX'; // Standardize folder to INBOX
        await email.save();
        updated++;
        logger.info(`✅ Updated email ${email._id}: authenticatedUsername="${email.authenticatedUsername}"`);
      } else if (email.mailbox === 'INBOX') {
        // Can't determine owner for INBOX emails without more info
        skipped++;
        logger.warn(`⚠️  Skipped email ${email._id}: mailbox is INBOX, can't determine owner`);
      } else {
        skipped++;
        logger.warn(`⚠️  Skipped email ${email._id}: no mailbox field`);
      }
    }

    logger.info(`\n✅ Migration complete!`);
    logger.info(`   Updated: ${updated}`);
    logger.info(`   Skipped: ${skipped}`);
    logger.info(`   Total: ${emailsWithoutAuth.length}`);

    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
