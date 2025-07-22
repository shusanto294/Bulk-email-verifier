const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Email = require('./models/email');
require('dotenv').config();

class SmartWorkerManager {
    constructor() {
        this.workers = [];
        this.totalWorkers = 50; // Always maintain up to 50 workers
        this.checkInterval = 30000; // Check every 30 seconds
        this.isRunning = false;
        this.batchProcessing = false; // Track if a batch is currently being processed
        this.completedWorkers = new Set(); // Track which workers have completed their current batch
    }

    async connect() {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔒 Smart Worker Manager connected to MongoDB');
    }

    async getPendingEmailCount() {
        try {
            const count = await Email.countDocuments({ status: 'pending' });
            return count;
        } catch (err) {
            console.error('Error getting pending email count:', err);
            return 0;
        }
    }

    async getProcessingEmailCount() {
        try {
            const count = await Email.countDocuments({ status: 'processing' });
            return count;
        } catch (err) {
            console.error('Error getting processing email count:', err);
            return 0;
        }
    }

    calculateOptimalWorkerCount(pendingEmails) {
        if (pendingEmails === 0) return 0;
        
        // Calculate workers needed - one worker can handle ~10 emails efficiently
        const emailsPerWorker = 10;
        let optimalWorkers = Math.ceil(pendingEmails / emailsPerWorker);
        
        // Cap at maximum workers
        optimalWorkers = Math.min(this.totalWorkers, optimalWorkers);
        
        return optimalWorkers;
    }

    createSmartWorker(workerId) {
        console.log(`🚀 Starting Smart Worker ${workerId}...`);
        
        const workerProcess = spawn('node', ['safe-dynamic-worker.js', workerId, '10'], {
            cwd: __dirname,
            stdio: 'pipe',
            env: process.env
        });
        
        const worker = {
            id: workerId,
            process: workerProcess,
            startTime: new Date(),
            emailsProcessed: 0,
            batchComplete: false
        };
        
        workerProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            console.log(`[Smart Worker ${workerId}] ${output}`);
            
            // Track processed emails
            const processedMatch = output.match(/Processing (\d+) claimed emails/);
            if (processedMatch) {
                worker.emailsProcessed += parseInt(processedMatch[1]);
            }
            
            // Track batch completion - when worker reports no emails available
            const noEmailsMatch = output.match(/No emails available to claim/);
            if (noEmailsMatch && this.batchProcessing) {
                worker.batchComplete = true;
                this.completedWorkers.add(workerId);
                this.checkBatchCompletion();
            }
        });
        
        workerProcess.stderr.on('data', (data) => {
            console.error(`[Smart Worker ${workerId}] ERROR: ${data.toString().trim()}`);
        });
        
        workerProcess.on('close', (code) => {
            console.log(`[Smart Worker ${workerId}] Process exited with code ${code}`);
            // Remove from workers list
            this.workers = this.workers.filter(w => w.id !== workerId);
            this.completedWorkers.delete(workerId);
        });
        
        workerProcess.on('error', (error) => {
            console.error(`[Smart Worker ${workerId}] Failed to start: ${error.message}`);
            this.workers = this.workers.filter(w => w.id !== workerId);
            this.completedWorkers.delete(workerId);
        });
        
        this.workers.push(worker);
        return worker;
    }

    stopWorker(worker) {
        console.log(`🛑 Stopping Smart Worker ${worker.id}...`);
        worker.process.kill('SIGINT');
        
        // Remove from workers list after a delay
        setTimeout(() => {
            this.workers = this.workers.filter(w => w.id !== worker.id);
        }, 3000);
    }

    async cleanupStaleEmails() {
        try {
            // Clean up emails stuck in processing for more than 10 minutes
            const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
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
                console.log(`🧹 Cleaned up ${cleanupResult.modifiedCount} stale processing emails`);
            }
        } catch (err) {
            console.error('Error cleaning up stale emails:', err);
        }
    }

    checkBatchCompletion() {
        // Check if all active workers have completed their batch
        if (this.batchProcessing && this.completedWorkers.size === this.workers.length && this.workers.length > 0) {
            console.log(`✅ Batch completed! All ${this.workers.length} workers finished processing.`);
            this.batchProcessing = false;
            this.completedWorkers.clear();
            
            // Reset batch completion flags for all workers
            this.workers.forEach(worker => {
                worker.batchComplete = false;
            });
            
            console.log('🔄 Ready for next batch...');
        }
    }

    async startNewBatch() {
        const pendingEmails = await this.getPendingEmailCount();
        
        if (pendingEmails === 0) {
            return false; // No batch to start
        }
        
        if (this.batchProcessing) {
            return false; // Already processing a batch
        }
        
        console.log(`🚀 Starting new batch with ${this.workers.length} workers for ${pendingEmails} pending emails`);
        this.batchProcessing = true;
        this.completedWorkers.clear();
        
        // Reset all workers' batch completion status
        this.workers.forEach(worker => {
            worker.batchComplete = false;
        });
        
        return true;
    }

    async manageWorkers() {
        const pendingEmails = await this.getPendingEmailCount();
        const processingEmails = await this.getProcessingEmailCount();
        const currentWorkerCount = this.workers.length;
        const optimalWorkerCount = this.calculateOptimalWorkerCount(pendingEmails);
        
        console.log(`📊 Status: ${pendingEmails} pending, ${processingEmails} processing, ${currentWorkerCount} workers, optimal: ${optimalWorkerCount}, batch: ${this.batchProcessing ? 'active' : 'idle'}`);
        
        // Clean up stale emails periodically
        await this.cleanupStaleEmails();
        
        // If no pending emails, stop workers when processing is complete
        if (pendingEmails === 0) {
            if (currentWorkerCount > 0 && processingEmails === 0) {
                console.log('🎯 No pending emails - stopping all workers');
                this.batchProcessing = false;
                this.completedWorkers.clear();
                this.workers.forEach(worker => this.stopWorker(worker));
            }
            return;
        }
        
        // Don't scale workers during active batch processing
        if (this.batchProcessing) {
            console.log('⏳ Batch in progress - waiting for completion before scaling...');
            return;
        }
        
        // Scale workers only between batches
        let workersChanged = false;
        
        if (optimalWorkerCount > currentWorkerCount) {
            // Scale up - add workers
            const workersToAdd = optimalWorkerCount - currentWorkerCount;
            console.log(`📈 Scaling UP: Adding ${workersToAdd} smart workers`);
            
            for (let i = 0; i < workersToAdd; i++) {
                const workerId = `smart_worker_${currentWorkerCount + i + 1}_${Date.now()}`;
                this.createSmartWorker(workerId);
                workersChanged = true;
                
                // Stagger worker creation
                if (i < workersToAdd - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else if (optimalWorkerCount < currentWorkerCount) {
            // Scale down - remove excess workers
            const workersToRemove = currentWorkerCount - optimalWorkerCount;
            console.log(`📉 Scaling DOWN: Removing ${workersToRemove} workers`);
            
            // Remove newest workers first
            const workersToStop = this.workers
                .sort((a, b) => b.startTime - a.startTime)
                .slice(0, workersToRemove);
            
            workersToStop.forEach(worker => {
                this.stopWorker(worker);
            });
            workersChanged = true;
        }
        
        // Start new batch if workers are available and emails are pending
        if (!this.batchProcessing && this.workers.length > 0 && pendingEmails > 0) {
            await this.startNewBatch();
        }
    }

    async startMonitoring() {
        await this.connect();
        this.isRunning = true;
        
        console.log('🔒 Smart Worker Manager started!');
        console.log('⚙️  Features: Atomic email claiming, conflict prevention, stale cleanup, batch coordination');
        console.log(`🎯 Configuration: Up to ${this.totalWorkers} workers, 10 emails per worker`);
        console.log('🔄 Batch Mode: Workers wait for all to complete before starting next batch');
        console.log('━'.repeat(80));
        
        // Initial cleanup and worker management
        await this.cleanupStaleEmails();
        await this.manageWorkers();
        
        // Periodic monitoring and worker management
        const monitoringInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(monitoringInterval);
                return;
            }
            
            try {
                await this.manageWorkers();
            } catch (err) {
                console.error('Error during worker management:', err);
            }
        }, this.checkInterval);
        
        // Detailed status reporting every 2 minutes
        const statusInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(statusInterval);
                return;
            }
            
            const pendingEmails = await this.getPendingEmailCount();
            const processingEmails = await this.getProcessingEmailCount();
            const totalProcessed = this.workers.reduce((sum, w) => sum + w.emailsProcessed, 0);
            
            console.log(`\n📈 DETAILED STATUS REPORT:`);
            console.log(`   📧 Pending emails: ${pendingEmails}`);
            console.log(`   ⚡ Processing emails: ${processingEmails}`);
            console.log(`   👷 Active workers: ${this.workers.length}`);
            console.log(`   ✅ Total processed: ${totalProcessed}`);
            console.log(`   ⏰ Next check: ${this.checkInterval/1000}s`);
            console.log('━'.repeat(50));
        }, 120000); // Every 2 minutes
    }

    async stop() {
        console.log('\n🛑 Shutting down Smart Worker Manager...');
        this.isRunning = false;
        
        // Stop all workers gracefully
        const stopPromises = this.workers.map(worker => {
            return new Promise((resolve) => {
                worker.process.on('close', resolve);
                worker.process.kill('SIGINT');
                
                // Force kill after 10 seconds
                setTimeout(() => {
                    if (!worker.process.killed) {
                        worker.process.kill('SIGKILL');
                    }
                    resolve();
                }, 10000);
            });
        });
        
        await Promise.all(stopPromises);
        
        // Final cleanup of any remaining processing emails
        await this.cleanupStaleEmails();
        
        await mongoose.disconnect();
        console.log('✅ Smart Worker Manager stopped');
    }
}

// Start the smart worker manager
if (require.main === module) {
    const manager = new SmartWorkerManager();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        await manager.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        await manager.stop();
        process.exit(0);
    });
    
    // Start monitoring
    manager.startMonitoring().catch(err => {
        console.error('Smart Worker Manager error:', err);
        process.exit(1);
    });
}

module.exports = SmartWorkerManager;