const express = require('express');
const router = express.Router();
const Upload = require('../models/upload');
const Email = require('../models/email');
const { requireEmailVerified } = require('../middleware/auth');

// Get upload status - require authentication
router.get('/uploads/:id/status', requireEmailVerified, async (req, res) => {
    try {
        const upload = await Upload.findOne({ _id: req.params.id, userId: req.user._id });
        if (!upload) return res.status(404).json({ error: 'Upload not found' });

        const totalCount = await Email.countDocuments({ uploadId: upload._id });
        const verifiedCount = await Email.countDocuments({ 
            uploadId: upload._id,
            status: 'verified'
        });
        const invalidCount = await Email.countDocuments({ 
            uploadId: upload._id,
            status: 'invalid'
        });
        const pendingCount = await Email.countDocuments({ 
            uploadId: upload._id,
            status: 'pending'
        });

        res.json({
            success: true,
            status: {
                total: totalCount,
                verified: verifiedCount,
                invalid: invalidCount,
                pending: pendingCount
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete upload and associated emails - require authentication
router.delete('/uploads/:id', requireEmailVerified, async (req, res) => {
    try {
        const upload = await Upload.findOne({ _id: req.params.id, userId: req.user._id });
        if (!upload) return res.status(404).json({ error: 'Upload not found' });

        // Delete all associated emails
        await Email.deleteMany({ uploadId: upload._id });
        
        // Delete the upload record
        await Upload.findByIdAndDelete(req.params.id);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user credits
router.get('/user/credits', requireEmailVerified, async (req, res) => {
    try {
        res.json({
            success: true,
            credits: req.user.credits
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;