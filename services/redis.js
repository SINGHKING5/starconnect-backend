const { EventEmitter } = require('events');

// In-memory event emitter to replace Redis Pub/Sub
const eventEmitter = new EventEmitter();

// Simulate Redis-like interface with in-memory storage
class InMemoryRedis {
  constructor() {
    this.isConnected = true;
    this.channels = new Map();
  }

  async connect() {
    this.isConnected = true;
    console.log('✅ In-memory Redis connected successfully');
  }

  async quit() {
    this.isConnected = false;
    console.log('✅ In-memory Redis disconnected');
  }

  async publish(channel, message) {
    if (this.isConnected) {
      eventEmitter.emit(channel, message);
      console.log(`📡 Published to ${channel}:`, message);
    }
  }

  async subscribe(channel, callback) {
    if (this.isConnected) {
      eventEmitter.on(channel, callback);
      console.log(`📡 Subscribed to ${channel}`);
    }
  }

  async unsubscribe(channel) {
    if (this.isConnected) {
      eventEmitter.removeAllListeners(channel);
      console.log(`📡 Unsubscribed from ${channel}`);
    }
  }
}

// Create in-memory Redis instances
const client = new InMemoryRedis();
const subscriber = new InMemoryRedis();
const publisher = new InMemoryRedis();

// Connect to in-memory Redis
const connectRedis = async () => {
  try {
    await client.connect();
    await subscriber.connect();
    await publisher.connect();
    console.log('✅ In-memory Redis connected successfully');
  } catch (error) {
    console.error('❌ In-memory Redis connection error:', error);
  }
};

// Disconnect from in-memory Redis
const disconnectRedis = async () => {
  try {
    await client.quit();
    await subscriber.quit();
    await publisher.quit();
    console.log('✅ In-memory Redis disconnected');
  } catch (error) {
    console.error('❌ In-memory Redis disconnection error:', error);
  }
};

// Publish message to channel
const publishMessage = async (channel, message) => {
  try {
    await publisher.publish(channel, JSON.stringify(message));
    console.log(`📡 Published to ${channel}:`, message);
  } catch (error) {
    console.error('❌ In-memory Redis publish error:', error);
  }
};

// Subscribe to channel
const subscribeToChannel = async (channel, callback) => {
  try {
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch (error) {
        console.error('❌ Error parsing in-memory Redis message:', error);
      }
    });
    console.log(`📡 Subscribed to ${channel}`);
  } catch (error) {
    console.error('❌ In-memory Redis subscribe error:', error);
  }
};

// Unsubscribe from channel
const unsubscribeFromChannel = async (channel) => {
  try {
    await subscriber.unsubscribe(channel);
    console.log(`📡 Unsubscribed from ${channel}`);
  } catch (error) {
    console.error('❌ In-memory Redis unsubscribe error:', error);
  }
};

module.exports = {
  client,
  subscriber,
  publisher,
  connectRedis,
  disconnectRedis,
  publishMessage,
  subscribeToChannel,
  unsubscribeFromChannel
}; 