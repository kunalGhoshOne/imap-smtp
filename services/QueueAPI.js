const express = require('express');
const Email = require('../models/Email');
const EmailQueue = require('./EmailQueue');
const IPSelectionService = require('./IPSelectionService');
const MultiPortSMTPServer = require('./MultiPortSMTPServer');
const IMAPServer = require('./IMAPServer');
const LMTPServer = require('./LMTPServer');
const logger = require('../utils/logger');

class QueueAPI {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Get queue statistics
    this.app.get('/api/queue/stats', async (req, res) => {
      try {
        const stats = await EmailQueue.getQueueStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Failed to get queue stats', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get emails by status
    this.app.get('/api/emails', async (req, res) => {
      try {
        const { status, limit = 50, page = 1 } = req.query;
        const skip = (page - 1) * limit;
        
        const query = {};
        if (status) {
          query.status = status;
        }

        const emails = await Email.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .select('-raw -attachments.content'); // Exclude large fields

        const total = await Email.countDocuments(query);

        res.json({
          success: true,
          data: {
            emails,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total,
              pages: Math.ceil(total / limit)
            }
          }
        });
      } catch (error) {
        logger.error('Failed to get emails', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get specific email details
    this.app.get('/api/emails/:id', async (req, res) => {
      try {
        const email = await Email.findById(req.params.id);
        if (!email) {
          return res.status(404).json({ success: false, error: 'Email not found' });
        }

        res.json({ success: true, data: email });
      } catch (error) {
        logger.error('Failed to get email', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Retry failed email
    this.app.post('/api/emails/:id/retry', async (req, res) => {
      try {
        await EmailQueue.retryFailedEmail(req.params.id);
        res.json({ success: true, message: 'Email queued for retry' });
      } catch (error) {
        logger.error('Failed to retry email', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete email
    this.app.delete('/api/emails/:id', async (req, res) => {
      try {
        const email = await Email.findByIdAndDelete(req.params.id);
        if (!email) {
          return res.status(404).json({ success: false, error: 'Email not found' });
        }

        res.json({ success: true, message: 'Email deleted' });
      } catch (error) {
        logger.error('Failed to delete email', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        success: true, 
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    });

    // IP Selection endpoints
    this.app.get('/api/ip-selection/stats', (req, res) => {
      try {
        const stats = IPSelectionService.getCacheStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Failed to get IP selection stats', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/ip-selection/clear-cache', (req, res) => {
      try {
        IPSelectionService.clearCache();
        res.json({ success: true, message: 'IP selection cache cleared' });
      } catch (error) {
        logger.error('Failed to clear IP selection cache', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/ip-selection/test', async (req, res) => {
      try {
        const { email, recipients, subject } = req.body;
        
        if (!email || !recipients) {
          return res.status(400).json({ 
            success: false, 
            error: 'email and recipients are required' 
          });
        }

        const testData = {
          _id: 'test-' + Date.now(),
          sender: email,
          recipients: Array.isArray(recipients) ? recipients : [recipients],
          subject: subject || 'Test Email'
        };

        const ip = await IPSelectionService.getIPForEmail(testData);
        res.json({ 
          success: true, 
          data: { 
            email: testData.sender,
            recipients: testData.recipients,
            selectedIP: ip
          }
        });
      } catch (error) {
        logger.error('Failed to test IP selection', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // SMTP Server endpoints
    this.app.get('/api/smtp/stats', (req, res) => {
      try {
        const stats = MultiPortSMTPServer.getServerStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Failed to get SMTP server stats', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // IMAP Server endpoints
    this.app.get('/api/imap/stats', (req, res) => {
      try {
        const stats = IMAPServer.getServerStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Failed to get IMAP server stats', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // LMTP Server endpoints
    this.app.get('/api/lmtp/stats', (req, res) => {
      try {
        const stats = LMTPServer.getServerStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Failed to get LMTP server stats', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Simple dashboard
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Email Queue Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .stats { display: flex; gap: 20px; margin-bottom: 20px; }
            .stat { padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .stat h3 { margin: 0 0 10px 0; }
            .stat .number { font-size: 24px; font-weight: bold; }
            .pending { color: #f39c12; }
            .sent { color: #27ae60; }
            .failed { color: #e74c3c; }
            .failed_permanent { color: #8e44ad; }
          </style>
        </head>
        <body>
          <h1>Email Queue Dashboard</h1>
          <div class="stats" id="stats">
            <div class="stat">
              <h3>Pending</h3>
              <div class="number pending" id="pending">-</div>
            </div>
            <div class="stat">
              <h3>Sent</h3>
              <div class="number sent" id="sent">-</div>
            </div>
            <div class="stat">
              <h3>Failed</h3>
              <div class="number failed" id="failed">-</div>
            </div>
            <div class="stat">
              <h3>Permanently Failed</h3>
              <div class="number failed_permanent" id="failed_permanent">-</div>
            </div>
          </div>
          <div>
            <h2>Recent Emails</h2>
            <div id="emails">Loading...</div>
          </div>
          
          <div>
            <h2>IP Selection</h2>
            <div id="ip-stats">Loading...</div>
            <button onclick="clearIPCache()">Clear IP Cache</button>
            <button onclick="testIPSelection()">Test IP Selection</button>
          </div>
          
          <div>
            <h2>SMTP Servers</h2>
            <div id="smtp-stats">Loading...</div>
          </div>
          
          <div>
            <h2>IMAP Server</h2>
            <div id="imap-stats">Loading...</div>
          </div>
          
          <div>
            <h2>LMTP Server</h2>
            <div id="lmtp-stats">Loading...</div>
          </div>
          
          <script>
            async function loadStats() {
              try {
                const response = await fetch('/api/queue/stats');
                const data = await response.json();
                if (data.success) {
                  document.getElementById('pending').textContent = data.data.pending;
                  document.getElementById('sent').textContent = data.data.sent;
                  document.getElementById('failed').textContent = data.data.failed;
                  document.getElementById('failed_permanent').textContent = data.data.failed_permanent;
                }
              } catch (error) {
                console.error('Failed to load stats:', error);
              }
            }

            async function loadEmails() {
              try {
                const response = await fetch('/api/emails?limit=10');
                const data = await response.json();
                if (data.success) {
                  const emailsHtml = data.data.emails.map(email => \`
                    <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                      <strong>\${email.sender}</strong> → \${email.recipients.join(', ')}<br>
                      <small>Status: \${email.status} | Created: \${new Date(email.createdAt).toLocaleString()}</small>
                    </div>
                  \`).join('');
                  document.getElementById('emails').innerHTML = emailsHtml;
                }
              } catch (error) {
                console.error('Failed to load emails:', error);
              }
            }

            // Load data on page load
            loadStats();
            loadEmails();

            async function loadIPStats() {
              try {
                const response = await fetch('/api/ip-selection/stats');
                const data = await response.json();
                if (data.success) {
                  const stats = data.data;
                  document.getElementById('ip-stats').innerHTML = \`
                    <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                      <strong>Cache Statistics:</strong><br>
                      Total: \${stats.total} | Valid: \${stats.valid} | Expired: \${stats.expired}<br>
                      <small>Cache timeout: \${stats.cacheTimeout / 1000}s</small>
                    </div>
                  \`;
                }
              } catch (error) {
                console.error('Failed to load IP stats:', error);
              }
            }

            async function clearIPCache() {
              try {
                const response = await fetch('/api/ip-selection/clear-cache', { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                  alert('IP cache cleared successfully');
                  loadIPStats();
                }
              } catch (error) {
                console.error('Failed to clear IP cache:', error);
                alert('Failed to clear IP cache');
              }
            }

            async function testIPSelection() {
              const email = prompt('Enter sender email:');
              const recipients = prompt('Enter recipients (comma-separated):');
              
              if (!email || !recipients) return;
              
              try {
                const response = await fetch('/api/ip-selection/test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: email,
                    recipients: recipients.split(',').map(r => r.trim())
                  })
                });
                
                const data = await response.json();
                if (data.success) {
                  alert(\`Selected IP: \${data.data.selectedIP || 'None (using default)'}\`);
                } else {
                  alert('Failed to test IP selection: ' + data.error);
                }
              } catch (error) {
                console.error('Failed to test IP selection:', error);
                alert('Failed to test IP selection');
              }
            }

            async function loadSMTPStats() {
              try {
                const response = await fetch('/api/smtp/stats');
                const data = await response.json();
                if (data.success) {
                  const stats = data.data;
                  const smtpHtml = Object.entries(stats).map(([port, info]) => \`
                    <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                      <strong>Port \${port}</strong> - \${info.mode.toUpperCase()}<br>
                      <small>Status: \${info.status}</small>
                    </div>
                  \`).join('');
                  document.getElementById('smtp-stats').innerHTML = smtpHtml;
                }
              } catch (error) {
                console.error('Failed to load SMTP stats:', error);
              }
            }

            async function loadIMAPStats() {
              try {
                const response = await fetch('/api/imap/stats');
                const data = await response.json();
                if (data.success) {
                  const stats = data.data;
                  const imapHtml = \`
                    <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                      <strong>IMAP Server</strong><br>
                      <small>Status: \${stats.isRunning ? 'Running' : 'Stopped'} | Connections: \${stats.connections} | Port: \${stats.port} | SSL Port: \${stats.sslPort || 'N/A'}</small>
                    </div>
                  \`;
                  document.getElementById('imap-stats').innerHTML = imapHtml;
                }
              } catch (error) {
                console.error('Failed to load IMAP stats:', error);
              }
            }

            async function loadLMTPStats() {
              try {
                const response = await fetch('/api/lmtp/stats');
                const data = await response.json();
                if (data.success) {
                  const stats = data.data;
                  const lmtpHtml = \`
                    <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                      <strong>LMTP Server</strong><br>
                      <small>Status: \${stats.isRunning ? 'Running' : 'Stopped'} | Connections: \${stats.connections} | Port: \${stats.port} | SSL Port: \${stats.sslPort || 'N/A'}</small>
                    </div>
                  \`;
                  document.getElementById('lmtp-stats').innerHTML = lmtpHtml;
                }
              } catch (error) {
                console.error('Failed to load LMTP stats:', error);
              }
            }

            // Load data on page load
            loadStats();
            loadEmails();
            loadIPStats();
            loadSMTPStats();
            loadIMAPStats();
            loadLMTPStats();

            // Refresh every 30 seconds
            setInterval(() => {
              loadStats();
              loadEmails();
              loadIPStats();
              loadSMTPStats();
              loadIMAPStats();
              loadLMTPStats();
            }, 30000);
          </script>
        </body>
        </html>
      `);
    });
  }

  start() {
    this.app.listen(this.port, () => {
      logger.info(`📊 Queue API server listening on port ${this.port}`);
    });
  }
}

module.exports = QueueAPI; 