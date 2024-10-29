const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
    try {
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

        // If in mock mode, allow access with test user
        if (isMockMode) {
            req.user = {
                _id: 'test_user_id',
                email: 'test@gmail.com',
                name: 'Test User'
            };
            return next();
        }

        // Get token from Authorization header
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        // If no token in header, check localStorage via cookie
        if (!token) {
            token = req.cookies?.token;
        }

        // If still no token, check query params
        if (!token) {
            token = req.query?.token;
        }

        // If no token found anywhere, redirect to login
        if (!token) {
            console.log('No token found for route:', req.path);
            return res.redirect('/login');
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);

            if (!user) {
                console.log('No user found for token');
                return res.redirect('/login');
            }

            req.user = user;
            next();
        } catch (error) {
            console.error('Token verification failed:', error);
            return res.redirect('/login');
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.redirect('/login');
    }
};
