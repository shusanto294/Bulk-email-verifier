const mongoose = require('mongoose');
const { validate } = require('deep-email-validator');
const Email = require('./models/email');
const Upload = require('./models/upload');
const User = require('./models/user');
require('dotenv').config();

class DynamicWorker {
    constructor(workerId, batchSize = 100, startOffset = 0) {
        this.workerId = workerId;
        this.batchSize = batchSize;
        this.startOffset = startOffset;
        this.isRunning = false;
    }

    async connect() {
        if (!mongoose.connection.readyState) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        console.log(`Worker ${this.workerId} connected to MongoDB`);
    }

    async verifyEmailBatch() {
        try {
            // Find emails with dynamic offset based on worker ID
            const emails = await Email.find({ status: 'pending' })
                .skip(this.startOffset)
                .limit(this.batchSize);
            
            if (emails.length === 0) {
                console.log(`Worker ${this.workerId}: No pending emails found. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return 0; // Return count of processed emails
            }

            console.log(`Worker ${this.workerId}: Processing batch of ${emails.length} emails...`);
            
            // Group emails by upload to get user information
            const uploadIds = [...new Set(emails.map(email => email.uploadId))];
            const uploads = await Upload.find({ _id: { $in: uploadIds } }).populate('userId');
            const uploadMap = new Map(uploads.map(upload => [upload._id.toString(), upload]));
            
            let processedCount = 0;
            
            // Process each email sequentially
            for (const email of emails) {
                try {
                    const upload = uploadMap.get(email.uploadId.toString());
                    if (!upload || !upload.userId) {
                        console.error(`Worker ${this.workerId}: No user found for email ${email.email}`);
                        email.status = 'invalid';
                        email.verificationDetails = { error: 'No user associated with upload' };
                        await email.save();
                        processedCount++;
                        continue;
                    }

                    const user = upload.userId;
                    
                    // Check if user has credits (skip for admin users)
                    if (!user.isAdmin() && user.credits <= 0) {
                        console.log(`Worker ${this.workerId}: User ${user.username} has no credits left.`);
                        email.status = 'invalid';
                        email.verificationDetails = { error: 'Insufficient credits' };
                        await email.save();
                        processedCount++;
                        continue;
                    }

                    const userRole = user.isAdmin() ? 'admin' : 'customer';
                    console.log(`Worker ${this.workerId}: Verifying ${email.email} for ${user.username} (${userRole}, Credits: ${user.credits})`);
                    
                    // Use deep-email-validator with timeout
                    const result = await Promise.race([
                        validate({
                            email: email.email,
                            sender: process.env.SENDER_EMAIL || 'name@example.org'
                        }),
                        new Promise((resolve) => 
                            setTimeout(() => resolve({ 
                                valid: false,
                                reason: 'timeout',
                                validators: {}
                            }), 10000)
                        )
                    ]);

                    if (result.reason === 'timeout') {
                        console.error(`Worker ${this.workerId}: Timeout verifying ${email.email}`);
                        email.status = 'invalid';
                        email.verificationDetails = { 
                            error: 'Verification timeout (10s)',
                            timeout: true
                        };
                    } else {
                        email.status = result.valid ? 'verified' : 'invalid';
                        
                        // Store comprehensive validation data
                        email.verificationDetails = {
                            valid: result.valid,
                            reason: result.reason,
                            disposable: result.validators?.disposable?.valid === false,
                            typo: result.validators?.typo?.valid === false,
                            mx: result.validators?.mx || {},
                            smtp: result.validators?.smtp || {},
                            regex: result.validators?.regex || {},
                            catchAll: result.validators?.mx?.valid && result.validators?.smtp?.valid === false,
                            rawResult: result
                        };
                        
                        // Store in new schema fields for easier querying
                        email.isDisposable = result.validators?.disposable?.valid === false;
                        email.hasTypo = result.validators?.typo?.valid === false;
                        email.mxValid = result.validators?.mx?.valid || false;
                        email.smtpValid = result.validators?.smtp?.valid || false;
                        email.regexValid = result.validators?.regex?.valid || false;
                        email.isCatchAll = result.validators?.mx?.valid && result.validators?.smtp?.valid === false;
                        email.validationReason = result.reason;
                        
                        email.verifiedAt = new Date();
                        console.log(`Worker ${this.workerId}: ${email.email} is ${result.valid ? 'valid' : 'invalid'} - ${result.reason || 'N/A'}`);
                    }

                    // Deduct credits for non-admin users
                    if (!user.isAdmin()) {
                        try {
                            await user.deductCredits(1);
                            console.log(`Worker ${this.workerId}: Deducted 1 credit from ${user.username}. Remaining: ${user.credits}`);
                        } catch (creditError) {
                            console.error(`Worker ${this.workerId}: Credit deduction error for ${user.username}:`, creditError);
                            email.status = 'invalid';
                            email.verificationDetails = { error: 'Credit deduction failed' };
                        }
                    }

                    await email.save();
                    processedCount++;
                    
                    // Dynamic delay based on worker ID to distribute load
                    await new Promise(resolve => setTimeout(resolve, 50 + (this.workerId * 20)));
                } catch (err) {
                    console.error(`Worker ${this.workerId}: Error processing email ${email.email}:`, err);
                    processedCount++;
                }
            }
            
            return processedCount;
        } catch (err) {
            console.error(`Worker ${this.workerId}: Error in batch processing:`, err);
            return 0;
        }
    }

    async start() {
        await this.connect();
        this.isRunning = true;
        console.log(`Worker ${this.workerId}: Started processing emails...`);
        
        while (this.isRunning) {
            await this.verifyEmailBatch();
        }
    }

    stop() {
        this.isRunning = false;
        console.log(`Worker ${this.workerId}: Stopping...`);
    }
}

// Export for use in worker manager
module.exports = DynamicWorker;

// If run directly, start a single worker
if (require.main === module) {
    const workerId = process.argv[2] || 1;
    const startOffset = process.argv[3] || 0;
    
    const worker = new DynamicWorker(workerId, 100, parseInt(startOffset));
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log(`Stopping Worker ${workerId}...`);
        worker.stop();
        await mongoose.disconnect();
        process.exit(0);
    });
    
    worker.start().catch(err => {
        console.error(`Worker ${workerId} error:`, err);
        process.exit(1);
    });
}