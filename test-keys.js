require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔑 Testing CDP Server Wallets v2...');
console.log('Key ID:', process.env.CDP_API_KEY_ID ? '✅ Loaded' : '❌ Missing');
console.log('Key Secret:', process.env.CDP_API_KEY_SECRET ? '✅ Loaded' : '❌ Missing');

function extractKeyId(fullKeyPath) {
  const parts = fullKeyPath.split('/');
  return parts[parts.length - 1];
}

async function generateJWT(method, path) {
  const privateKey = process.env.CDP_API_KEY_SECRET;
  const fullKeyPath = process.env.CDP_API_KEY_ID;
  const rawKeyId = extractKeyId(fullKeyPath);
  
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: rawKeyId,
    sub: fullKeyPath,
    aud: ['https://api.coinbase.com'],
    nbf: now,
    exp: now + 120,
    uri: `${method} ${path}`
  };
  
  console.log('\n📝 JWT Claims:');
  console.log('- iss (issuer - raw key ID):', rawKeyId);
  console.log('- sub (subject - full path):', fullKeyPath.substring(0, 30) + '...');
  console.log('- aud (audience):', payload.aud);
  console.log('- uri:', payload.uri);
  
  const token = jwt.sign(payload, privateKey, { 
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: rawKeyId,
      typ: 'JWT'
    }
  });
  
  console.log('✅ JWT generated successfully');
  return token;
}

async function testWallets() {
  try {
    console.log('\n📋 Testing: List wallets...');
    const token = await generateJWT('GET', '/platform/v1/wallets');
    
    const response = await fetch('https://api.cdp.coinbase.com/platform/v1/wallets', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📡 Response status:', response.status);
    const text = await response.text();
    console.log('📦 Response body:', text);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testWallets();
