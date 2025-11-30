# AWS Lambda PDF Generator

This Lambda function generates PDFs from expense receipts stored in Supabase.

## Setup

1. Install dependencies:

```bash
cd lambda/generate-pdf
npm install
```

2. Build the function:

```bash
npm run build
```

3. Package for deployment:

```bash
npm run package
```

This creates `function.zip` ready for upload to AWS Lambda.

## AWS Lambda Configuration

### Runtime Settings

- **Runtime**: Node.js 20.x
- **Handler**: index.handler
- **Architecture**: x86_64 or arm64

### Memory and Timeout

- **Memory**: 1024 MB (recommended, increase if processing many large images)
- **Timeout**: 60 seconds (increase to 120-300s for large batches)
- **Ephemeral storage**: 512 MB (default)

### Environment Variables

None required - credentials are passed in the request body for security.

## API Gateway Setup

1. Create a REST API or HTTP API in API Gateway
2. Create a POST method pointing to this Lambda function
3. Enable CORS with these settings:
   - Access-Control-Allow-Origin: `*` (or your specific domain)
   - Access-Control-Allow-Headers: `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`
   - Access-Control-Allow-Methods: `OPTIONS,POST`

## Request Format

```json
{
  "expenses": [
    {
      "id": "expense-id",
      "job_no": "12345",
      "date": "2025-11-30",
      "details": "Expense details"
    }
  ],
  "selectedMonth": "November 2025",
  "userName": "John Doe",
  "supabaseUrl": "https://your-project.supabase.co",
  "supabaseAnonKey": "your-anon-key",
  "userToken": "user-jwt-token"
}
```

## Response Format

Success (200):

```json
{
  "pdf": "base64-encoded-pdf-data",
  "filename": "amplitude-receipts-November-2025.pdf"
}
```

Error (400/500):

```json
{
  "error": "Error message"
}
```

## Deployment Steps

### Option 1: AWS Console

1. Go to AWS Lambda Console
2. Create a new function
3. Upload `function.zip`
4. Configure runtime settings and memory/timeout
5. Create API Gateway trigger

### Option 2: AWS CLI

```bash
# Create function
aws lambda create-function \
  --function-name generate-pdf \
  --runtime nodejs20.x \
  --handler index.handler \
  --memory-size 1024 \
  --timeout 60 \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --zip-file fileb://function.zip

# Update function code
aws lambda update-function-code \
  --function-name generate-pdf \
  --zip-file fileb://function.zip
```

### Option 3: Terraform/CDK

See infrastructure-as-code examples in your AWS deployment docs.

## Performance Considerations

- **Max receipts**: Limited to 150 per request (increase if needed)
- **Max image size**: 10MB per image (larger images are skipped)
- **Fetch timeout**: 15 seconds per image
- **Compression**: Uses FAST mode for quicker processing

## Cost Estimation

AWS Lambda pricing (us-east-1):

- **Requests**: $0.20 per 1M requests
- **Duration**: $0.0000166667 per GB-second

Example: 100 PDFs/month with 20 receipts each, 30s execution @ 1GB:

- Requests: 100 \* $0.20 / 1M = $0.00002
- Duration: 100 _ 30s _ 1GB \* $0.0000166667 = $0.05
- **Total**: ~$0.05/month

API Gateway adds minimal cost (~$0.01/month for 100 requests).

## Troubleshooting

### "Function timed out"

- Increase timeout in Lambda configuration
- Reduce MAX_RECEIPTS limit
- Reduce MAX_IMAGE_SIZE limit

### "Memory limit exceeded"

- Increase memory allocation
- Process fewer receipts per batch

### CORS errors

- Verify API Gateway CORS configuration
- Check that OPTIONS method is configured
- Ensure headers match frontend requests
