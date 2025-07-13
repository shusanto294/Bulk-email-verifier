const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    paymentId: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    credits: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['crypto', 'card', 'paddle'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'failed', 'expired', 'cancelled'],
        default: 'pending'
    },
    paymentAddress: {
        type: String
    },
    paymentAmount: {
        type: Number
    },
    paymentCurrency: {
        type: String
    },
    paymentUrl: {
        type: String
    },
    expiresAt: {
        type: Date
    },
    confirmedAt: {
        type: Date
    },
    // Paddle-specific fields
    paddleSubscriptionId: {
        type: String
    },
    paddleCustomerId: {
        type: String
    },
    paddleTransactionId: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Index for faster queries
paymentSchema.index({ userId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ expiresAt: 1 });
paymentSchema.index({ paddleSubscriptionId: 1 });
paymentSchema.index({ paddleCustomerId: 1 });

module.exports = mongoose.model('Payment', paymentSchema); 