require('dotenv').config();
const { CdpClient } = require('@coinbase/cdp-sdk');

async function test() {
  try {
    console.log('🔑 Testing CDP with new key and wallet secret...');
    console.log('Key ID:', process.env.CDP_API_KEY_ID ? '✅' : '❌');
    console.log('Key Secret:', process.env.CDP_API_KEY_SECRET ? '✅' : '❌');
    console.log('Wallet Secret:', process.env.CDP_WALLET_SECRET ? '✅' : '❌');

    const cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET
    });
    
    console.log('✅ CDP Client created');
    
    const account = await cdp.evm.createAccount();
    console.log('✅ SUCCESS! Account:', account.address);
    
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }
}

test();
