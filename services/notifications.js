// In-memory storage for notifications
const notifications = new Map(); // userId -> notifications[]
const userSockets = new Map(); // userId -> socketId[]

// Add notification for a user
const addNotification = (userId, notification) => {
  if (!notifications.has(userId)) {
    notifications.set(userId, []);
  }
  
  const userNotifications = notifications.get(userId);
  const newNotification = {
    id: Date.now() + Math.random(),
    ...notification,
    timestamp: new Date().toISOString(),
    read: false
  };
  
  userNotifications.unshift(newNotification); // Add to beginning
  
  // Keep only last 50 notifications per user
  if (userNotifications.length > 50) {
    userNotifications.splice(50);
  }
  
  notifications.set(userId, userNotifications);
  return newNotification;
};

// Get notifications for a user
const getNotifications = (userId, limit = 20) => {
  if (!notifications.has(userId)) {
    return [];
  }
  
  const userNotifications = notifications.get(userId);
  return userNotifications.slice(0, limit);
};

// Get unread notification count for a user
const getUnreadCount = (userId) => {
  if (!notifications.has(userId)) {
    return 0;
  }
  
  const userNotifications = notifications.get(userId);
  return userNotifications.filter(notification => !notification.read).length;
};

// Mark notification as read
const markAsRead = (userId, notificationId) => {
  if (!notifications.has(userId)) {
    return false;
  }
  
  const userNotifications = notifications.get(userId);
  const notification = userNotifications.find(n => n.id === notificationId);
  
  if (notification) {
    notification.read = true;
    return true;
  }
  
  return false;
};

// Mark all notifications as read for a user
const markAllAsRead = (userId) => {
  if (!notifications.has(userId)) {
    return false;
  }
  
  const userNotifications = notifications.get(userId);
  userNotifications.forEach(notification => {
    notification.read = true;
  });
  
  return true;
};

// Register user socket
const registerUserSocket = (userId, socketId) => {
  userSockets.set(userId, socketId);
};

// Unregister user socket
const unregisterUserSocket = (userId) => {
  userSockets.delete(userId);
};

// Get user socket ID
const getUserSocket = (userId) => {
  return userSockets.get(userId);
};

// Send notification to user via socket
const sendNotificationToUser = (userId, notification, io) => {
  const socketId = getUserSocket(userId);
  if (socketId && io) {
    io.to(socketId).emit('newNotification', notification);
    console.log(`📨 Sent notification to user ${userId}:`, notification);
  }
};

// Create notification for new post
const createPostNotification = (post, author) => {
  return {
    type: 'newPost',
    title: 'New Post',
    message: `${author.name} just posted something new!`,
    data: {
      postId: post.id,
      authorId: post.userId,
      authorName: author.name,
      content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : '')
    }
  };
};

// Create notification for new like
const createLikeNotification = (post, liker, postAuthor) => {
  return {
    type: 'newLike',
    title: 'New Like',
    message: `${liker.name} liked your post`,
    data: {
      postId: post.id,
      likerId: liker.id,
      likerName: liker.name
    }
  };
};

// Create notification for new comment
const createCommentNotification = (post, commenter, postAuthor) => {
  return {
    type: 'newComment',
    title: 'New Comment',
    message: `${commenter.name} commented on your post`,
    data: {
      postId: post.id,
      commentId: comment.id,
      commenterId: commenter.id,
      commenterName: commenter.name,
      commentText: comment.text.substring(0, 50) + (comment.text.length > 50 ? '...' : '')
    }
  };
};

module.exports = {
  addNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerUserSocket,
  unregisterUserSocket,
  getUserSocket,
  sendNotificationToUser,
  createPostNotification,
  createLikeNotification,
  createCommentNotification
}; 