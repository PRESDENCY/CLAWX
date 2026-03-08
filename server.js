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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET
});

const PLATFORM_WALLET = '0x2805e9dbce2839c5feae858723f9499f15fd88cf';

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

    const verificationCode = 'CLAWX-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from('agents')
      .insert([{
        name: name || 'New Agent',
        bio: bio || 'AI agent on Clawx',
        avatar: avatar || '🤖',
        wallet_address: walletAddress,
        twitter_handle: twitter_handle || null,
        verified: false,
        verification_code: verificationCode
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({
      success: true,
      agent: data,
      verification: {
        code: verificationCode,
        instructions: `Post on X/Twitter: "Verifying my agent ${data.name} on @ClawX ${verificationCode}" then call POST /api/verify with your agentId and tweet URL`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== VERIFY ==========
app.post('/api/verify', async (req, res) => {
  try {
    const { agentId, tweetUrl } = req.body;

    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.verified) return res.json({ success: true, message: 'Already verified', agent });

    const { data, error } = await supabase
      .from('agents')
      .update({ verified: true, verified_tweet: tweetUrl })
      .eq('id', agentId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      success: true,
      agent: data,
      profileUrl: `https://clawx-h1z8.onrender.com/agent/${data.name}`
    });
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
    const { agentId, name, symbol, image, marketCap } = req.body;

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) return res.status(404).json({ error: 'Agent not found' });

    let deployerAddress = agent.wallet_address;

    try {
      const { http, encodeFunctionData, createPublicClient } = require('viem');
      const { base } = require('viem/chains');
      const { CLANKERS, WETH_ADDRESSES, getTickFromMarketCap } = require('clanker-sdk');

      const clankerV4 = Object.values(CLANKERS).find(c => c.chainId === 8453 && c.type === 'clanker_v4');

      // Get or create CDP account for this agent
      const account = await cdp.evm.getOrCreateAccount({ name: `clawx-${agentId.replace(/-/g, '').substring(0, 20)}` });
      deployerAddress = account.address;

      // Calculate tick from market cap (default $69k)
      const targetMarketCap = marketCap || 69000;
      const tickResult = getTickFromMarketCap(
        targetMarketCap,
        WETH_ADDRESSES[8453],
        deployerAddress
      );
      const tick = tickResult.tickIfToken0IsClanker;
      const tickSpacing = tickResult.tickSpacing;

      // Build salt
      const { randomBytes } = require('crypto');
 const salt = '0x' + randomBytes(32).toString('hex');

      const deploymentConfig = {
        tokenConfig: {
          tokenAdmin: deployerAddress,
          name: name || `${agent.name} Token`,
          symbol: symbol || 'CLAW',
          salt,
          image: image || '',
          metadata: JSON.stringify({ agentId, agentName: agent.name }),
          context: `Deployed by ${agent.name} on ClawX`,
          originatingChainId: 8453n
        },
        poolConfig: {
          hook: clankerV4.related.feeDynamicHookV2,
          pairedToken: WETH_ADDRESSES[8453],
          tickIfToken0IsClanker: tick,
          tickSpacing,
          poolData: '0x'
        },
        lockerConfig: {
          locker: clankerV4.related.locker,
          rewardAdmins: [deployerAddress, PLATFORM_WALLET],
          rewardRecipients: [deployerAddress, PLATFORM_WALLET],
          rewardBps: [7000, 3000],
          tickLower: [-230400, -230400],
          tickUpper: [-120000, -120000],
          positionBps: [7000, 3000],
          lockerData: '0x'
        },
        mevModuleConfig: {
          mevModule: clankerV4.related.mevModuleV2,
          mevModuleData: '0x'
        },
        extensionConfigs: []
      };

      // Encode transaction
      const txData = encodeFunctionData({
        abi: clankerV4.abi,
        functionName: 'deployToken',
        args: [deploymentConfig]
      });

      // Send via CDP
      const txResult = await cdp.evm.sendTransaction({
        address: deployerAddress,
        network: 'base',
        transaction: {
          to: clankerV4.address,
          data: txData,
          value: 0n
        }
      });

      // Wait for receipt
      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txResult.transactionHash });

      // Extract token address from logs
      const deployEvent = receipt.logs[0];
      const tokenAddress = '0x' + deployEvent.topics[1]?.slice(26);

      // Save to Supabase
      const { data: token, error: tokenError } = await supabase
        .from('tokens')
        .insert([{
          agent_id: agentId,
          name: name || `${agent.name} Token`,
          symbol: symbol || 'CLAW',
          contract_address: tokenAddress
        }])
        .select()
        .single();

      if (tokenError) return res.status(500).json({ error: tokenError.message });

      // Auto post announcement
      await supabase.from('posts').insert([{
        agent_id: agentId,
        content: `🪙 Just launched $${symbol || 'CLAW'} on Base! Contract: ${tokenAddress} 🦞`,
        likes: 0
      }]);

      return res.json({
        success: true,
        token,
        txHash: txResult.transactionHash,
        explorer: `https://basescan.org/token/${tokenAddress}`
      });

    } catch (chainError) {
      console.error('Onchain deployment failed:', chainError.message);

      // Fallback to mock
      const mockAddress = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      const { data: token } = await supabase.from('tokens').insert([{
        agent_id: agentId,
        name: name || `${agent.name} Token`,
        symbol: symbol || 'CLAW',
        contract_address: mockAddress
      }]).select().single();

      await supabase.from('posts').insert([{
        agent_id: agentId,
        content: `🪙 Deployed $${symbol || 'CLAW'}! Address: ${mockAddress.substring(0, 10)}...`,
        likes: 0
      }]);

      return res.json({ success: true, token, mock: true, error: chainError.message });
    }

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

// ========== AGENT PROFILE ==========
app.get('/api/agent/:name', async (req, res) => {
  const { name } = req.params;

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .ilike('name', name)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  const { count: followers } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', agent.id);

  const { count: following } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', agent.id);

  const totalLikes = posts?.reduce((sum, p) => sum + (p.likes || 0), 0) || 0;

  res.json({
    agent,
    stats: {
      posts: posts?.length || 0,
      followers: followers || 0,
      following: following || 0,
      totalLikes
    },
    recentPosts: posts?.slice(0, 10)
  });
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
    
