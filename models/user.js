const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    credits: {
        type: Number,
        default: 100, // Start with 100 free credits
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null
    },
    emailVerificationExpires: {
        type: Date,
        default: null
    },
    verificationAttempts: {
        type: Number,
        default: 0
    },
    lastVerificationEmailSent: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Method to deduct credits
userSchema.methods.deductCredits = async function(amount) {
    if (this.credits < amount) {
        throw new Error('Insufficient credits');
    }
    this.credits -= amount;
    return this.save();
};

// Method to add credits
userSchema.methods.addCredits = async function(amount) {
    this.credits += amount;
    return this.save();
};

// Method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set the token and expiration (24 hours)
    this.emailVerificationToken = token;
    this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    this.lastVerificationEmailSent = new Date();
    
    return token;
};

// Method to verify email token
userSchema.methods.verifyEmailToken = function(token) {
    if (!this.emailVerificationToken || !this.emailVerificationExpires) {
        return false;
    }
    
    // Check if token has expired
    if (Date.now() > this.emailVerificationExpires.getTime()) {
        return false;
    }
    
    // Check if token matches
    if (this.emailVerificationToken !== token) {
        return false;
    }
    
    return true;
};

// Method to verify email
userSchema.methods.verifyEmail = async function() {
    this.isEmailVerified = true;
    this.emailVerificationToken = null;
    this.emailVerificationExpires = null;
    this.verificationAttempts = 0;
    return this.save();
};

// Method to check if user can receive verification email
userSchema.methods.canReceiveVerificationEmail = function() {
    const now = new Date();
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes cooldown
    
    // Check if email is already verified
    if (this.isEmailVerified) {
        return { canSend: false, reason: 'Email is already verified' };
    }
    
    // Check verification attempts limit (max 5 per day)
    if (this.verificationAttempts >= 5) {
        const daysSinceLastAttempt = this.lastVerificationEmailSent ? 
            (now - this.lastVerificationEmailSent) / (24 * 60 * 60 * 1000) : 1;
        
        if (daysSinceLastAttempt < 1) {
            return { canSend: false, reason: 'Too many verification attempts. Please try again tomorrow.' };
        } else {
            // Reset attempts after 24 hours
            this.verificationAttempts = 0;
        }
    }
    
    // Check cooldown period
    if (this.lastVerificationEmailSent) {
        const timeSinceLastEmail = now - this.lastVerificationEmailSent;
        if (timeSinceLastEmail < cooldownPeriod) {
            const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastEmail) / 60000);
            return { 
                canSend: false, 
                reason: `Please wait ${remainingTime} minute(s) before requesting another verification email.` 
            };
        }
    }
    
    return { canSend: true };
};

module.exports = mongoose.model('User', userSchema); 