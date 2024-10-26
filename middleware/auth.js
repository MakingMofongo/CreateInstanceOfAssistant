const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  // Check session settings first
  const sessionSettings = req.headers['x-session-settings'];
  let isMockMode = process.env.IS_MOCK === 'true';

  if (sessionSettings) {
    try {
      const settings = JSON.parse(sessionSettings);
      if (settings.isActive) {
        isMockMode = settings.IS_MOCK;
      }
    } catch (error) {
      console.error('Error parsing session settings:', error);
    }
  }

  // If in mock mode, set mock user and continue
  if (isMockMode) {
    req.user = {
      _id: 'test_user_id',
      email: 'test@gmail.com',
      name: 'Test User'
    };
    return next();
  }

  // Regular auth check
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};
