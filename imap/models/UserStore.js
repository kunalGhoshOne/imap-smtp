const User = require('./User');

class UserStore {
    constructor() {
        this.users = new Map();
        this.initializeUsers();
    }

    initializeUsers() {
        // Create some sample users
        const sampleUsers = [
            { email: 'john@example.com', password: 'password123', fullName: 'John Doe' },
            { email: 'alice@example.com', password: 'alice456', fullName: 'Alice Smith' },
            { email: 'bob@example.com', password: 'bob789', fullName: 'Bob Johnson' },
            { email: 'admin@example.com', password: 'admin', fullName: 'Admin User' },
            { email: 'test@localhost', password: 'test', fullName: 'Test User' }
        ];

        for (const userData of sampleUsers) {
            const user = new User(userData.email, userData.password, userData.fullName);
            this.users.set(userData.email, user);
        }

        console.log(`Initialized ${this.users.size} users in UserStore`);
    }

    findByEmail(email) {
        return this.users.get(email);
    }

    authenticate(email, password) {
        const user = this.findByEmail(email);
        if (user && user.verifyPassword(password)) {
            user.updateLastLogin();
            return user;
        }
        return null;
    }

    createUser(email, password, fullName = '') {
        if (this.users.has(email)) {
            return null; // User already exists
        }

        const user = new User(email, password, fullName);
        this.users.set(email, user);
        return user;
    }

    deleteUser(email) {
        return this.users.delete(email);
    }

    getAllUsers() {
        return Array.from(this.users.values());
    }

    getUserCount() {
        return this.users.size;
    }

    // Method to add sample messages to users for testing
    async addSampleMessages() {
        for (const [email, user] of this.users) {
            const inbox = user.getMailbox('INBOX');
            if (inbox) {
                const Message = require('./Message');

                // Create sample email body in RFC822 format
                const emailBody = `Subject: Welcome to IMAP Server\r\nFrom: System <system@example.com>\r\nTo: ${user.fullName} <${email}>\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <welcome-${Date.now()}@imap.server>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nWelcome to the IMAP server!\r\n\r\nThis is a test message in your INBOX.\r\n\r\nYour account has been set up successfully and you can now:\r\n- Read emails using IMAP clients\r\n- Organize emails in folders\r\n- Search through your messages\r\n\r\nBest regards,\r\nIMAP Server Team`;

                const message = new Message(
                    'system@example.com',
                    email,
                    'Welcome to IMAP Server',
                    emailBody,
                    ['\\Recent']
                );

                // Save email body to GridFS
                await message.saveEmailBody();

                message.uid = inbox.nextUid++;
                message.sequenceNumber = inbox.exists + 1;

                inbox.messages.set(message.uid, message);
                inbox.exists++;
                inbox.recent++;
                inbox.unseen++;
            }
        }

        console.log('Added sample messages to all users with GridFS storage');
    }
}

// Create a singleton instance
const userStore = new UserStore();

module.exports = userStore;