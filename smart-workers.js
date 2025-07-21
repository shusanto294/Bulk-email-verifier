const { spawn } = require('child_process');
const mongoose = require('mongoose');
const Email = require('./models/email');
require('dotenv').config();

class SmartWorkerManager {
    constructor() {
        this.workers = [];
        this.maxWorkers = 10; // Maximum number of workers
        this.minWorkers = 1;  // Minimum number of workers
        this.emailsPerWorker = 100; // Target emails per worker
        this.checkInterval = 30000; // Check every 30 seconds
        this.isRunning = false;
    }

    async connect() {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Smart Worker Manager connected to MongoDB');
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

    calculateOptimalWorkerCount(pendingEmails) {
        if (pendingEmails === 0) return 0;
        
        // Calculate workers needed based on email count
        let optimalWorkers = Math.ceil(pendingEmails / this.emailsPerWorker);
        
        // Apply constraints
        optimalWorkers = Math.max(this.minWorkers, optimalWorkers);
        optimalWorkers = Math.min(this.maxWorkers, optimalWorkers);
        
        return optimalWorkers;
    }

    createWorker(workerId, startOffset) {
        console.log(`🚀 Starting Worker ${workerId} (offset: ${startOffset})...`);
        
        const workerProcess = spawn('node', ['dynamic-worker.js', workerId, startOffset], {
            cwd: __dirname,
            stdio: 'pipe',
            env: process.env
        });
        
        const worker = {
            id: workerId,
            process: workerProcess,
            startOffset: startOffset,
            startTime: new Date()
        };
        
        workerProcess.stdout.on('data', (data) => {
            console.log(`[Worker ${workerId}] ${data.toString().trim()}`);
        });
        
        workerProcess.stderr.on('data', (data) => {
            console.error(`[Worker ${workerId}] ERROR: ${data.toString().trim()}`);
        });
        
        workerProcess.on('close', (code) => {
            console.log(`[Worker ${workerId}] Process exited with code ${code}`);
            // Remove from workers list
            this.workers = this.workers.filter(w => w.id !== workerId);
        });
        
        workerProcess.on('error', (error) => {
            console.error(`[Worker ${workerId}] Failed to start: ${error.message}`);
            this.workers = this.workers.filter(w => w.id !== workerId);
        });
        
        this.workers.push(worker);
        return worker;
    }

    stopWorker(worker) {
        console.log(`🛑 Stopping Worker ${worker.id}...`);
        worker.process.kill('SIGINT');
        
        // Remove from workers list after a delay
        setTimeout(() => {
            this.workers = this.workers.filter(w => w.id !== worker.id);
        }, 2000);
    }

    async scaleWorkers() {
        const pendingEmails = await this.getPendingEmailCount();
        const currentWorkerCount = this.workers.length;
        const optimalWorkerCount = this.calculateOptimalWorkerCount(pendingEmails);
        
        console.log(`📊 Status: ${pendingEmails} pending emails, ${currentWorkerCount} active workers, ${optimalWorkerCount} optimal`);
        
        if (optimalWorkerCount > currentWorkerCount) {
            // Scale up - add workers
            const workersToAdd = optimalWorkerCount - currentWorkerCount;
            console.log(`📈 Scaling UP: Adding ${workersToAdd} workers`);
            
            for (let i = 0; i < workersToAdd; i++) {
                const workerId = currentWorkerCount + i + 1;
                const startOffset = workerId * 100; // Each worker processes different batch
                this.createWorker(workerId, startOffset);
                
                // Stagger worker creation to avoid overwhelming the system
                if (i < workersToAdd - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } else if (optimalWorkerCount < currentWorkerCount && optimalWorkerCount > 0) {
            // Scale down - remove excess workers
            const workersToRemove = currentWorkerCount - optimalWorkerCount;
            console.log(`📉 Scaling DOWN: Removing ${workersToRemove} workers`);
            
            // Remove workers with highest IDs first (LIFO)
            const workersToStop = this.workers
                .sort((a, b) => b.id - a.id)
                .slice(0, workersToRemove);
            
            workersToStop.forEach(worker => {
                this.stopWorker(worker);
            });
        } else if (pendingEmails === 0 && currentWorkerCount > 0) {
            console.log('🎯 No pending emails - stopping all workers');
            this.workers.forEach(worker => this.stopWorker(worker));
        }
    }

    async startMonitoring() {
        await this.connect();
        this.isRunning = true;
        
        console.log('🧠 Smart Worker Manager started!');
        console.log(`⚙️  Configuration: ${this.minWorkers}-${this.maxWorkers} workers, ${this.emailsPerWorker} emails/worker (1 worker per 100 emails)`);
        console.log('━'.repeat(80));
        
        // Initial scaling
        await this.scaleWorkers();
        
        // Periodic monitoring and scaling
        const monitoringInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(monitoringInterval);
                return;
            }
            
            try {
                await this.scaleWorkers();
            } catch (err) {
                console.error('Error during scaling:', err);
            }
        }, this.checkInterval);
        
        // Status reporting every 2 minutes
        const statusInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(statusInterval);
                return;
            }
            
            const pendingEmails = await this.getPendingEmailCount();
            console.log(`\n📈 STATUS REPORT:`);
            console.log(`   📧 Pending emails: ${pendingEmails}`);
            console.log(`   👷 Active workers: ${this.workers.length}`);
            console.log(`   ⏱️  Next check in: ${this.checkInterval/1000}s`);
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
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    if (!worker.process.killed) {
                        worker.process.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);
            });
        });
        
        await Promise.all(stopPromises);
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