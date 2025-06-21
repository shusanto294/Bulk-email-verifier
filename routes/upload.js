const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Upload = require('../models/upload');
const Email = require('../models/email');

// Ensure uploads directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Upload form
router.get('/', async (req, res) => {
    try {
        const uploads = await Upload.find().sort({ createdAt: -1 });
        res.render('upload', { uploads });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// File upload endpoint
router.post('/upload-file', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const newUpload = new Upload({
            filename: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            processed: false
        });

        const upload = await newUpload.save();
        res.json(upload);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Old route kept for backward compatibility (can be removed later)
router.post('/', async (req, res) => {
    return res.status(400).json({ error: 'Please use the file upload endpoint instead' });
});

// Mark upload as complete
router.post('/:id/complete', async (req, res) => {
    try {
        const upload = await Upload.findById(req.params.id);
        if (!upload) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        upload.processed = true;
        await upload.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get upload details
router.get('/:id', async (req, res) => {
    try {
        const upload = await Upload.findById(req.params.id);
        const emails = await Email.find({ uploadId: upload._id });
        
        // Ensure we have valid counts even if emails array is empty
        const verifiedCount = emails.filter(e => e.status === 'verified').length;
        const invalidCount = emails.filter(e => e.status === 'invalid').length;
        const pendingCount = emails.filter(e => e.status === 'pending').length;
        
        const stats = {
            total: emails.length || 0,
            verified: verifiedCount || 0,
            invalid: invalidCount || 0,
            pending: pendingCount || 0
        };

        res.render('upload-details', { upload, emails, stats });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;