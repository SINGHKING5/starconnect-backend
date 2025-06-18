const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { posts } = require('./posts');

// GET /api/users/:userId - Get user profile
router.get('/:userId', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const users = require('../data/users');
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's posts
    const userPosts = posts.filter(p => p.userId === userId);
    
    // Check if current user is following this user
    const currentUserId = req.user.userId;
    const currentUser = users.find(u => u.id === currentUserId);
    const isFollowing = currentUser && currentUser.following && currentUser.following.includes(userId);
    
    // Return user profile without sensitive data
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        type: user.type,
        followers: user.followers || [],
        following: user.following || [],
        followerCount: (user.followers || []).length,
        followingCount: (user.following || []).length,
        posts: userPosts.length
      },
      isFollowing,
      canFollow: req.user.type === 'public' && user.type === 'celebrity'
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:userId/follow - Follow a user
router.post('/:userId/follow', authenticateToken, (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const currentUserId = req.user.userId;
    
    // Get users
    const users = require('../data/users');
    const currentUser = users.find(u => u.id === currentUserId);
    const targetUser = users.find(u => u.id === targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }
    
    // Only public users can follow celebrities
    if (currentUser.type !== 'public' || targetUser.type !== 'celebrity') {
      return res.status(403).json({ error: 'Only public users can follow celebrities' });
    }
    
    // Check if already following
    if (!currentUser.following) currentUser.following = [];
    if (!targetUser.followers) targetUser.followers = [];
    
    const isFollowing = currentUser.following.includes(targetUserId);
    
    if (isFollowing) {
      // Unfollow
      currentUser.following = currentUser.following.filter(id => id !== targetUserId);
      targetUser.followers = targetUser.followers.filter(id => id !== currentUserId);
    } else {
      // Follow
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
    }
    
    res.json({
      success: true,
      isFollowing: !isFollowing,
      followerCount: targetUser.followers.length,
      message: isFollowing ? 'Unfollowed successfully' : 'Followed successfully'
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:userId/posts - Get user's posts
router.get('/:userId/posts', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get users for post enrichment
    const users = require('../data/users');
    
    // Filter posts by user
    const userPosts = posts.filter(p => p.userId === userId);
    
    const postsWithUserInfo = userPosts.map(post => {
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
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 