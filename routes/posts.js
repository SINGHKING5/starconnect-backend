const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { publishMessage } = require('../services/redis');

// In-memory storage for posts (exported for use in other modules)
const posts = [
  {
    id: 1,
    userId: 1,
    content: 'Excited to connect with my fans on StarConnect!',
    image: null,
    timestamp: new Date(),
    likes: [], // Array of user IDs who liked this post
    comments: [
      {
        id: 1,
        userId: 2,
        text: 'Welcome to StarConnect! Looking forward to your posts!',
        timestamp: new Date(Date.now() - 300000) // 5 minutes ago
      }
    ]
  },
  {
    id: 2,
    userId: 2,
    content: 'Just joined StarConnect to follow my favorite celebrities!',
    image: null,
    timestamp: new Date(),
    likes: [],
    comments: []
  }
];

// Validation middleware
const validatePostContent = (req, res, next) => {
  const { content } = req.body;
  
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ 
      error: 'Post content is required and must be a string' 
    });
  }
  
  if (content.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Post content cannot be empty' 
    });
  }
  
  if (content.length > 1000) {
    return res.status(400).json({ 
      error: 'Post content cannot exceed 1000 characters' 
    });
  }
  
  // Sanitize content
  req.body.content = content.trim();
  next();
};

// Image validation middleware
const validateImagePayload = (req, res, next) => {
  const { image } = req.body;
  
  if (image && typeof image === 'string') {
    // Check if it's a Base64 image
    if (image.startsWith('data:image/')) {
      // Calculate approximate size (Base64 is ~33% larger than binary)
      const base64Size = image.length * 0.75; // Approximate binary size
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      
      if (base64Size > maxSize) {
        return res.status(400).json({
          error: 'Image size exceeds 10MB limit. Please use a smaller image.'
        });
      }
      
      // Validate Base64 format
      try {
        const matches = image.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches) {
          return res.status(400).json({
            error: 'Invalid image format. Please provide a valid Base64 encoded image.'
          });
        }
        
        const imageType = matches[1].toLowerCase();
        if (!['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(imageType)) {
          return res.status(400).json({
            error: 'Unsupported image format. Please use JPEG, PNG, GIF, or WebP.'
          });
        }
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid image data format.'
        });
      }
    }
  }
  
  next();
};

// GET /api/posts - Get all posts with pagination
router.get('/', authenticateToken, (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get users for post enrichment
    const users = require('../data/users');
    
    const postsWithUserInfo = posts.map(post => {
      const user = users.find(u => u.id === post.userId);
      
      // Enrich comments with user information
      const enrichedComments = (post.comments || []).map(comment => {
        const commentUser = users.find(u => u.id === comment.userId);
        return {
          ...comment,
          user: {
            id: commentUser?.id || comment.userId,
            name: commentUser?.name || 'Unknown User',
            avatar: null
          }
        };
      });
      
      return {
        ...post,
        comments: enrichedComments,
        userName: user ? user.name : 'Unknown User',
        userType: user ? user.type : 'unknown'
      };
    });

    // Sort posts by timestamp (newest first)
    const sortedPosts = postsWithUserInfo.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply pagination
    const paginatedPosts = sortedPosts.slice(offset, offset + limit);
    
    // Calculate pagination info
    const totalPosts = sortedPosts.length;
    const totalPages = Math.ceil(totalPosts / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      posts: paginatedPosts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasNextPage,
        hasPrevPage,
        limit
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts - Create a new post
router.post('/', authenticateToken, validatePostContent, validateImagePayload, (req, res) => {
  try {
    const { content, image, authorId, timestamp } = req.body;
    
    // Log payload size for debugging
    const payloadSize = JSON.stringify(req.body).length;
    console.log(`Creating post - Payload size: ${(payloadSize / 1024 / 1024).toFixed(2)}MB`);
    
    // Validate authorId matches the authenticated user (security check)
    if (authorId && parseInt(authorId) !== req.user.userId) {
      return res.status(403).json({ 
        error: 'Author ID does not match authenticated user' 
      });
    }
    
    // Generate new post ID
    const newId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;
    
    // Create new post object with provided timestamp or current time
    const newPost = {
      id: newId,
      userId: req.user.userId, // Always use authenticated user ID for security
      content: content,
      image: image || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(), // Use provided timestamp or current time
      likes: [],
      comments: []
    };

    // Add to posts array
    posts.push(newPost);
    
    console.log(`Post created successfully - ID: ${newId}, User: ${req.user.name}`);

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('newPost', {
        ...newPost,
        userName: req.user.name,
        userType: req.user.type
      });
    }

    // Publish to Redis for notifications (only if user is a celebrity)
    if (req.user.type === 'celebrity') {
      publishMessage('newPost', {
        post: newPost,
        author: {
          id: req.user.userId,
          name: req.user.name,
          type: req.user.type
        }
      });
    }

    // Return the created post with user info
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
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

// GET /api/posts/:id - Get a specific post
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const post = posts.find(p => p.id === postId);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Get users for post enrichment
    const users = require('../data/users');
    const user = users.find(u => u.id === post.userId);
    
    res.json({
      success: true,
      post: {
        ...post,
        userName: user ? user.name : 'Unknown User',
        userType: user ? user.type : 'unknown'
      }
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/posts/:id - Delete a post (only by author)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const postIndex = posts.findIndex(p => p.id === postId);
    
    if (postIndex === -1) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const post = posts[postIndex];
    
    // Check if user is the author
    if (post.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }
    
    // Remove post from array
    posts.splice(postIndex, 1);
    
    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/like - Toggle like for a post
router.post('/:id/like', authenticateToken, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user.userId;
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (!post.likes) post.likes = [];
    const liked = post.likes.includes(userId);
    if (liked) {
      post.likes = post.likes.filter(id => id !== userId);
    } else {
      post.likes.push(userId);
    }
    // Get users for enrichment
    const users = require('../data/users');
    const user = users.find(u => u.id === post.userId);
    const liker = users.find(u => u.id === userId);
    
    // Publish to Redis for notifications (only if liking, not unliking)
    if (!liked && liker && user) {
      publishMessage('newLike', {
        post: post,
        liker: {
          id: liker.id,
          name: liker.name,
          type: liker.type
        },
        postAuthor: {
          id: user.id,
          name: user.name,
          type: user.type
        }
      });
    }
    
    res.json({
      success: true,
      post: {
        ...post,
        userName: user ? user.name : 'Unknown User',
        userType: user ? user.type : 'unknown'
      },
      liked: !liked
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/comment - Add a comment to a post
router.post('/:id/comment', authenticateToken, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { text } = req.body;
    const userId = req.user.userId;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    
    if (text.length > 500) {
      return res.status(400).json({ error: 'Comment cannot exceed 500 characters' });
    }
    
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (!post.comments) {
      post.comments = [];
    }
    
    // Generate new comment ID
    const newCommentId = post.comments.length > 0 
      ? Math.max(...post.comments.map(c => c.id)) + 1 
      : 1;
    
    const newComment = {
      id: newCommentId,
      userId: userId,
      text: text.trim(),
      timestamp: new Date()
    };
    
    post.comments.push(newComment);
    
    // Get users for enrichment
    const users = require('../data/users');
    const commentUser = users.find(u => u.id === userId);
    const postUser = users.find(u => u.id === post.userId);
    
    // Publish to Redis for notifications
    if (commentUser && postUser) {
      publishMessage('newComment', {
        post: post,
        comment: newComment,
        commenter: {
          id: commentUser.id,
          name: commentUser.name,
          type: commentUser.type
        },
        postAuthor: {
          id: postUser.id,
          name: postUser.name,
          type: postUser.type
        }
      });
    }
    
    // Return enriched comment and post
    const enrichedComment = {
      ...newComment,
      user: {
        id: commentUser?.id || userId,
        name: commentUser?.name || 'Unknown User',
        avatar: null // Could be added later
      }
    };
    
    res.status(201).json({
      success: true,
      comment: enrichedComment,
      post: {
        ...post,
        userName: postUser ? postUser.name : 'Unknown User',
        userType: postUser ? postUser.type : 'unknown'
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.posts = posts; // Export posts array for use in other modules 