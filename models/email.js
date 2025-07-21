const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    uploadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Upload',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'verified', 'invalid'],
        default: 'pending'
    },
    verifiedAt: {
        type: Date,
        default: null
    },
    verificationDetails: {
        type: Object,
        default: null
    },
    // New fields for deep-email-validator data
    isDisposable: {
        type: Boolean,
        default: false
    },
    hasTypo: {
        type: Boolean,
        default: false
    },
    mxValid: {
        type: Boolean,
        default: false
    },
    smtpValid: {
        type: Boolean,
        default: false
    },
    regexValid: {
        type: Boolean,
        default: false
    },
    isCatchAll: {
        type: Boolean,
        default: false
    },
    validationReason: {
        type: String,
        default: null
    },
    csvData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    strict: false  // This allows storing dynamic fields
});

// Index for faster queries
emailSchema.index({ email: 1 });
emailSchema.index({ uploadId: 1 });
emailSchema.index({ status: 1 });

module.exports = mongoose.model('Email', emailSchema);