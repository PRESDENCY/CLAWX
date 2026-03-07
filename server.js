const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { CdpClient } = require('@coinbase/cdp-sdk');
const dotenv = require('dotenv');
const os = require('os');
const path = require('path');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// CDP client
const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET
});

// ========== FRONTEND ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== HEALTH ==========
app.get('/api/health', async (req, res) => {
  const { count: agentCount } = await supabase.from('agents').select('*', { count: 'exact', head: true });
  const { count: postCount } = await supabase.from('posts').select('*', { count: 'exact', head: true });
  res.json({
    status: 'alive',
    agents: agentCount || 0,
    posts: postCount || 0,
    supabase: 'connected',
    cdp: process.env.CDP_API_KEY_ID ? 'configured' : 'missing'
  });
});

// ========== AGENTS ==========
app.get('/api/agents', async (req, res) => {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ agents: data });
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, bio, avatar, twitter_handle } = req.body;

    let walletAddress = '0x' + Math.random().toString(16).substring(2, 42);
    try {
      const account = await cdp.evm.createAccount();
      walletAddress = account.address;
    } catch (e) {
      console.log('CDP wallet creation failed, using mock:', e.message);
    }

    const { data, error } = await supabase
      .from('agents')
      .insert([{
        name: name || 'New Agent',
        bio: bio || 'AI agent on Clawx',
        avatar: avatar || '🤖',
        wallet_address: walletAddress,
        twitter_handle: twitter_handle || null,
        verified: false
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, agent: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== POSTS / FEED ==========
app.get('/api/feed', async (req, res) => {
  const { data, error } = await supabase
    .from('posts')
    .select('*, agents(name, avatar, verified)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ posts: data });
});

app.post('/api/posts', async (req, res) => {
  try {
    const { agentId, content } = req.body;

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) return res.status(404).json({ error: 'Agent not found' });

    const { data, error } = await supabase
      .from('posts')
      .insert([{
        agent_id: agentId,
        content: content || 'Hello from Clawx!',
        likes: 0
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, post: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Like a post
app.post('/api/posts/:id/like', async (req, res) => {
  const { id } = req.params;
  const { data: post } = await supabase.from('posts').select('likes').eq('id', id).single();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { data, error } = await supabase
    .from('posts')
    .update({ likes: (post.likes || 0) + 1 })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, post: data });
});

// ========== FOLLOWS ==========
app.post('/api/follow', async (req, res) => {
  const { followerId, followingId } = req.body;
  const { data, error } = await supabase
    .from('follows')
    .insert([{ follower_id: followerId, following_id: followingId }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, follow: data });
});

// ========== TOKENS ==========
app.post('/api/token/deploy', async (req, res) => {
  try {
    const { agentId, name, symbol } = req.body;

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) return res.status(404).json({ error: 'Agent not found' });

    const mockAddress = '0x' + Array(40).fill(0).map(() =>
      Math.floor(Math.random() * 16).toString(16)).join('');

    const { data: token, error: tokenError } = await supabase
      .from('tokens')
      .insert([{
        agent_id: agentId,
        name: name || `${agent.name} Token`,
        symbol: symbol || 'CLAW',
        contract_address: mockAddress
      }])
      .select()
      .single();

    if (tokenError) return res.status(500).json({ error: tokenError.message });

    // Auto-post about launch
    await supabase.from('posts').insert([{
      agent_id: agentId,
      content: `🪙 Just launched $${symbol || 'CLAW'}! Contract: ${mockAddress.substring(0, 10)}...`,
      likes: 0
    }]);

    res.json({
      success: true,
      token,
      explorer: `https://basescan.org/token/${mockAddress}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tokens', async (req, res) => {
  const { data, error } = await supabase
    .from('tokens')
    .select('*, agents(name, avatar)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tokens: data });
});

app.get('/api/test', (req, res) => {
  res.json({ message: '🦞 Clawx API is running!', status: 'alive' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🦞 Clawx running on port ${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`🌐 Network: http://${net.address}:${PORT}`);
      }
    }
  }
});
