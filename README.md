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
│   ├── Email.js      # Email schema and model (outgoing & user mailboxes)
│   ├── IncomingEmail.js # Incoming email archive
│   ├── SuccessfulEmail.js # Successfully sent emails
│   ├── BouncedEmail.js # Bounced/failed emails
│   └── Mailbox.js    # Mailbox schema and model
├── services/         # Business logic services
│   ├── MultiPortSMTPServer.js # Multi-port SMTP server
│   ├── IMAPServer.js # IMAP server with modular commands
│   ├── LMTPServer.js # LMTP server
│   ├── EmailProcessor.js # Outgoing email processing logic
│   ├── IncomingEmailProcessor.js # Incoming email delivery to mailboxes
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
- **🛡️ Rspamd Spam Filtering**: Real-time spam detection for inbound and outbound email
- **Email Processing**: MIME parsing with attachment support
- **Multi-Port SMTP**: Support for ports 25 (forwarding), 587 (STARTTLS), and 465 (SSL)
- **IMAP Server**: Support for ports 143 (no SSL) and 993 (SSL) for email retrieval
- **LMTP Server**: Support for port 24 (no SSL) and 1024 (SSL) for local mail transfer
- **Incoming Email Delivery**: Automatic delivery of incoming emails from external servers to user mailboxes
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

# Rspamd Spam Filtering Configuration
RSPAMD_ENABLED=false
RSPAMD_INBOUND_ENABLED=false
RSPAMD_OUTBOUND_ENABLED=false
RSPAMD_HOST=localhost
RSPAMD_PORT=11333
RSPAMD_TIMEOUT=10000
RSPAMD_REJECT_THRESHOLD=15
RSPAMD_GREYLIST_THRESHOLD=6
RSPAMD_ADD_HEADER_THRESHOLD=4
RSPAMD_PASSWORD=changeme
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

## 🛡️ Rspamd Spam Filtering

This server includes built-in integration with [Rspamd](https://rspamd.com/), a fast, free, and open-source spam filtering system.

### Features

- **Real-time Spam Detection**: Scans emails before delivery or acceptance
- **Inbound Protection**: Filter spam from incoming emails (port 25, LMTP)
- **Outbound Protection**: Prevent compromised accounts from sending spam (ports 587, 465)
- **Flexible Actions**: Reject, greylist, or tag emails based on spam score
- **Spam Headers**: Add X-Spam-* headers for client-side filtering
- **Performance**: Connection pooling and efficient scanning
- **Fail-Open**: Accepts emails if rspamd is unavailable (configurable)
- **Health Monitoring**: Automatic health checks on startup
- **Metrics**: Built-in metrics for monitoring scan success rates

### Quick Start

1. **Enable Rspamd in docker-compose:**

   Rspamd is already included in the docker-compose.yml file. Just start the services:

   ```bash
   docker-compose up -d
   ```

2. **Configure Rspamd filtering:**

   Update your `.env` file:

   ```env
   # Enable rspamd globally
   RSPAMD_ENABLED=true

   # Enable for incoming mail (port 25, LMTP)
   RSPAMD_INBOUND_ENABLED=true

   # Enable for outgoing mail (ports 587, 465)
   RSPAMD_OUTBOUND_ENABLED=true

   # Rspamd server (use 'rspamd' for Docker, 'localhost' for local)
   RSPAMD_HOST=rspamd

   # Configure thresholds
   RSPAMD_REJECT_THRESHOLD=15      # Reject if score >= 15
   RSPAMD_GREYLIST_THRESHOLD=6     # Greylist if score >= 6
   RSPAMD_ADD_HEADER_THRESHOLD=4   # Add headers if score >= 4
   ```

3. **Restart the application:**

   ```bash
   docker-compose restart app
   ```

### How It Works

```
Incoming Email → Rspamd Scan → Score Check → Action
                                            ├─ Score >= 15: Reject (550)
                                            ├─ Score >= 6:  Greylist (451)
                                            ├─ Score >= 4:  Accept + Headers
                                            └─ Score < 4:   Accept (clean)
```

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `RSPAMD_ENABLED` | Master switch for rspamd | `false` |
| `RSPAMD_INBOUND_ENABLED` | Scan incoming mail | `false` |
| `RSPAMD_OUTBOUND_ENABLED` | Scan outgoing mail | `false` |
| `RSPAMD_HOST` | Rspamd server hostname | `localhost` |
| `RSPAMD_PORT` | Rspamd API port | `11333` |
| `RSPAMD_TIMEOUT` | Request timeout (ms) | `10000` |
| `RSPAMD_REJECT_THRESHOLD` | Score to reject email | `15` |
| `RSPAMD_GREYLIST_THRESHOLD` | Score to greylist | `6` |
| `RSPAMD_ADD_HEADER_THRESHOLD` | Score to add headers | `4` |
| `RSPAMD_PASSWORD` | Web UI password | `changeme` |

### Spam Actions

**Reject (550 Error)**
- Email is permanently rejected
- Sender receives bounce message
- Used for obvious spam (score >= 15)

**Greylist (451 Error)**
- Email is temporarily rejected
- Legitimate servers will retry
- Spammers typically don't retry
- Used for suspicious emails (score >= 6)

**Accept with Headers**
- Email is accepted
- X-Spam-* headers added
- Users can filter on client side
- Used for borderline spam (score >= 4)

**Accept Clean**
- Email is accepted without modification
- No spam detected (score < 4)

### Added Headers

When spam is detected, the following headers are added:

```
X-Spam-Status: Yes, score=12.50 required=15.00
X-Spam-Score: 12.50
X-Spam-Level: ************
X-Spam-Action: add header
X-Spam-Symbols: SYMBOL1(5.00), SYMBOL2(7.50)
```

### Mail Type Detection

The system automatically determines whether email is inbound or outbound:

- **Inbound**: Port 25 (unauthenticated) or LMTP
- **Outbound**: Ports 587/465 (authenticated SMTP)

### Rspamd Web Interface

Access the rspamd web UI at: `http://localhost:11334`

- Username: `admin`
- Password: Set via `RSPAMD_PASSWORD` environment variable

### Monitoring

Check rspamd integration status:

```bash
# View rspamd logs
docker-compose logs rspamd

# Check rspamd health
curl http://localhost:11334/ping

# View application logs for rspamd activity
docker-compose logs app | grep -i rspamd
```

### Troubleshooting

**Rspamd not scanning emails:**
1. Check if rspamd is running: `docker-compose ps rspamd`
2. Verify `RSPAMD_ENABLED=true` in your `.env`
3. Check application logs for rspamd health check status
4. Verify `RSPAMD_HOST` is correct (use `rspamd` for Docker)

**All emails being rejected:**
1. Thresholds might be too low
2. Increase `RSPAMD_REJECT_THRESHOLD` to 20+
3. Check rspamd logs for scoring details

**Rspamd unavailable:**
- System operates in fail-open mode
- Emails are accepted without scanning
- Warning logged on startup
- Fix rspamd and restart application

### Advanced Configuration

For advanced rspamd configuration, mount custom config files:

```yaml
# docker-compose.yml
volumes:
  - ./rspamd/local.d:/etc/rspamd/local.d
  - ./rspamd/override.d:/etc/rspamd/override.d
```

See [Rspamd Documentation](https://rspamd.com/doc/) for advanced options.

### Performance

- **Connection Pooling**: Reuses HTTP connections (maxSockets: 50)
- **Timeout Protection**: 10-second timeout per scan
- **Response Limits**: 1MB max response size
- **Health Checks**: Automatic health monitoring
- **Metrics**: Success rate tracking

### Security

- **Inbound Protection**: Blocks spam from reaching users
- **Outbound Protection**: Prevents your server from sending spam
- **Account Protection**: Detects compromised accounts
- **Reputation**: Maintains server reputation by blocking outbound spam

---

## 📨 Incoming Email Delivery

This server supports receiving emails from external mail servers (like Gmail, Outlook, etc.) and delivering them to user mailboxes for IMAP access.

### How It Works

```
External Mail Server (Gmail)
    ↓
Port 25 (Unauthenticated SMTP)
    ↓
IncomingEmailProcessor
    ↓
    ├─> IncomingEmail collection (archival/logging)
    └─> Email collection (user's mailbox for IMAP)
```

### Prerequisites

**⚠️ Important**: A mailbox MUST exist before emails can be delivered to it.

1. **Create a mailbox** using the Mailbox API:
   ```bash
   POST http://your-server:8080/api/mailboxes
   Content-Type: application/json
   x-api-key: your-api-key

   {
     "username": "test",
     "password": "password123"
   }
   ```

2. **Set up MX records** for your domain to point to your server's IP

3. **Ensure port 25 is open** for incoming connections

### Email Flow Example

1. Someone at `sender@gmail.com` sends an email to `test@example.com`
2. Gmail looks up the MX record for `example.com` → finds your server IP
3. Gmail connects to your **port 25** (server-to-server, no authentication required)
4. Your SMTP server accepts the email
5. **IncomingEmailProcessor** processes it:
   - Stores in `IncomingEmail` collection (for archival/logging)
   - **Delivers to user's mailbox** in `Email` collection with `mailbox="test"`
6. User connects via **IMAP** (port 143 or 993) and logs in with username `test`
7. User sees the email in their inbox!

### Delivery Behavior

- ✅ **If mailbox exists**: Email is delivered to the user's mailbox (visible via IMAP)
- ❌ **If mailbox doesn't exist**: Email is stored in `IncomingEmail` collection only (NOT visible via IMAP)
- 📊 **Logs**: Check logs for `✅ Email delivered to mailbox` to confirm successful delivery

### Testing Incoming Email

Run the test script to simulate an external server sending an email:

```bash
# Inside Docker container
docker exec smtp-imap-app node test-incoming-delivery.js

# Or via Vagrant
vagrant ssh -c "sudo docker exec smtp-imap-app node test-incoming-delivery.js"
```

This test:
1. Creates a test mailbox (`testuser`)
2. Simulates Gmail sending an email to `testuser@example.com`
3. Verifies the email is delivered to the mailbox
4. Confirms it's accessible via IMAP

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

#### `RspamdService.js`
Spam filtering integration:
- Real-time spam scanning via rspamd HTTP API
- Connection pooling for performance
- Configurable thresholds (reject, greylist, add headers)
- Automatic mail type detection (inbound/outbound)
- Spam header generation
- Health checking and metrics
- Fail-open mode for availability
- Input sanitization for security

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