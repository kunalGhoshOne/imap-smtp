# DKIM Plugins

This directory contains plugins for DKIM key management. Plugins allow you to customize how DKIM keys are loaded and managed.

## Available Plugins

### 1. dkim-keys.js (Default - File-based)

Loads DKIM keys from the `keys/` directory organized by domain.

**Configuration:**
```bash
DKIM_PLUGIN_PATH=./plugins/dkim-keys.js
```

**Directory Structure:**
```
keys/
  example.com/
    private.key
    public.key
  anotherdomain.com/
    private.key
    public.key
```

**Usage:**
- Place your domain-specific keys in `keys/{domain}/`
- Keys are automatically selected based on sender's domain
- See `keys/README.md` for key generation instructions

### 2. dkim-keys-api.js (API-based)

Fetches DKIM keys from an external API endpoint.

**Configuration:**
```bash
DKIM_PLUGIN_PATH=./plugins/dkim-keys-api.js
DKIM_API_URL=https://your-api-server.com/api/dkim/keys
DKIM_API_KEY=your-secret-api-key
```

**Features:**
- Centralized key management across multiple servers
- Built-in caching (1 hour TTL)
- Automatic retries on failure
- Bearer token authentication

**API Response Format:**
```json
{
  "domain": "example.com",
  "selector": "default",
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
}
```

## Creating Custom Plugins

You can create your own plugin to load DKIM keys from any source:
- Database (MongoDB, PostgreSQL, etc.)
- Key management service (AWS KMS, HashiCorp Vault)
- Environment variables
- Redis cache
- File encryption systems

### Plugin Interface

A DKIM plugin must export a function with this signature:

```javascript
/**
 * @param {string} domain - The domain to get keys for
 * @returns {Promise<{
 *   privateKey: string,
 *   publicKey: string,
 *   selector: string,
 *   domain: string
 * }>}
 */
async function getDKIMKeys(domain) {
  // Your implementation here
  return {
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
    publicKey: '-----BEGIN PUBLIC KEY-----\n...',
    selector: 'default',
    domain: domain
  };
}

module.exports = getDKIMKeys;
```

### Example: Database Plugin

```javascript
const DKIMKey = require('../models/DKIMKey');
const logger = require('../utils/logger');

async function getDKIMKeys(domain) {
  try {
    const keyDoc = await DKIMKey.findOne({
      domain: domain,
      active: true
    });

    if (!keyDoc) {
      logger.warn(`No DKIM key found for domain: ${domain}`);
      return null;
    }

    return {
      privateKey: keyDoc.privateKey,
      publicKey: keyDoc.publicKey,
      selector: keyDoc.selector || 'default',
      domain: keyDoc.domain
    };
  } catch (error) {
    logger.error('Failed to load DKIM keys from database', {
      domain,
      error: error.message
    });
    return null;
  }
}

module.exports = getDKIMKeys;
```

### Example: Environment Variables Plugin

```javascript
const logger = require('../utils/logger');

async function getDKIMKeys(domain) {
  const envKey = `DKIM_PRIVATE_KEY_${domain.toUpperCase().replace(/\./g, '_')}`;
  const privateKey = process.env[envKey];

  if (!privateKey) {
    logger.warn(`No DKIM key in environment for: ${domain}`);
    return null;
  }

  // Decode from base64 if needed
  const decodedKey = Buffer.from(privateKey, 'base64').toString('utf8');

  return {
    privateKey: decodedKey,
    publicKey: null,
    selector: process.env.DKIM_SELECTOR || 'default',
    domain: domain
  };
}

module.exports = getDKIMKeys;
```

## Using Your Custom Plugin

1. Create your plugin file in `plugins/` directory:
   ```bash
   touch plugins/dkim-keys-custom.js
   ```

2. Implement the plugin interface

3. Update your `.env` configuration:
   ```bash
   DKIM_PLUGIN_PATH=./plugins/dkim-keys-custom.js
   ```

4. Restart the application

## Plugin Return Values

### Success
Return an object with:
- `privateKey` (required): PEM-formatted RSA private key
- `publicKey` (optional): PEM-formatted RSA public key
- `selector` (optional): DKIM selector, defaults to DKIM_SELECTOR env var
- `domain` (optional): Domain name, defaults to requested domain

### No Keys Available
Return `null` to indicate no keys are available for the domain. The email will be sent without DKIM signature.

### Error Handling
Wrap your code in try-catch and return `null` on error. The DKIMService will log errors and send emails unsigned.

## Testing Your Plugin

1. Enable DKIM in `.env`:
   ```bash
   DKIM_ENABLED=true
   DKIM_PLUGIN_PATH=./plugins/your-plugin.js
   ```

2. Send a test email through the SMTP server

3. Check logs for DKIM signing:
   ```
   INFO: DKIM plugin loaded
   INFO: Signing email with DKIM
   INFO: Email signed with DKIM
   ```

4. Verify the signature in the email headers:
   ```
   DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
     d=example.com; s=default;
     h=from:to:subject:date;
     bh=...;
     b=...
   ```

## Performance Considerations

- **Caching**: Implement caching for keys to avoid repeated database/API calls
- **Async Loading**: Use async/await for I/O operations
- **Error Handling**: Always return `null` on error, never throw exceptions
- **Timeouts**: Implement timeouts for external API calls
- **Logging**: Use the logger for debugging and error tracking

## Security Best Practices

1. **Private Key Protection:**
   - Never log private keys
   - Use secure storage (encrypted databases, key management services)
   - Restrict file permissions on key files

2. **API Security:**
   - Use HTTPS for API endpoints
   - Implement authentication (API keys, OAuth)
   - Validate responses before using

3. **Key Rotation:**
   - Support multiple selectors for key rotation
   - Keep old keys active during rotation period
   - Update DNS records before deploying new keys

## Troubleshooting

### Plugin Not Loading
- Check `DKIM_PLUGIN_PATH` is correct relative path
- Verify file exists and has proper permissions
- Check application logs for errors

### Keys Not Found
- Verify your plugin returns correct format
- Check domain matching (case-sensitive)
- Enable debug logging to see plugin calls

### Signature Verification Fails
- Ensure private key format is correct (PEM)
- Verify DNS record matches public key
- Check selector matches DNS record

## Additional Resources

- See `keys/README.md` for DKIM key generation
- See `services/DKIMService.js` for implementation details
- Check `.env` for all DKIM configuration options
