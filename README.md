# StarConnect Backend

This is the backend for **StarConnect**, a social media platform with real-time capabilities, allowing celebrities to post updates and public users to receive them instantly.

---

## 🚀 Features

- JWT-based mock authentication with user roles (Celebrity & Public)
- REST APIs for post creation, fetching, comments, and likes
- Redis Pub/Sub for broadcasting real-time events across server instances
- WebSocket (Socket.IO) for real-time notifications
- In-memory data storage for simplicity
- Graceful shutdown handling for Redis
- CORS support for frontend communication

---

## ⚙️ Tech Stack

- Node.js
- Express.js
- Socket.IO
- Redis (In-memory)
- UUID (for unique IDs)
- dotenv

---

## 📦 Setup Instructions

1. Clone the repo  
bash
git clone https://github.com/your-username/starconnect-backend.git
cd starconnect-backend

2. Install dependencies
bash
Copy
Edit
npm install
Create a .env file

3. env
Copy
Edit
PORT=5050
JWT_SECRET=supersecretkey


4. Start the server
bash
Copy
Edit
node index.js


