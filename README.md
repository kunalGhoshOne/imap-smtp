# Modular SMTP/IMAP/LMTP Server

A comprehensive Node.js email server that supports SMTP (sending), IMAP (retrieval), and LMTP (local transfer) protocols with modular architecture, mailbox management, and Docker deployment.

## 🏗️ Architecture

The application is organized into modular components with clear separation of concerns:

```
smtp-nodejs/
├── config/           # Configuration management
│   ├── config.js     # Centralized configuration
│   └── database.js   # Database connection management
├── models/           # Database models
│   ├── Email.js      # Email schema and model
│   └── Mailbox.js    # Mailbox schema and model
├── services/         # Business logic services
│   ├── MultiPortSMTPServer.js # Multi-port SMTP server
│   ├── IMAPServer.js # IMAP server with modular commands
│   ├── LMTPServer.js # LMTP server
│   ├── EmailProcessor.js # Email processing logic
│   ├── MailSender.js # External email delivery
│   ├── EmailQueue.js # Queue management
│   ├── QueueAPI.js   # Web dashboard and API
│   ├── MailboxAPI.js # Mailbox management API
│   └── IPSelectionService.js # Dynamic IP selection
├── services/imap/commands/ # Modular IMAP command handlers
│   ├── CapabilityCommand.js
│   ├── LoginCommand.js
│   ├── SelectCommand.js
│   ├── FetchCommand.js
│   ├── SearchCommand.js
│   ├── SortCommand.js
│   └── UIDCommand.js
├── utils/            # Utility modules
│   └── logger.js     # Centralized logging
├── server.js         # Main application entry point
├── Dockerfile        # Docker container definition
├── docker-compose.yml # Multi-service deployment
└── package.json      # Dependencies and scripts
```

## 🚀 Features

- **Modular Architecture**: Clean separation of concerns with dedicated modules
- **Multi-Protocol Support**: SMTP, IMAP, and LMTP servers
- **SMTP Protocol Support**: Full SMTP command handling (HELO, MAIL FROM, RCPT TO, DATA, QUIT, RSET)
- **IMAP Protocol Support**: Complete IMAP implementation with modular command handlers
- **LMTP Protocol Support**: Local mail transfer protocol implementation
- **Email Processing**: MIME parsing with attachment support
- **Multi-Port SMTP**: Support for ports 25 (forwarding), 587 (STARTTLS), and 465 (SSL)
- **IMAP Server**: Support for ports 143 (no SSL) and 993 (SSL) for email retrieval
- **LMTP Server**: Support for port 24 (no SSL) and 1024 (SSL) for local mail transfer
- **Mailbox Management**: REST API for creating, deleting, and managing mailboxes
- **Email Sending**: DNS MX lookup and external mail server delivery
- **Dynamic IP Selection**: Send emails from different IP addresses based on API response
- **Queue Management**: Robust email queue with retry logic and failure tracking
- **Separate Email Tables**: Different collections for outgoing, successful, bounced, and incoming emails
- **MongoDB Storage**: Persistent email storage with structured schemas
- **Web Dashboard**: Real-time queue monitoring and management interface
- **REST API**: Complete API for queue management and email status
- **Webhook Notifications**: Success/failure notifications with detailed error information
- **Configuration Management**: Environment-based configuration
- **Docker Support**: Containerized deployment with host networking for multi-IP support
- **Logging**: Centralized logging with configurable levels
- **Graceful Shutdown**: Proper cleanup on application termination
- **Error Handling**: Comprehensive error handling throughout the application

## 📦 Installation

### Local Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment example and configure:
   ```bash
   cp env.example .env
   ```

4. Update the `.env` file with your configuration

### Docker Installation

1. Clone the repository
2. Build and run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

**Note**: For multi-IP support, the Docker container uses `network_mode: host` which requires Linux. For other platforms, modify `docker-compose.yml` to use bridge networking.

## ⚙️ Configuration

Create a `.env` file with the following options:

```env
# Mailbox API Configuration
MAILBOX_API_PORT=8080
MAILBOX_API_KEY=changeme

# Server Configuration
SMTP_PORT=2525
SMTP_HOST=0.0.0.0
API_PORT=3000

# Multi-Port SMTP Configuration
SMTP_25_PORT=25
SMTP_465_PORT=465
SMTP_587_PORT=587

# LMTP Configuration
LMTP_24_PORT=24
LMTP_PORT=24
LMTP_SSL_PORT=1024
LMTP_SSL_ENABLED=false
LMTP_SSL_KEY=/path/to/lmtp-key.pem
LMTP_SSL_CERT=/path/to/lmtp-cert.pem
LMTP_SSL_CA=/path/to/lmtp-ca.pem

# IMAP Configuration
IMAP_143_PORT=143
IMAP_993_PORT=993
IMAP_PORT=143
IMAP_SSL_PORT=993
IMAP_SSL_ENABLED=false
IMAP_SSL_KEY=/path/to/imap-key.pem
IMAP_SSL_CERT=/path/to/imap-cert.pem
IMAP_SSL_CA=/path/to/imap-ca.pem

# Database Configuration
MONGODB_URL=mongodb://localhost:27017/smtp-server

# Email Configuration
MAX_EMAIL_SIZE=10485760
ALLOWED_DOMAINS=example.com,test.com

# Webhook Configuration
WEBHOOK_ENABLED=false
WEBHOOK_SUCCESS_URL=https://your-webhook-url.com/success
WEBHOOK_FAILURE_URL=https://your-webhook-url.com/failure
WEBHOOK_TIMEOUT=10000
WEBHOOK_RETRIES=3

# IP Selection Configuration
IP_SELECTION_ENABLED=false
IP_SELECTION_API_URL=https://your-ip-api.com/get-ip
IP_SELECTION_TIMEOUT=5000
IP_SELECTION_RETRIES=3
FALLBACK_IP=1.2.3.4

# Logging Configuration
LOG_LEVEL=info
ENABLE_CONSOLE_LOG=true
```

## 🏃‍♂️ Running the Server

### Local Development
```bash
npm start
```

Or directly:
```bash
node server.js
```

### Docker Deployment
```bash
docker-compose up --build
```

## 📬 Mailbox Management API

The Mailbox API runs on port 8080 by default and provides endpoints for managing email accounts:

### Authentication
All endpoints require the API key in the `x-api-key` header or `api_key` query parameter.

### Endpoints

- **Create Mailbox**
  ```bash
  POST /api/mailboxes
  Content-Type: application/json
  x-api-key: your-api-key
  
  {
    "username": "user@example.com",
    "password": "securepassword"
  }
  ```

- **List Mailboxes**
  ```bash
  GET /api/mailboxes
  x-api-key: your-api-key
  ```

- **Delete Mailbox**
  ```bash
  DELETE /api/mailboxes/user@example.com
  x-api-key: your-api-key
  ```

- **Change Password**
  ```bash
  POST /api/mailboxes/user@example.com/change-password
  Content-Type: application/json
  x-api-key: your-api-key
  
  {
    "oldPassword": "oldpassword",
    "newPassword": "newpassword"
  }
  ```

## 🔧 Protocol Commands Supported

### SMTP Commands
- `HELO/EHLO` - Greeting and identification
- `MAIL FROM:` - Specify sender
- `RCPT TO:` - Specify recipients
- `DATA` - Begin email data transmission
- `QUIT` - End connection
- `RSET` - Reset current transaction

### IMAP Commands
- `CAPABILITY` - List server capabilities
- `LOGIN` - Authenticate user
- `SELECT` - Select mailbox
- `LIST` - List mailboxes
- `FETCH` - Retrieve message data
- `SEARCH` - Search for messages
- `SORT` - Sort messages by criteria
- `UID` - UID-based operations
- `NOOP` - Keep connection alive
- `LOGOUT` - Close connection

### LMTP Commands
- `LHLO` - Greeting and identification
- `MAIL` - Specify sender
- `RCPT` - Specify recipients
- `DATA` - Begin email data transmission
- `QUIT` - End connection
- `RSET` - Reset current transaction
- `NOOP` - Keep connection alive

## 🧪 Testing

### Automated Tests
```bash
npm test                    # Test email sending
npm run test:ip            # Test IP selection
npm run test:ports         # Test multi-port SMTP
npm run test:lmtp          # Test LMTP server
```

### Manual Testing

#### SMTP Testing
```bash
telnet localhost 2525
```

#### IMAP Testing
```bash
telnet localhost 143
```

#### LMTP Testing
```bash
telnet localhost 24
```

#### Separate Tables Testing
```bash
node test-separate-tables.js
```

## 📊 Monitoring

### Web Dashboard
Access the real-time queue dashboard at: http://localhost:3000

### API Endpoints
- `GET /api/queue/stats` - Get queue statistics
- `GET /api/emails` - List emails with pagination
- `GET /api/emails/:id` - Get specific email details
- `POST /api/emails/:id/retry` - Retry failed email
- `DELETE /api/emails/:id` - Delete email
- `GET /api/successful-emails` - List successfully delivered emails
- `GET /api/successful-emails/:id` - Get specific successful email details
- `GET /api/bounced-emails` - List bounced emails
- `GET /api/bounced-emails/:id` - Get specific bounced email details
- `GET /api/incoming-emails` - List incoming emails
- `GET /api/incoming-emails/:id` - Get specific incoming email details
- `DELETE /api/incoming-emails/:id` - Delete incoming email
- `GET /api/email-stats` - Get comprehensive email statistics
- `GET /api/ip-selection/stats` - Get IP selection cache statistics
- `POST /api/ip-selection/clear-cache` - Clear IP selection cache
- `POST /api/ip-selection/test` - Test IP selection for specific email
- `GET /api/smtp/stats` - Get multi-port SMTP server statistics
- `GET /api/imap/stats` - Get IMAP server statistics
- `GET /api/lmtp/stats` - Get LMTP server statistics
- `GET /health` - Health check

## 🐳 Docker Deployment

### Multi-IP Support
For applications requiring multiple source IPs (e.g., email sending from different IPs), the Docker container uses `network_mode: host`. This allows the container to bind to all host network interfaces and send traffic from any available source IP.

### Standard Deployment
```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Custom Ports
Modify the `docker-compose.yml` file to change default ports or use bridge networking instead of host networking.

## 📋 Module Documentation

### Config Module (`config/`)

#### `config.js`
Centralized configuration management that loads environment variables and provides defaults.

#### `database.js`
Database connection management with connection pooling and error handling.

### Models Module (`models/`)

#### `Email.js`
MongoDB schema for outgoing email storage including:
- Sender and recipient information
- Subject, text, and HTML content
- Attachments with metadata
- Raw email data
- Queue management fields (status, retry count, attempts)
- References to successful and bounced email records
- Timestamps

#### `SuccessfulEmail.js`
MongoDB schema for successfully delivered emails including:
- Reference to original email
- Delivery confirmation details
- SMTP response information
- Delivery timestamp

#### `BouncedEmail.js`
MongoDB schema for bounced/failed emails including:
- Reference to original email
- Bounce type (hard, soft, transient, permanent)
- Bounce reason and error codes
- Bounce timestamp

#### `IncomingEmail.js`
MongoDB schema for incoming emails including:
- Sender and recipient information
- Source tracking (SMTP, IMAP, LMTP)
- Message headers and metadata
- Processing status
- Received timestamp

#### `Mailbox.js`
MongoDB schema for mailbox management including:
- Username and hashed password
- Creation timestamp
- Password comparison methods

### Services Module (`services/`)

#### `MultiPortSMTPServer.js`
Multi-port SMTP server:
- Support for ports 25, 465, and 587
- SSL/TLS support for secure connections
- Port 25 forwarding to external SMTP servers
- STARTTLS support for port 587

#### `IMAPServer.js`
IMAP server for email retrieval:
- Support for ports 143 (no SSL) and 993 (SSL)
- Modular command handlers
- Database integration for email storage
- SSL/TLS support for secure connections

#### `LMTPServer.js`
LMTP server for local mail transfer:
- Support for port 24 (no SSL) and 1024 (SSL)
- LMTP protocol implementation (LHLO, MAIL, RCPT, DATA, QUIT)
- Database integration for email storage
- SSL/TLS support for secure connections

#### `EmailProcessor.js`
Business logic for email processing:
- Email validation
- MIME parsing
- Queue management
- Error handling

#### `MailSender.js`
Handles external email delivery:
- DNS MX record lookup
- SMTP client for external servers
- Connection management and timeout handling
- Error handling and retry logic

#### `EmailQueue.js`
Queue management system:
- Email queuing and processing
- Retry logic with exponential backoff
- Failure tracking and permanent failure handling
- Queue statistics and monitoring

#### `QueueAPI.js`
Web interface and API:
- REST API for queue management
- Real-time dashboard
- Email status monitoring
- Manual retry functionality
- IP selection management

#### `MailboxAPI.js`
Mailbox management API:
- REST API for mailbox operations
- API key authentication
- Create, delete, and manage mailboxes
- Password change functionality

#### `IPSelectionService.js`
Dynamic IP selection:
- API-based IP selection for email sending
- Caching mechanism for performance
- Fallback IP support
- Retry logic for API failures

### IMAP Commands Module (`services/imap/commands/`)

#### `CapabilityCommand.js`
Handles IMAP CAPABILITY command:
- Lists server capabilities
- Supports SORT, THREAD, and other extensions

#### `LoginCommand.js`
Handles IMAP LOGIN command:
- User authentication
- State management

#### `SelectCommand.js`
Handles IMAP SELECT command:
- Mailbox selection
- Status information

#### `FetchCommand.js`
Handles IMAP FETCH command:
- Message data retrieval
- Multiple data item support

#### `SearchCommand.js`
Handles IMAP SEARCH command:
- Message searching
- Multiple search criteria

#### `SortCommand.js`
Handles IMAP SORT command:
- Message sorting by various criteria
- Combined search and sort

#### `UIDCommand.js`
Handles IMAP UID commands:
- UID-based operations
- FETCH, SEARCH, SORT, STORE

### Utils Module (`utils/`)

#### `logger.js`
Centralized logging system with:
- Configurable log levels
- Timestamp formatting
- Console output control
- Structured logging

## 📊 Email Storage

Emails are stored in MongoDB with the following structure:

```javascript
{
  sender: String,
  recipients: [String],
  subject: String,
  text: String,
  html: String,
  attachments: [{
    filename: String,
    contentType: String,
    content: Buffer
  }],
  raw: String,
  createdAt: Date
}
```

## 🛡️ Error Handling

The application includes comprehensive error handling:
- Database connection failures
- Email processing errors
- Protocol errors (SMTP, IMAP, LMTP)
- Graceful shutdown on system signals
- Uncaught exception handling

## 🔄 Graceful Shutdown

The server handles graceful shutdown on:
- `SIGTERM` (Docker/Kubernetes)
- `SIGINT` (Ctrl+C)
- Uncaught exceptions
- Unhandled promise rejections

## 📝 License

ISC License 