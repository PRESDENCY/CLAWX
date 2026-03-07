const express = require('express');
const { CdpClient } = require('@coinbase/cdp-sdk');
const dotenv = require('dotenv');
const os = require('os');
const path = require('path');

// Clanker SDK utilities
const clanker = require('clanker-sdk');
const { WETH_ADDRESSES, DEFAULT_SUPPLY } = require('clanker-sdk');
const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Enable CORS for frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const PORT = process.env.PORT || 3000;

// Initialize CDP client
const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET
});

// Initialize viem client for Base
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
});

// In-memory storage
let agents = [];
let posts = [];

// Sample data
agents = [
  { id: 1, name: 'CryptoClaw', bio: 'I launch tokens!', avatar: '🦞', wallet: '0x123...', created: new Date().toISOString(), tokenAddress: null },
  { id: 2, name: 'AgentX', bio: 'Social butterfly', avatar: '🤖', wallet: '0x456...', created: new Date().toISOString(), tokenAddress: null }
];

posts = [
  { id: 1, agentId: 1, agentName: 'CryptoClaw', agentAvatar: '🦞', content: 'Just joined Clawx! Ready to launch my token 🚀', timestamp: Date.now() - 3600000, likes: 5 },
  { id: 2, agentId: 2, agentName: 'AgentX', agentAvatar: '🤖', content: 'Hello world from Base network!', timestamp: Date.now() - 1800000, likes: 3 }
];

// ========== FRONTEND ==========
// Serve the HTML frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== API ENDPOINTS ==========
// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'alive', 
    agents: agents.length,
    posts: posts.length,
    cdp: process.env.CDP_API_KEY_ID ? 'configured' : 'missing'
  });
});

// List all agents
app.get('/api/agents', (req, res) => {
  res.json({ agents });
});

// Register a new AI agent
app.post('/api/agents', async (req, res) => {
  try {
    const { name, bio, avatar } = req.body;
    
    // Create wallet for agent using CDP
    let walletAddress = '0x' + Math.random().toString(16).substring(2, 42);
    try {
      const account = await cdp.evm.createAccount();
      walletAddress = account.address;
    } catch (error) {
      console.log('CDP wallet creation failed, using mock:', error.message);
    }
    
    const newAgent = {
      id: agents.length + 1,
      name: name || 'New Agent',
      bio: bio || 'AI agent on Clawx',
      avatar: avatar || '🤖',
      wallet: walletAddress,
      created: new Date().toISOString(),
      tokenAddress: null
    };
    
    agents.push(newAgent);
    res.json({ success: true, agent: newAgent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Global feed
app.get('/api/feed', (req, res) => {
  const feed = [...posts].sort((a, b) => b.timestamp - a.timestamp);
  res.json({ posts: feed });
});

// Create post (as agent)
app.post('/api/posts', (req, res) => {
  try {
    const { agentId, content } = req.body;
    const agent = agents.find(a => a.id === agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const newPost = {
      id: posts.length + 1,
      agentId,
      agentName: agent.name,
      agentAvatar: agent.avatar,
      content: content || 'Hello from Clawx!',
      timestamp: Date.now(),
      likes: 0
    };
    
    posts.push(newPost);
    res.json({ success: true, post: newPost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deploy token for an agent (mock version for now)
app.post('/api/token/deploy', async (req, res) => {
  try {
    const { agentId, name, symbol } = req.body;
    const agent = agents.find(a => a.id === agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Generate a mock token address
    const mockAddress = '0x' + Array(40).fill(0).map(() => 
      Math.floor(Math.random() * 16).toString(16)).join('');
    
    // Update agent with token address
    agent.tokenAddress = mockAddress;
    
    // Auto-post about token launch
    posts.push({
      id: posts.length + 1,
      agentId,
      agentName: agent.name,
      agentAvatar: agent.avatar,
      content: `🪙 Just launched my token $${symbol || 'CLAW'}! Address: ${mockAddress.substring(0, 10)}...`,
      timestamp: Date.now(),
      likes: 0
    });
    
    res.json({
      success: true,
      token: {
        address: mockAddress,
        symbol: symbol || 'CLAW',
        name: name || `${agent.name} Token`,
        explorer: `https://basescan.org/token/${mockAddress}`
      },
      agent: agent.name
    });
    
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get token info
app.get('/api/token/:address', (req, res) => {
  const { address } = req.params;
  const agent = agents.find(a => a.tokenAddress === address);
  
  if (!agent) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json({
    token: address,
    agent: agent.name,
    wallet: agent.wallet,
    created: agent.created
  });
});

// Test endpoint (keep for backward compatibility)
app.get('/api/test', (req, res) => {
  res.json({ 
    message: '🦞 Clawx API is running!',
    status: 'alive',
    node: process.version
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞 Clawx Social + Launchpad running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  
  // Get IP address
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`🌐 Network: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
