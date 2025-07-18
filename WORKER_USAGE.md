# Email Verification Workers Usage Guide

This project includes three different worker files for processing email verifications with different capabilities.

## Available Workers

### 1. `worker.js` (Original)
- **Purpose**: Continuous processing of all pending emails
- **Usage**: `node worker.js`
- **Behavior**: Processes all pending emails in batches of 10, continues indefinitely

### 2. `worker-skip.js` (Skip Worker)
- **Purpose**: Skip a specified number of emails before starting verification
- **Usage**: `node worker-skip.js [skipCount] [batchSize]`
- **Parameters**:
  - `skipCount` (optional): Number of emails to skip (default: 0)
  - `batchSize` (optional): Number of emails to process per batch (default: 10)

**Examples**:
```bash
# Skip first 100 emails, process 10 per batch
node worker-skip.js 100 10

# Skip first 500 emails, use default batch size (10)
node worker-skip.js 500

# No skip, process 50 per batch
node worker-skip.js 0 50
```

### 3. `worker-range.js` (Range Worker)
- **Purpose**: Process emails within a specific range
- **Usage**: `node worker-range.js [startPosition] [endPosition] [batchSize]`
- **Parameters**:
  - `startPosition` (optional): Starting position (default: 0)
  - `endPosition` (optional): Ending position, null for unlimited (default: null)
  - `batchSize` (optional): Number of emails to process per batch (default: 10)

**Examples**:
```bash
# Process emails from position 100 to 200, 15 per batch
node worker-range.js 100 200 15

# Process emails from position 500 onwards, 25 per batch
node worker-range.js 500 null 25

# Process emails from position 0 to 100, default batch size
node worker-range.js 0 100

# Process all emails from position 1000 onwards
node worker-range.js 1000
```

## Use Cases

### Parallel Processing
You can run multiple workers simultaneously to process different ranges:

```bash
# Terminal 1: Process first 1000 emails
node worker-range.js 0 1000 20

# Terminal 2: Process emails 1000-2000
node worker-range.js 1000 2000 20

# Terminal 3: Process emails 2000 onwards
node worker-range.js 2000 null 20
```

### Resume Processing
If a worker stops or crashes, you can resume from where it left off:

```bash
# If you know you processed up to email 1500, resume from there
node worker-skip.js 1500 25
```

### Load Distribution
For large datasets, distribute the load across multiple workers:

```bash
# Worker 1: First quarter
node worker-range.js 0 2500 50

# Worker 2: Second quarter  
node worker-range.js 2500 5000 50

# Worker 3: Third quarter
node worker-range.js 5000 7500 50

# Worker 4: Fourth quarter
node worker-range.js 7500 null 50
```

## Important Notes

1. **Credit Management**: All workers respect user credit limits and admin privileges
2. **Database Connection**: Each worker maintains its own MongoDB connection
3. **Graceful Shutdown**: Use Ctrl+C to stop workers gracefully
4. **Rate Limiting**: Workers include delays between verifications to avoid rate limiting
5. **Error Handling**: Failed verifications are marked as 'invalid' with error details
6. **Timeout**: Email verification has a 5-second timeout per email

## Monitoring

All workers provide detailed console output including:
- Processing progress
- Credit deductions
- Verification results
- Error messages
- User information

## Best Practices

1. **Batch Size**: Use smaller batch sizes (10-25) for better error recovery
2. **Range Planning**: Plan ranges to avoid overlap when running multiple workers
3. **Resource Management**: Monitor system resources when running multiple workers
4. **Database Load**: Consider database connection limits when scaling workers
5. **Error Recovery**: Use range workers for better error recovery and resumption 