const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Import services
const { connectRedis, disconnectRedis, publishMessage, subscribeToChannel } = require('./services/redis');
const { 
  registerUserSocket, 
  unregisterUserSocket, 
  addNotification, 
  getNotifications, 
  getUnreadCount, 
  markAsRead, 
  markAllAsRead,
  sendNotificationToUser,
  createPostNotification,
  createLikeNotification,
  createCommentNotification
} = require('./services/notifications');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"]
  }
});

// Make io available to routes
app.set('io', io);

// Connect to Redis
connectRedis();

// Middleware
app.use(cors());

// Increase payload limits for image uploads (up to 10MB)
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for potential use
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Add timeout middleware for large requests
app.use((req, res, next) => {
  // Set timeout for large requests (30 seconds)
  req.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout - file too large or processing too slow' });
  });
  next();
});

// Import middleware and data
const { authenticateToken, JWT_SECRET } = require('./middleware/auth');
const users = require('./data/users');

// Import routes
const postsRouter = require('./routes/posts');
const usersRouter = require('./routes/users');

// Use routes
app.use('/api/posts', postsRouter);
app.use('/api/users', usersRouter);

// Subscribe to Redis channels for real-time updates
subscribeToChannel('newPost', async (data) => {
  try {
    const { post, author } = data;
    const users = require('./data/users');
    
    // Find all users who follow this celebrity
    const followers = users.filter(user => 
      user.following && user.following.includes(author.id)
    );
    
    // Create notification for each follower
    followers.forEach(follower => {
      const notification = createPostNotification(post, author);
      addNotification(follower.id, notification);
      sendNotificationToUser(follower.id, notification, io);
    });
    
    console.log(`📢 Sent new post notifications to ${followers.length} followers`);
  } catch (error) {
    console.error('❌ Error handling new post notification:', error);
  }
});

subscribeToChannel('newLike', async (data) => {
  try {
    const { post, liker, postAuthor } = data;
    
    // Don't notify if user likes their own post
    if (liker.id === postAuthor.id) return;
    
    const notification = createLikeNotification(post, liker, postAuthor);
    addNotification(postAuthor.id, notification);
    sendNotificationToUser(postAuthor.id, notification, io);
    
    console.log(`❤️ Sent like notification to ${postAuthor.name}`);
  } catch (error) {
    console.error('❌ Error handling like notification:', error);
  }
});

subscribeToChannel('newComment', async (data) => {
  try {
    const { post, comment, commenter, postAuthor } = data;
    
    // Don't notify if user comments on their own post
    if (commenter.id === postAuthor.id) return;
    
    const notification = createCommentNotification(post, comment, commenter, postAuthor);
    addNotification(postAuthor.id, notification);
    sendNotificationToUser(postAuthor.id, notification, io);
    
    console.log(`💬 Sent comment notification to ${postAuthor.name}`);
  } catch (error) {
    console.error('❌ Error handling comment notification:', error);
  }
});

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

// GET /api/notifications - Get user notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const notifications = getNotifications(userId);
    const unreadCount = getUnreadCount(userId);
    
    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/:id/read - Mark notification as read
app.post('/api/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;
    
    const success = markAsRead(userId, notificationId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({ error: 'Notification not found' });
    }
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/read-all - Mark all notifications as read
app.post('/api/notifications/read-all', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    markAllAsRead(userId);
    
    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy routes for backward compatibility
// GET /posts - Get all posts (redirects to new API)
app.get('/posts', authenticateToken, (req, res) => {
  // Redirect to new API endpoint
  res.redirect('/api/posts');
});

// POST /posts - Create a new post (redirects to new API)
app.post('/posts', authenticateToken, (req, res) => {
  // Redirect to new API endpoint
  res.redirect('/api/posts');
});

// GET /feed - Get personalized feed for the authenticated user
app.get('/feed', authenticateToken, (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get posts from the posts router
    const { posts } = require('./routes/posts');
    
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

  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;
      
      // Register user socket
      registerUserSocket(userId, socket.id);
      socket.userId = userId;
      
      // Join user's personal room
      socket.join(`user_${userId}`);
      
      // Send current unread notification count
      const unreadCount = getUnreadCount(userId);
      socket.emit('notificationCount', { unreadCount });
      
      console.log(`🔗 User ${userId} authenticated on socket ${socket.id}`);
    } catch (error) {
      console.error('❌ Socket authentication error:', error);
      socket.emit('authError', { message: 'Authentication failed' });
    }
  });

  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      unregisterUserSocket(socket.userId);
      console.log(`🔌 User ${socket.userId} disconnected from socket ${socket.id}`);
    } else {
      console.log('User disconnected:', socket.id);
    }
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
  console.log(`📝 Posts API: http://localhost:${PORT}/api/posts`);
  console.log(`👤 Users API: http://localhost:${PORT}/api/users`);
  console.log(`🔔 Notifications API: http://localhost:${PORT}/api/notifications`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await disconnectRedis();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io }; 