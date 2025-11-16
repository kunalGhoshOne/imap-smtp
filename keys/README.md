# DKIM Keys Directory

This directory contains DKIM private and public keys organized by domain.

## Directory Structure

```
keys/
  example.com/
    private.key    # RSA private key for DKIM signing
    public.key     # RSA public key (for reference/DNS)
  anotherdomain.com/
    private.key
    public.key
```

## Generating DKIM Keys

### Method 1: Using OpenSSL (Recommended)

Generate a 2048-bit RSA key pair:

```bash
# Create directory for your domain
mkdir -p keys/yourdomain.com

# Generate private key
openssl genrsa -out keys/yourdomain.com/private.key 2048

# Extract public key
openssl rsa -in keys/yourdomain.com/private.key -pubout -out keys/yourdomain.com/public.key
```

### Method 2: Using Node.js Script

```javascript
const crypto = require('crypto');
const fs = require('fs');

// Generate key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs1',
    format: 'pem'
  }
});

// Save keys
const domain = 'yourdomain.com';
fs.mkdirSync(`keys/${domain}`, { recursive: true });
fs.writeFileSync(`keys/${domain}/private.key`, privateKey);
fs.writeFileSync(`keys/${domain}/public.key`, publicKey);
```

## DNS Configuration

After generating keys, you need to publish the public key in DNS:

1. Extract the public key content (remove headers and newlines):

```bash
grep -v "^-" keys/yourdomain.com/public.key | tr -d '\n'
```

2. Create a TXT record in your DNS:

**Record Name:** `default._domainkey.yourdomain.com`

**Record Type:** TXT

**Record Value:**
```
v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY_HERE
```

Replace `YOUR_PUBLIC_KEY_HERE` with the base64-encoded public key (without headers).

Example:
```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
```

### DNS Record Format

- **Selector:** `default` (or whatever you set in DKIM_SELECTOR env variable)
- **Full hostname:** `{selector}._domainkey.{domain}`
- **Example:** `default._domainkey.example.com`

## Testing DKIM Configuration

### 1. Verify DNS Record

```bash
dig TXT default._domainkey.yourdomain.com +short
```

You should see your DKIM public key in the response.

### 2. Send Test Email

Send an email through your SMTP server and check the headers. You should see:

```
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
  d=yourdomain.com; s=default;
  h=from:to:subject:date;
  bh=...;
  b=...
```

### 3. Use Online Validators

Send a test email to these services:
- mail-tester.com
- dkimvalidator.com
- appmaildev.com/dkim

## Security Best Practices

1. **Protect Private Keys:**
   - Set proper file permissions: `chmod 600 keys/*/private.key`
   - Never commit private keys to version control
   - Add `keys/` to `.gitignore`

2. **Key Rotation:**
   - Rotate keys periodically (every 6-12 months)
   - Keep old keys for 1-2 weeks during rotation

3. **Key Length:**
   - Use at least 2048-bit keys
   - 4096-bit keys offer more security but may have compatibility issues

4. **Backup:**
   - Keep secure backups of private keys
   - Store backups encrypted and off-site

## Troubleshooting

### "DKIM private key not found"
- Ensure the directory name matches your sending domain exactly
- Check file permissions (keys must be readable by the application)
- Verify the file is named exactly `private.key`

### "DKIM signature verification failed"
- Check DNS record is properly configured
- Verify selector matches (default is 'default')
- Ensure public key in DNS matches the private key
- Check for extra spaces or line breaks in DNS record

### "No DKIM signature added"
- Verify `DKIM_ENABLED=true` in .env
- Check application logs for errors
- Ensure sender domain has keys configured

## Multi-Domain Setup

For multiple sending domains:

```bash
# Generate keys for each domain
./generate-dkim-keys.sh domain1.com
./generate-dkim-keys.sh domain2.com
./generate-dkim-keys.sh domain3.com
```

The DKIM service will automatically select the correct keys based on the sender's domain.

## Alternative Key Storage

If you prefer not to use file-based keys, you can modify `plugins/dkim-keys.js` to load keys from:
- MongoDB database
- Environment variables (base64 encoded)
- External key management service (AWS KMS, HashiCorp Vault, etc.)
- Redis cache

See examples in the plugin file.
