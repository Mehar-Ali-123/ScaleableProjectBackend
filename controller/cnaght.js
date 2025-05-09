const https = require('https');

function createCnaughtOrder(amountKg, metadata, apiKey) {
  // Use the actual Cnaught API endpoint URL from documentation (replace example)
  const url = 'https://api.cnaught.com/v1/orders';

  const postData = JSON.stringify({
    amount_kg: amountKg,
    metadata: metadata
  });

  const options = {
    hostname: url.hostname, // Extract hostname from the URL
    port: 443, // Assuming HTTPS (verify with Cnaught documentation)
    path: url.pathname,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(JSON.parse(data));
        });
      } else {
        reject(new Error(`Error: Status code ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Replace with your actual Cnaught API key (store securely using environment variables)
const apiKey = process.env.CNAUGHT_API_KEY;

const amountKg = 10;
const metadata = "This is a test";

createCnaughtOrder(amountKg, metadata, apiKey)
  .then((data) => {
    console.log('Order created successfully:', data);
  })
  .catch((error) => {
    console.error('Error creating order:', error);
    // Log more detailed error information for debugging (e.g., error.code, error.errno)
  });

module.exports = {
  createCnaughtOrder
};
