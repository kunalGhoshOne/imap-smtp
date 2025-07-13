const express = require('express');
const mongoose = require('mongoose');
const Mailbox = require('../models/Mailbox');
const config = require('../config/config');

class MailboxAPI {
  constructor() {
    this.app = express();
    this.port = config.server.mailboxApiPort || 8080;
    this.apiKey = config.server.mailboxApiKey;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    // API key authentication middleware
    this.app.use((req, res, next) => {
      const key = req.headers['x-api-key'] || req.query.api_key;
      if (!this.apiKey || key === this.apiKey) return next();
      res.status(401).json({ success: false, error: 'Invalid API key' });
    });
  }

  setupRoutes() {
    // Create mailbox
    this.app.post('/api/mailboxes', async (req, res) => {
      try {
        const { username, password } = req.body;
        if (!username || !password) {
          return res.status(400).json({ success: false, error: 'username and password required' });
        }
        const exists = await Mailbox.findOne({ username });
        if (exists) {
          return res.status(409).json({ success: false, error: 'Mailbox already exists' });
        }
        const mailbox = new Mailbox({ username, password });
        await mailbox.save();
        res.json({ success: true, mailbox: { username: mailbox.username, createdAt: mailbox.createdAt } });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    // List mailboxes
    this.app.get('/api/mailboxes', async (req, res) => {
      const mailboxes = await Mailbox.find({}, { username: 1, createdAt: 1 });
      res.json({ success: true, mailboxes });
    });
    // Delete mailbox
    this.app.delete('/api/mailboxes/:username', async (req, res) => {
      try {
        const { username } = req.params;
        const result = await Mailbox.deleteOne({ username });
        if (result.deletedCount === 0) {
          return res.status(404).json({ success: false, error: 'Mailbox not found' });
        }
        res.json({ success: true, message: 'Mailbox deleted' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    // Change password
    this.app.post('/api/mailboxes/:username/change-password', async (req, res) => {
      try {
        const { username } = req.params;
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
          return res.status(400).json({ success: false, error: 'oldPassword and newPassword required' });
        }
        const mailbox = await Mailbox.findOne({ username });
        if (!mailbox) {
          return res.status(404).json({ success: false, error: 'Mailbox not found' });
        }
        const match = await mailbox.comparePassword(oldPassword);
        if (!match) {
          return res.status(403).json({ success: false, error: 'Old password incorrect' });
        }
        mailbox.password = newPassword;
        await mailbox.save();
        res.json({ success: true, message: 'Password changed' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  start() {
    this.app.listen(this.port, () => {
      // eslint-disable-next-line no-console
      console.log(`📬 Mailbox API listening on port ${this.port}`);
    });
  }
}

module.exports = MailboxAPI; 