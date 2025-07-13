const User = require('../models/user');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/auth/login');
    }
    next();
};

// Middleware to check if user is not authenticated (for login/register pages)
const requireGuest = (req, res, next) => {
    if (req.session.userId) {
        return res.redirect('/upload');
    }
    next();
};

// Middleware to get current user data
const getCurrentUser = async (req, res, next) => {
    if (req.session.userId) {
        try {
            const user = await User.findById(req.session.userId).select('-password');
            req.user = user;
            res.locals.user = user;
        } catch (error) {
            console.error('Error fetching user:', error);
            req.user = null;
            res.locals.user = null;
        }
    } else {
        req.user = null;
        res.locals.user = null;
    }
    next();
};

// Middleware to check if user has sufficient credits
const requireCredits = (amount = 1) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.redirect('/auth/login');
        }
        
        if (req.user.credits < amount) {
            return res.status(402).json({ 
                error: 'Insufficient credits', 
                required: amount, 
                available: req.user.credits 
            });
        }
        
        next();
    };
};

module.exports = {
    requireAuth,
    requireGuest,
    getCurrentUser,
    requireCredits
}; 