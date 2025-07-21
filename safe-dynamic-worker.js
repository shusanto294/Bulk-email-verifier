const mongoose = require('mongoose');
const { validate } = require('deep-email-validator');
const Email = require('./models/email');
const Upload = require('./models/upload');
const User = require('./models/user');
require('dotenv').config();

class SafeDynamicWorker {
    constructor(workerId, batchSize = 50) {
        this.workerId = workerId;
        this.batchSize = batchSize;
        this.isRunning = false;
        this.processedCount = 0;
    }

    async connect() {
        if (!mongoose.connection.readyState) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        console.log(`Worker ${this.workerId} connected to MongoDB`);
    }

    async claimEmailsAtomically() {
        try {
            // Use atomic findAndModify to claim emails safely
            // Add 'processing' status and worker ID to prevent conflicts
            const claimedEmails = await Email.aggregate([
                // Find pending emails
                { $match: { status: 'pending' } },
                // Limit to batch size
                { $limit: this.batchSize },
                // Add worker info
                { $addFields: { 
                    claimedBy: this.workerId,
                    claimedAt: new Date()
                }}
            ]);

            if (claimedEmails.length === 0) {
                return [];
            }

            // Atomically update the claimed emails to 'processing' status
            const emailIds = claimedEmails.map(email => email._id);
            const updateResult = await Email.updateMany(
                { 
                    _id: { $in: emailIds },
                    status: 'pending' // Double-check they're still pending
                },
                { 
                    $set: { 
                        status: 'processing',
                        claimedBy: this.workerId,
                        claimedAt: new Date()
                    }
                }
            );

            console.log(`Worker ${this.workerId}: Claimed ${updateResult.modifiedCount} emails atomically`);

            // Return only successfully claimed emails
            const finalClaimedEmails = await Email.find({
                _id: { $in: emailIds },
                status: 'processing',
                claimedBy: this.workerId
            }).populate({
                path: 'uploadId',
                populate: {
                    path: 'userId'
                }
            });

            return finalClaimedEmails;
        } catch (err) {
            console.error(`Worker ${this.workerId}: Error claiming emails:`, err);
            return [];
        }
    }

    async processClaimedEmails(emails) {
        let processedCount = 0;
        
        for (const email of emails) {
            try {
                const upload = email.uploadId;
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
                console.log(`Worker ${this.workerId}: Verifying ${email.email} for ${user.username} (${userRole})`);
                
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
                        rawResult: result,
                        processedBy: this.workerId
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

                // Deduct credits atomically for non-admin users
                if (!user.isAdmin()) {
                    try {
                        const creditResult = await User.findOneAndUpdate(
                            { _id: user._id, credits: { $gte: 1 } },
                            { $inc: { credits: -1 } },
                            { new: true }
                        );
                        
                        if (creditResult) {
                            console.log(`Worker ${this.workerId}: Deducted 1 credit from ${user.username}. Remaining: ${creditResult.credits}`);
                        } else {
                            console.error(`Worker ${this.workerId}: Failed to deduct credit - insufficient credits`);
                            email.status = 'invalid';
                            email.verificationDetails = { error: 'Credit deduction failed - insufficient credits' };
                        }
                    } catch (creditError) {
                        console.error(`Worker ${this.workerId}: Credit deduction error:`, creditError);
                        email.status = 'invalid';
                        email.verificationDetails = { error: 'Credit deduction failed' };
                    }
                } else {
                    console.log(`Worker ${this.workerId}: Admin user - no credits deducted`);
                }

                // Clear processing fields and save final status
                email.claimedBy = undefined;
                email.claimedAt = undefined;
                await email.save();
                processedCount++;
                
                // Small delay between verifications
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (err) {
                console.error(`Worker ${this.workerId}: Error processing email ${email.email}:`, err);
                // Mark as failed and release claim
                try {
                    await Email.findByIdAndUpdate(email._id, {
                        status: 'invalid',
                        verificationDetails: { error: 'Processing error', errorDetails: err.message },
                        claimedBy: undefined,
                        claimedAt: undefined
                    });
                } catch (saveErr) {
                    console.error(`Worker ${this.workerId}: Failed to save error state:`, saveErr);
                }
                processedCount++;
            }
        }
        
        return processedCount;
    }

    async verifyEmailBatch() {
        try {
            // Atomically claim emails
            const claimedEmails = await this.claimEmailsAtomically();
            
            if (claimedEmails.length === 0) {
                console.log(`Worker ${this.workerId}: No emails available to claim. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return 0;
            }

            console.log(`Worker ${this.workerId}: Processing ${claimedEmails.length} claimed emails...`);
            
            // Process the claimed emails
            const processedCount = await this.processClaimedEmails(claimedEmails);
            this.processedCount += processedCount;
            
            return processedCount;
        } catch (err) {
            console.error(`Worker ${this.workerId}: Error in batch processing:`, err);
            return 0;
        }
    }

    async cleanupStaleProcessing() {
        try {
            // Clean up any emails that have been in 'processing' state for too long (5 minutes)
            const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
            const cleanupResult = await Email.updateMany(
                {
                    status: 'processing',
                    claimedAt: { $lt: staleThreshold }
                },
                {
                    $set: { status: 'pending' },
                    $unset: { claimedBy: 1, claimedAt: 1 }
                }
            );
            
            if (cleanupResult.modifiedCount > 0) {
                console.log(`Worker ${this.workerId}: Cleaned up ${cleanupResult.modifiedCount} stale processing emails`);
            }
        } catch (err) {
            console.error(`Worker ${this.workerId}: Error cleaning up stale emails:`, err);
        }
    }

    async start() {
        await this.connect();
        this.isRunning = true;
        console.log(`Worker ${this.workerId}: Started with safe atomic processing...`);
        
        // Clean up any stale processing emails on startup
        await this.cleanupStaleProcessing();
        
        while (this.isRunning) {
            const processed = await this.verifyEmailBatch();
            
            // If no emails were processed, wait longer
            if (processed === 0) {
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        
        console.log(`Worker ${this.workerId}: Stopped. Total processed: ${this.processedCount}`);
    }

    stop() {
        this.isRunning = false;
        console.log(`Worker ${this.workerId}: Stopping...`);
    }
}

// Export for use in worker manager
module.exports = SafeDynamicWorker;

// If run directly, start a single worker
if (require.main === module) {
    const workerId = process.argv[2] || `worker_${Date.now()}`;
    const batchSize = parseInt(process.argv[3]) || 50;
    
    const worker = new SafeDynamicWorker(workerId, batchSize);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log(`Stopping Worker ${workerId}...`);
        worker.stop();
        
        // Clean up any emails this worker was processing
        try {
            await Email.updateMany(
                { claimedBy: workerId, status: 'processing' },
                { 
                    $set: { status: 'pending' },
                    $unset: { claimedBy: 1, claimedAt: 1 }
                }
            );
            console.log(`Worker ${workerId}: Released claimed emails`);
        } catch (err) {
            console.error(`Worker ${workerId}: Error releasing emails:`, err);
        }
        
        await mongoose.disconnect();
        process.exit(0);
    });
    
    worker.start().catch(err => {
        console.error(`Worker ${workerId} error:`, err);
        process.exit(1);
    });
}