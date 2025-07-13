const express = require('express');
const router = express.Router();
const Upload = require('../models/upload');
const Email = require('../models/email');
const { requireAuth } = require('../middleware/auth');

// Dashboard page - require authentication
router.get('/', requireAuth, async (req, res) => {
    try {
        // Get user's uploads with status
        const uploads = await Upload.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(5);
        
        // Enhanced status checking with verification of all email states
        const uploadsWithStatus = await Promise.all(uploads.map(async (upload) => {
            const [pendingCount, totalCount] = await Promise.all([
                Email.countDocuments({ 
                    uploadId: upload._id,
                    status: 'pending'
                }),
                Email.countDocuments({
                    uploadId: upload._id
                })
            ]);

            // More accurate status determination
            let displayStatus = 'Pending';
            if (totalCount === 0) {
                displayStatus = 'Empty';
            } else if (pendingCount === 0) {
                displayStatus = 'Processed';
            }

            return {
                ...upload.toObject(),
                displayStatus,
                pendingCount,
                totalCount
            };
        }));

        // Get overall statistics
        const totalUploads = await Upload.countDocuments({ userId: req.user._id });
        const totalEmails = await Email.countDocuments({ 
            uploadId: { $in: uploads.map(u => u._id) }
        });
        const verifiedEmails = await Email.countDocuments({ 
            uploadId: { $in: uploads.map(u => u._id) },
            status: 'verified'
        });
        const invalidEmails = await Email.countDocuments({ 
            uploadId: { $in: uploads.map(u => u._id) },
            status: 'invalid'
        });

        // Calculate verification rate
        const verificationRate = totalEmails > 0 ? Math.round((verifiedEmails / totalEmails) * 100) : 0;

        res.render('dashboard', { 
            title: 'Dashboard',
            activePage: 'dashboard',
            user: req.user,
            uploads: uploadsWithStatus,
            stats: {
                totalUploads,
                totalEmails,
                verifiedEmails,
                invalidEmails,
                verificationRate
            },
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router; 