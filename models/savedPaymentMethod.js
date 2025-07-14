const mongoose = require('mongoose');

const savedPaymentMethodSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    customerId: {
        type: String,
        required: true // Paddle customer ID
    },
    paymentMethodId: {
        type: String,
        required: true // Paddle payment method ID
    },
    type: {
        type: String,
        required: true,
        enum: ['card', 'paypal', 'bank_transfer']
    },
    details: {
        // Card details (masked)
        last4: String,
        brand: String, // visa, mastercard, etc.
        expiryMonth: String,
        expiryYear: String,
        
        // PayPal details
        email: String,
        
        // Bank transfer details
        bankName: String,
        accountLast4: String
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUsed: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Ensure only one default payment method per user
savedPaymentMethodSchema.pre('save', async function(next) {
    if (this.isDefault && this.isModified('isDefault')) {
        // Remove default flag from other payment methods for this user
        await this.constructor.updateMany(
            { userId: this.userId, _id: { $ne: this._id } },
            { isDefault: false }
        );
    }
    next();
});

// Index for efficient queries
savedPaymentMethodSchema.index({ userId: 1, isActive: 1 });
savedPaymentMethodSchema.index({ customerId: 1 });

module.exports = mongoose.model('SavedPaymentMethod', savedPaymentMethodSchema);