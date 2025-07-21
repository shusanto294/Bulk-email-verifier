const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Email = require('./models/email');
require('dotenv').config();

class SafeSmartWorkerManager {
    constructor() {
        this.workers = [];
        this.totalWorkers = 50; // Always maintain up to 50 workers
        this.checkInterval = 30000; // Check every 30 seconds
        this.isRunning = false;
    }

    async connect() {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔒 Safe Smart Worker Manager connected to MongoDB');
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
        
        // Calculate workers needed - one worker can handle ~50 emails efficiently
        const emailsPerWorker = 50;
        let optimalWorkers = Math.ceil(pendingEmails / emailsPerWorker);
        
        // Cap at maximum workers
        optimalWorkers = Math.min(this.totalWorkers, optimalWorkers);
        
        return optimalWorkers;
    }

    createSafeWorker(workerId) {
        console.log(`🚀 Starting Safe Worker ${workerId}...`);
        
        const workerProcess = spawn('node', ['safe-dynamic-worker.js', workerId, '50'], {
            cwd: __dirname,
            stdio: 'pipe',
            env: process.env
        });
        
        const worker = {
            id: workerId,
            process: workerProcess,
            startTime: new Date(),
            emailsProcessed: 0
        };
        
        workerProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            console.log(`[Safe Worker ${workerId}] ${output}`);
            
            // Track processed emails
            const processedMatch = output.match(/Processing (\d+) claimed emails/);
            if (processedMatch) {
                worker.emailsProcessed += parseInt(processedMatch[1]);
            }
        });
        
        workerProcess.stderr.on('data', (data) => {
            console.error(`[Safe Worker ${workerId}] ERROR: ${data.toString().trim()}`);
        });
        
        workerProcess.on('close', (code) => {
            console.log(`[Safe Worker ${workerId}] Process exited with code ${code}`);
            // Remove from workers list
            this.workers = this.workers.filter(w => w.id !== workerId);
        });
        
        workerProcess.on('error', (error) => {
            console.error(`[Safe Worker ${workerId}] Failed to start: ${error.message}`);
            this.workers = this.workers.filter(w => w.id !== workerId);
        });
        
        this.workers.push(worker);
        return worker;
    }

    stopWorker(worker) {
        console.log(`🛑 Stopping Safe Worker ${worker.id}...`);
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

    async manageWorkers() {
        const pendingEmails = await this.getPendingEmailCount();
        const processingEmails = await this.getProcessingEmailCount();
        const currentWorkerCount = this.workers.length;
        const optimalWorkerCount = this.calculateOptimalWorkerCount(pendingEmails);
        
        console.log(`📊 Status: ${pendingEmails} pending, ${processingEmails} processing, ${currentWorkerCount} workers, ${optimalWorkerCount} optimal`);
        
        // Clean up stale emails periodically
        await this.cleanupStaleEmails();
        
        if (pendingEmails === 0) {
            if (currentWorkerCount > 0 && processingEmails === 0) {
                console.log('🎯 No pending emails - stopping all workers');
                this.workers.forEach(worker => this.stopWorker(worker));
            }
            return;
        }
        
        if (optimalWorkerCount > currentWorkerCount) {
            // Scale up - add workers
            const workersToAdd = optimalWorkerCount - currentWorkerCount;
            console.log(`📈 Scaling UP: Adding ${workersToAdd} safe workers`);
            
            for (let i = 0; i < workersToAdd; i++) {
                const workerId = `safe_worker_${currentWorkerCount + i + 1}_${Date.now()}`;
                this.createSafeWorker(workerId);
                
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
        }
    }

    async startMonitoring() {
        await this.connect();
        this.isRunning = true;
        
        console.log('🔒 Safe Smart Worker Manager started!');
        console.log('⚙️  Features: Atomic email claiming, conflict prevention, stale cleanup');
        console.log(`🎯 Configuration: Up to ${this.totalWorkers} workers, 50 emails per worker`);
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
        console.log('\n🛑 Shutting down Safe Smart Worker Manager...');
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
        console.log('✅ Safe Smart Worker Manager stopped');
    }
}

// Start the safe smart worker manager
if (require.main === module) {
    const manager = new SafeSmartWorkerManager();
    
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
        console.error('Safe Smart Worker Manager error:', err);
        process.exit(1);
    });
}

module.exports = SafeSmartWorkerManager;