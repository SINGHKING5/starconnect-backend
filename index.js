const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'starconnect_secret';

// In-memory storage (replace with database in production)
const users = [
  {
    id: 1,
    email: 'celeb@example.com',
    password: '123456', // password: 123456
    type: 'celebrity',
    name: 'John Celebrity',
    followers: [],
    following: []
  },
  {
    id: 2,
    email: 'user@example.com',
    password: '123456', // password: 123456
    type: 'public',
    name: 'Jane Public',
    followers: [],
    following: []
  }
];

const posts = [
  {
    id: 1,
    userId: 1,
    content: 'Excited to connect with my fans on StarConnect!',
    timestamp: new Date(),
    likes: 0,
    comments: []
  },
  {
    id: 2,
    userId: 2,
    content: 'Just joined StarConnect to follow my favorite celebrities!',
    timestamp: new Date(),
    likes: 0,
    comments: []
  }
];

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// POST /login - User authentication
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password (plain string comparison for demo)
    if (password !== user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        type: user.type,
        name: user.name 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        type: user.type,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /posts - Get all posts
app.get('/posts', authenticateToken, (req, res) => {
  try {
    const postsWithUserInfo = posts.map(post => {
      const user = users.find(u => u.id === post.userId);
      return {
        ...post,
        userName: user ? user.name : 'Unknown User',
        userType: user ? user.type : 'unknown'
      };
    });

    res.json({
      success: true,
      posts: postsWithUserInfo.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /posts - Create a new post
app.post('/posts', authenticateToken, (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const newPost = {
      id: posts.length + 1,
      userId: req.user.userId,
      content: content.trim(),
      timestamp: new Date(),
      likes: 0,
      comments: []
    };

    posts.push(newPost);

    // Emit socket event for real-time updates
    io.emit('newPost', {
      ...newPost,
      userName: req.user.name,
      userType: req.user.type
    });

    res.json({
      success: true,
      post: {
        ...newPost,
        userName: req.user.name,
        userType: req.user.type
      }
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /feed - Get personalized feed for the authenticated user
app.get('/feed', authenticateToken, (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get posts from users that the current user follows
    const followingIds = user.following;
    const feedPosts = posts
      .filter(post => followingIds.includes(post.userId) || post.userId === req.user.userId)
      .map(post => {
        const postUser = users.find(u => u.id === post.userId);
        return {
          ...post,
          userName: postUser ? postUser.name : 'Unknown User',
          userType: postUser ? postUser.type : 'unknown'
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      posts: feedPosts
    });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /follow - Follow or unfollow a user
app.post('/follow', authenticateToken, (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const currentUser = users.find(u => u.id === req.user.userId);
    const targetUser = users.find(u => u.id === parseInt(targetUserId));

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (currentUser.id === targetUser.id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const isFollowing = currentUser.following.includes(targetUser.id);

    if (isFollowing) {
      // Unfollow
      currentUser.following = currentUser.following.filter(id => id !== targetUser.id);
      targetUser.followers = targetUser.followers.filter(id => id !== currentUser.id);
    } else {
      // Follow
      currentUser.following.push(targetUser.id);
      targetUser.followers.push(currentUser.id);
    }

    // Emit socket event for real-time updates
    io.emit('followUpdate', {
      followerId: currentUser.id,
      followerName: currentUser.name,
      targetUserId: targetUser.id,
      targetUserName: targetUser.name,
      action: isFollowing ? 'unfollowed' : 'followed'
    });

    res.json({
      success: true,
      action: isFollowing ? 'unfollowed' : 'followed',
      following: currentUser.following,
      followers: targetUser.followers
    });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users - Get all users (for following suggestions)
app.get('/users', authenticateToken, (req, res) => {
  try {
    const currentUser = users.find(u => u.id === req.user.userId);
    const otherUsers = users
      .filter(user => user.id !== req.user.userId)
      .map(user => ({
        id: user.id,
        name: user.name,
        type: user.type,
        isFollowing: currentUser.following.includes(user.id),
        followersCount: user.followers.length
      }));

    res.json({
      success: true,
      users: otherUsers
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('userTyping', data);
  });

  socket.on('stopTyping', (data) => {
    socket.broadcast.emit('userStopTyping', data);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5050;

server.listen(PORT, () => {
  console.log(`🚀 StarConnect server running on port ${PORT}`);
  console.log(`📡 Socket.io initialized`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

module.exports = { app, server, io }; 