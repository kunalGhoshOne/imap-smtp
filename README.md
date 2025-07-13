# Modular SMTP Server

A modular Node.js SMTP server that receives emails and stores them in MongoDB with a clean, maintainable architecture.

## 🏗️ Architecture

The application is organized into modular components with clear separation of concerns:

```
smtp-nodejs/
├── config/           # Configuration management
│   ├── config.js     # Centralized configuration
│   └── database.js   # Database connection management
├── models/           # Database models
│   └── Email.js      # Email schema and model
├── services/         # Business logic services
│   ├── SMTPServer.js # SMTP protocol handling
│   └── EmailProcessor.js # Email processing logic
├── utils/            # Utility modules
│   └── logger.js     # Centralized logging
├── server.js         # Main application entry point
└── package.json      # Dependencies and scripts
```

## 🚀 Features

- **Modular Architecture**: Clean separation of concerns with dedicated modules
- **SMTP Protocol Support**: Full SMTP command handling (HELO, MAIL FROM, RCPT TO, DATA, QUIT, RSET)
- **Email Processing**: MIME parsing with attachment support
- **Multi-Port SMTP**: Support for ports 25 (forwarding), 587 (STARTTLS), and 465 (SSL)
- **Email Sending**: DNS MX lookup and external mail server delivery
- **Dynamic IP Selection**: Send emails from different IP addresses based on API response
- **Queue Management**: Robust email queue with retry logic and failure tracking
- **MongoDB Storage**: Persistent email storage with structured schemas
- **Web Dashboard**: Real-time queue monitoring and management interface
- **REST API**: Complete API for queue management and email status
- **Webhook Notifications**: Success/failure notifications with detailed error information
- **Configuration Management**: Environment-based configuration
- **Logging**: Centralized logging with configurable levels
- **Graceful Shutdown**: Proper cleanup on application termination
- **Error Handling**: Comprehensive error handling throughout the application

## 📦 Installation

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

## ⚙️ Configuration

Create a `.env` file with the following options:

```env
# Server Configuration
SMTP_PORT=2525
SMTP_HOST=0.0.0.0
API_PORT=3000

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

```bash
npm start
```

Or directly:
```bash
node server.js
```

## 🧪 Testing

Test the email sending functionality:

```bash
npm test
```

This will send a test email through the SMTP server and demonstrate the queue functionality.

## 📋 Module Documentation

### Config Module (`config/`)

#### `config.js`
Centralized configuration management that loads environment variables and provides defaults.

#### `database.js`
Database connection management with connection pooling and error handling.

### Models Module (`models/`)

#### `Email.js`
MongoDB schema for email storage including:
- Sender and recipient information
- Subject, text, and HTML content
- Attachments with metadata
- Raw email data
- Timestamps

### Services Module (`services/`)

#### `SMTPServer.js`
Handles the SMTP protocol implementation:
- Connection management
- Command parsing and validation
- State management for email transactions
- Protocol compliance

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

#### `IPSelectionService.js`
Dynamic IP selection:
- API-based IP selection for email sending
- Caching mechanism for performance
- Fallback IP support
- Retry logic for API failures

### Utils Module (`utils/`)

#### `logger.js`
Centralized logging system with:
- Configurable log levels
- Timestamp formatting
- Console output control
- Structured logging

## 🔧 SMTP Commands Supported

- `HELO/EHLO` - Greeting and identification
- `MAIL FROM:` - Specify sender
- `RCPT TO:` - Specify recipients
- `DATA` - Begin email data transmission
- `QUIT` - End connection
- `RSET` - Reset current transaction

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
- SMTP protocol errors
- Graceful shutdown on system signals
- Uncaught exception handling

## 🔄 Graceful Shutdown

The server handles graceful shutdown on:
- `SIGTERM` (Docker/Kubernetes)
- `SIGINT` (Ctrl+C)
- Uncaught exceptions
- Unhandled promise rejections

## 🧪 Testing

### Automated Test
Run the automated test script:
```bash
npm test
```

### IP Selection Test
Test the dynamic IP selection functionality:
```bash
npm run test:ip
```

### Multi-Port SMTP Test
Test the multi-port SMTP functionality:
```bash
npm run test:ports
```

### Manual Testing
To test the SMTP server manually, you can use any SMTP client or telnet:

```bash
telnet localhost 2525
```

Then follow the SMTP protocol:
```
HELO example.com
MAIL FROM:<sender@example.com>
RCPT TO:<recipient@example.com>
DATA
Subject: Test Email
From: sender@example.com
To: recipient@example.com

This is a test email.
.
QUIT
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
- `GET /api/ip-selection/stats` - Get IP selection cache statistics
- `POST /api/ip-selection/clear-cache` - Clear IP selection cache
- `POST /api/ip-selection/test` - Test IP selection for specific email
- `GET /api/smtp/stats` - Get multi-port SMTP server statistics
- `GET /health` - Health check

## 📝 License

ISC License 