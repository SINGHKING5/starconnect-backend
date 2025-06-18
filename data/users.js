// In-memory storage for users (exported for use in other modules)
const users = [
  {
    id: 1,
    email: 'celeb@example.com',
    password: '123456', // password: 123456
    type: 'celebrity',
    name: 'John Celebrity',
    followers: [2], // Jane Public follows this celebrity
    following: []
  },
  {
    id: 2,
    email: 'user@example.com',
    password: '123456', // password: 123456
    type: 'public',
    name: 'Jane Public',
    followers: [],
    following: [1] // Following John Celebrity
  }
];

module.exports = users; 