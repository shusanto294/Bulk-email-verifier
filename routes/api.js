const express = require('express');
const router = express.Router();
const Upload = require('../models/upload');
const Email = require('../models/email');

// Batch email processing
router.post('/uploads/:id/emails', async (req, res) => {
    try {
        const upload = await Upload.findById(req.params.id);
        if (!upload) return res.status(404).json({ error: 'Upload not found' });

        const { emails } = req.body;
        if (!emails || !Array.isArray(emails)) {
            return res.status(400).json({ error: 'Invalid email batch' });
        }

        const emailDocs = emails.map(email => ({
            email,
            uploadId: upload._id,
            status: 'pending'
        }));

        await Email.insertMany(emailDocs);
        
        // Update email count
        upload.emailCount = (upload.emailCount || 0) + emails.length;
        await upload.save();

        res.json({ success: true, count: emails.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete upload and associated emails
router.delete('/uploads/:id', async (req, res) => {
    try {
        const upload = await Upload.findById(req.params.id);
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

module.exports = router;