const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Upload = require('../models/upload');
const Email = require('../models/email');
const User = require('../models/user');
const { requireEmailVerified, requireCredits, requireAuth } = require('../middleware/auth');

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

// Upload form - require authentication
router.get('/', requireEmailVerified, async (req, res) => {
    try {
        const uploads = await Upload.find({ userId: req.user._id }).sort({ createdAt: -1 });
        
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
        
        res.render('upload', { 
            title: 'Upload CSV File for Bulk Email Verification',
            activePage: 'upload',
            uploads: uploadsWithStatus,
            user: req.user,
            success: req.query.success || null,
            error: req.query.error || null,
            currentPath: '/upload'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// File upload endpoint - require authentication and credits
router.post('/upload-file', requireEmailVerified, upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Count emails in CSV to check credits
        const emailCount = await new Promise((resolve, reject) => {
            const uniqueEmails = new Set();
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (row) => {
                    const emailKey = Object.keys(row).find(key => 
                        key.toLowerCase() === 'mail' || key.toLowerCase() === 'email'
                    );
                    const email = emailKey ? row[emailKey] : null;
                    if (email && email.trim()) {
                        uniqueEmails.add(email.trim().toLowerCase());
                    }
                })
                .on('end', () => resolve(uniqueEmails.size))
                .on('error', reject);
        });

        // Check if user has enough credits (skip for admin users)
        if (!req.user.isAdmin() && req.user.credits < emailCount) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(402).json({ 
                error: 'Insufficient credits', 
                required: emailCount, 
                available: req.user.credits 
            });
        }

        const newUpload = new Upload({
            filename: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            processed: false,
            userId: req.user._id
        });

        const upload = await newUpload.save();
        
        // Process the CSV file
        // Use a Set to track unique emails
        const uniqueEmails = new Set();
        const emails = [];
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (row) => {
                    // Extract email from either 'mail' or 'email' column (case insensitive)
                    const emailKey = Object.keys(row).find(key => 
                        key.toLowerCase() === 'mail' || key.toLowerCase() === 'email'
                    );
                    const email = emailKey ? row[emailKey] : null;
                    
                    if (!email) return; // Skip if no email found
                    
                    const trimmedEmail = email.trim().toLowerCase();
                    
                    // Skip empty or already processed emails
                    if (trimmedEmail && !uniqueEmails.has(trimmedEmail)) {
                        uniqueEmails.add(trimmedEmail);
                        
                        // Create email data object with all row data in csvData
                        const emailData = {
                            email: trimmedEmail,
                            uploadId: upload._id,
                            status: 'pending',
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
                    }
                })
                .on('end', resolve)
                .on('error', reject);
        });

        try {
            // Insert unique emails in bulk
            if (emails.length > 0) {
                await Email.insertMany(emails);
                
                // Update the upload with the correct count
                upload.emailCount = emails.length;
                await upload.save();
            }
            res.json(upload);
        } catch (err) {
            console.error('Error saving emails:', err);
            res.status(500).json({ error: 'Error saving emails' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Old route kept for backward compatibility (can be removed later)
router.post('/', requireEmailVerified, async (req, res) => {
    return res.status(400).json({ error: 'Please use the file upload endpoint instead' });
});

// Mark upload as complete - require authentication
router.post('/:id/complete', requireEmailVerified, async (req, res) => {
    try {
        const upload = await Upload.findOne({ _id: req.params.id, userId: req.user._id });
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

// Get upload details - require authentication
router.get('/:id', requireEmailVerified, async (req, res) => {
    try {
        const perPage = 50;
        const page = req.query.page || 1;
        
        const upload = await Upload.findOne({ _id: req.params.id, userId: req.user._id });
        if (!upload) {
            return res.status(404).send('Upload not found');
        }

        const totalEmails = await Email.countDocuments({ uploadId: upload._id });
        
        // Get counts from ALL emails, not just current page
        const verifiedCount = await Email.countDocuments({ 
            uploadId: upload._id, 
            status: 'verified',
            isCatchAll: { $ne: true }
        });
        const invalidCount = await Email.countDocuments({ 
            uploadId: upload._id, 
            status: 'invalid' 
        });
        const pendingCount = await Email.countDocuments({ 
            uploadId: upload._id, 
            status: 'pending' 
        });
        const catchAllCount = await Email.countDocuments({ 
            uploadId: upload._id, 
            isCatchAll: true 
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
            pending: pendingCount || 0,
            catchAll: catchAllCount || 0
        };

        res.render('upload-details', { 
            title: 'Upload Details',
            activePage: 'upload',
            upload, 
            emails, 
            stats,
            page,
            totalEmails,
            pages: Math.ceil(totalEmails / perPage),
            user: req.user
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Download CSV routes - require authentication
router.get('/:id/download/:type', requireEmailVerified, async (req, res) => {
    try {
        const { id, type } = req.params;
        const validTypes = ['all', 'verified', 'invalid', 'pending', 'disposable', 'catch-all', 'typo', 'non-catch-all'];
        
        if (!validTypes.includes(type)) {
            return res.status(400).send('Invalid download type');
        }

        const upload = await Upload.findOne({ _id: id, userId: req.user._id });
        if (!upload) {
            return res.status(404).send('Upload not found');
        }

        let query = { uploadId: id };
        if (type === 'verified') {
            query.status = type;
            query.isCatchAll = { $ne: true };
        } else if (type === 'invalid' || type === 'pending') {
            query.status = type;
        } else if (type === 'disposable') {
            query.isDisposable = true;
        } else if (type === 'catch-all') {
            query.isCatchAll = true;
        } else if (type === 'non-catch-all') {
            query.isCatchAll = false;
        } else if (type === 'typo') {
            query.hasTypo = true;
        }

        const emails = await Email.find(query).select('email status verifiedAt csvData isDisposable hasTypo mxValid smtpValid regexValid isCatchAll validationReason verificationDetails -_id');
        
        // Generate CSV - include all validation data and csvData fields
        let headers = new Set([
            'Email', 
            'Status', 
            'Verified At', 
            'Validation Reason',
            'Is Disposable',
            'Has Typo',
            'MX Valid',
            'SMTP Valid',
            'Regex Valid',
            'Is Catch-All'
        ]);
        
        const rows = emails.map(email => {
            const row = {
                'Email': email.email,
                'Status': email.status,
                'Verified At': email.verifiedAt ? email.verifiedAt.toISOString() : '',
                'Validation Reason': email.validationReason || '',
                'Is Disposable': email.isDisposable ? 'Yes' : 'No',
                'Has Typo': email.hasTypo ? 'Yes' : 'No',
                'MX Valid': email.mxValid ? 'Yes' : 'No',
                'SMTP Valid': email.smtpValid ? 'Yes' : 'No',
                'Regex Valid': email.regexValid ? 'Yes' : 'No',
                'Is Catch-All': email.isCatchAll ? 'Yes' : 'No'
            };

            // Add all csvData fields to headers and row
            if (email.csvData) {
                Object.keys(email.csvData).forEach(key => {
                    headers.add(key);
                    row[key] = email.csvData[key] || '';
                });
            }

            return row;
        });

        // Convert headers Set to Array and sort
        const headerArray = Array.from(headers).sort();

        // Create CSV content
        const csvContent = [
            headerArray.join(','),
            ...rows.map(row => 
                headerArray.map(header => {
                    const value = row[header] || '';
                    // Escape commas and quotes in CSV
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${upload.filename.replace('.csv', '')}_${type}_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;