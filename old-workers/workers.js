const { spawn } = require('child_process');
const path = require('path');

const workers = [
    { name: 'Worker 1', script: 'worker1.js' },
    { name: 'Worker 2', script: 'worker2.js' },
    { name: 'Worker 3', script: 'worker3.js' },
    { name: 'Worker 4', script: 'worker4.js' },
    { name: 'Worker 5', script: 'worker5.js' }
];

const runningWorkers = [];

function startWorker(worker) {
    console.log(`Starting ${worker.name} (${worker.script})...`);
    
    const workerProcess = spawn('node', [worker.script], {
        cwd: __dirname,
        stdio: 'pipe'
    });
    
    workerProcess.stdout.on('data', (data) => {
        console.log(`[${worker.name}] ${data.toString().trim()}`);
    });
    
    workerProcess.stderr.on('data', (data) => {
        console.error(`[${worker.name}] ERROR: ${data.toString().trim()}`);
    });
    
    workerProcess.on('close', (code) => {
        console.log(`[${worker.name}] Process exited with code ${code}`);
        // Remove from running workers list
        const index = runningWorkers.indexOf(workerProcess);
        if (index > -1) {
            runningWorkers.splice(index, 1);
        }
    });
    
    workerProcess.on('error', (error) => {
        console.error(`[${worker.name}] Failed to start: ${error.message}`);
    });
    
    runningWorkers.push(workerProcess);
    return workerProcess;
}

function startAllWorkers() {
    console.log('🚀 Starting all email verification workers...');
    console.log(`📊 Total workers: ${workers.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    workers.forEach(worker => {
        startWorker(worker);
    });
    
    console.log('\n✅ All workers started successfully!');
    console.log('📈 This should significantly speed up your email verification process!');
    console.log('💡 Each worker processes different batches of emails in parallel.');
    console.log('\nPress Ctrl+C to stop all workers.\n');
}

function stopAllWorkers() {
    console.log('\n🛑 Stopping all workers...');
    
    runningWorkers.forEach((worker, index) => {
        console.log(`Stopping worker ${index + 1}...`);
        worker.kill('SIGINT');
    });
    
    // Wait a bit for graceful shutdown
    setTimeout(() => {
        runningWorkers.forEach((worker, index) => {
            if (!worker.killed) {
                console.log(`Force killing worker ${index + 1}...`);
                worker.kill('SIGKILL');
            }
        });
        process.exit(0);
    }, 3000);
}

// Handle graceful shutdown
process.on('SIGINT', stopAllWorkers);
process.on('SIGTERM', stopAllWorkers);

// Start all workers
startAllWorkers();