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

            console.log(`Status check for upload ${upload._id}: ${pendingCount} pending, ${totalCount} total`);

            return {
                ...upload.toObject(),
                displayStatus,
                pendingCount,
                totalCount
            };
        }));
        
        res.render('upload', { uploads: uploadsWithStatus });
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
        
        // Process the CSV file
        const emails = [];
        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (row) => {
                // Extract email from either 'mail' or 'email' column (case insensitive)
                const emailKey = Object.keys(row).find(key => 
                    key.toLowerCase() === 'mail' || key.toLowerCase() === 'email'
                );
                const email = emailKey ? row[emailKey] : null;
                
                if (!email) return; // Skip if no email found
                
                // Create email data object
                const emailData = {
                    email: email.trim().toLowerCase(),
                    uploadId: upload._id,
                    csvData: {}
                };

                // Add all other columns to csvData
                for (const [key, value] of Object.entries(row)) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey !== 'mail' && lowerKey !== 'email') {
                        emailData.csvData[key] = value === '' ? null : value;
                    }
                }

                emails.push(emailData);
            })
            .on('end', async () => {
                try {
                    // Insert all emails in bulk
                    if (emails.length > 0) {
                        await Email.insertMany(emails);
                    }
                    res.json(upload);
                } catch (err) {
                    console.error('Error saving emails:', err);
                    res.status(500).json({ error: 'Error saving emails' });
                }
            });
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
        const perPage = 50;
        const page = req.query.page || 1;
        
        const upload = await Upload.findById(req.params.id);
        const totalEmails = await Email.countDocuments({ uploadId: upload._id });
        
        // Get counts from ALL emails, not just current page
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

        // Only paginate the email list display
        const emails = await Email.find({ uploadId: upload._id })
            .skip((perPage * page) - perPage)
            .limit(perPage)
            .sort({ createdAt: -1 });
        
        const stats = {
            total: emails.length || 0,
            verified: verifiedCount || 0,
            invalid: invalidCount || 0,
            pending: pendingCount || 0
        };

        res.render('upload-details', { 
            upload, 
            emails, 
            stats,
            page,
            totalEmails,
            pages: Math.ceil(totalEmails / perPage)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Download CSV routes
router.get('/:id/download/:type', async (req, res) => {
    try {
        const { id, type } = req.params;
        const validTypes = ['all', 'verified', 'invalid', 'pending'];
        
        if (!validTypes.includes(type)) {
            return res.status(400).send('Invalid download type');
        }

        const upload = await Upload.findById(id);
        if (!upload) {
            return res.status(404).send('Upload not found');
        }

        let query = { uploadId: id };
        if (type !== 'all') {
            query.status = type;
        }

        const emails = await Email.find(query).select('email status verifiedAt csvData -_id');
        
        // Generate CSV - include all csvData fields
        let headers = new Set(['Email', 'Status', 'Verified At']);
        const rows = emails.map(email => {
            const row = {
                'Email': email.email,
                'Status': email.status,
                'Verified At': email.verifiedAt || ''
            };
            
            // Add all csvData fields and collect headers
            if (email.csvData) {
                Object.entries(email.csvData).forEach(([key, value]) => {
                    headers.add(key);
                    row[key] = value;
                });
            }
            return row;
        });

        // Convert to CSV
        const headerRow = Array.from(headers).join(',') + '\n';
        const csvData = rows.map(row => 
            Array.from(headers).map(header => 
                `"${row[header] !== undefined ? row[header] : ''}"`
            ).join(',')
        ).join('\n');
        
        const csvContent = headerRow + csvData;
        
        // Set response headers before sending
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', `attachment; filename=${upload.filename}-${type}.csv`);
        
        // Send the CSV content
        return res.send(csvContent);
        res.setHeader('Content-Disposition', `attachment; filename=${upload.filename}-${type}.csv`);
        
        res.send(csv);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;