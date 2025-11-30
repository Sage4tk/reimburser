# Migrating PDF Generation to AWS Lambda

This guide covers deploying the PDF generation function to AWS Lambda and updating your frontend.

## Prerequisites

- AWS Account with CLI configured
- Node.js 20+ installed
- IAM role for Lambda execution

## Step 1: Build and Package Lambda Function

```bash
cd lambda/generate-pdf
npm install
npm run build
npm run package
```

This creates `function.zip` ready for deployment.

## Step 2: Deploy to AWS Lambda

### Option A: AWS Console (Easiest)

1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Click "Create function"
3. Choose "Author from scratch"
4. Configure:
   - Function name: `reimburse-generate-pdf`
   - Runtime: Node.js 20.x
   - Architecture: x86_64
   - Execution role: Create new or use existing with basic Lambda permissions
5. Click "Create function"
6. In "Code" tab, click "Upload from" → ".zip file"
7. Upload `function.zip`
8. Click "Save"
9. Go to "Configuration" → "General configuration" → "Edit":
   - Memory: 1024 MB
   - Timeout: 60 seconds
10. Click "Save"

### Option B: AWS CLI

```bash
# Create IAM role (if you don't have one)
aws iam create-role \
  --role-name lambda-execution-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach basic Lambda execution policy
aws iam attach-role-policy \
  --role-name lambda-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Create Lambda function
aws lambda create-function \
  --function-name reimburse-generate-pdf \
  --runtime nodejs20.x \
  --handler index.handler \
  --memory-size 1024 \
  --timeout 60 \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
  --zip-file fileb://function.zip
```

## Step 3: Create API Gateway

### Option A: AWS Console

1. Go to [API Gateway Console](https://console.aws.amazon.com/apigateway)
2. Click "Create API"
3. Choose "HTTP API" → "Build"
4. Click "Add integration" → "Lambda"
5. Select your Lambda function: `reimburse-generate-pdf`
6. API name: `reimburse-pdf-api`
7. Click "Next"
8. Configure routes:
   - Method: POST
   - Resource path: `/generate-pdf`
   - Integration target: Your Lambda function
9. Click "Next"
10. Stage name: `prod`
11. Click "Next" → "Create"
12. Note the "Invoke URL" (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/prod`)

### Configure CORS

1. In your API, click "CORS"
2. Configure:
   - Access-Control-Allow-Origin: `*` (or your domain)
   - Access-Control-Allow-Headers: `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`
   - Access-Control-Allow-Methods: `POST,OPTIONS`
3. Click "Save"

### Option B: AWS CLI

```bash
# Create HTTP API
aws apigatewayv2 create-api \
  --name reimburse-pdf-api \
  --protocol-type HTTP \
  --cors-configuration AllowOrigins="*",AllowMethods="POST,OPTIONS",AllowHeaders="Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token"

# Get API ID from output, then create integration
aws apigatewayv2 create-integration \
  --api-id YOUR_API_ID \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:REGION:ACCOUNT_ID:function:reimburse-generate-pdf \
  --payload-format-version 2.0

# Create route
aws apigatewayv2 create-route \
  --api-id YOUR_API_ID \
  --route-key "POST /generate-pdf" \
  --target integrations/INTEGRATION_ID

# Create stage
aws apigatewayv2 create-stage \
  --api-id YOUR_API_ID \
  --stage-name prod \
  --auto-deploy

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission \
  --function-name reimburse-generate-pdf \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:REGION:ACCOUNT_ID:YOUR_API_ID/*/*/generate-pdf"
```

## Step 4: Update Frontend Environment

1. Copy `.env.example` to `.env` (if not already done)
2. Update `.env` with your values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_LAMBDA_PDF_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod/generate-pdf
```

3. Restart your dev server:

```bash
npm run dev
```

## Step 5: Test the Integration

1. Log in to your app
2. Add some expenses with receipts
3. Click "Export Receipts to PDF"
4. Verify PDF downloads successfully

## Monitoring and Troubleshooting

### View Lambda Logs

```bash
# View recent logs
aws logs tail /aws/lambda/reimburse-generate-pdf --follow

# Or use CloudWatch console
```

### Common Issues

**"PDF service not configured"**

- Check that `VITE_LAMBDA_PDF_URL` is set in `.env`
- Restart dev server after changing `.env`

**CORS errors**

- Verify CORS configuration in API Gateway
- Check browser console for specific CORS error
- Ensure OPTIONS method is configured

**Timeout errors**

- Increase Lambda timeout (Configuration → General configuration)
- Reduce number of receipts or image sizes
- Check CloudWatch logs for actual error

**"Function timed out"**

- Increase timeout to 120-300 seconds for large batches
- Increase memory to 1536 MB or 2048 MB

## Cost Optimization

### Estimated Monthly Costs (100 PDFs with 20 receipts each)

- **Lambda**: ~$0.05
- **API Gateway**: ~$0.01
- **Data Transfer**: ~$0.01
- **Total**: ~$0.07/month

### Tips to Reduce Costs

1. Use ARM architecture (Graviton2) for 20% savings:

   ```bash
   # Update Lambda to arm64
   aws lambda update-function-configuration \
     --function-name reimburse-generate-pdf \
     --architectures arm64
   ```

2. Optimize memory based on CloudWatch metrics
3. Set up CloudWatch alarms for unexpected usage

## Updating the Function

When you make changes to the Lambda code:

```bash
cd lambda/generate-pdf
npm run build
npm run package

# Update via console or CLI
aws lambda update-function-code \
  --function-name reimburse-generate-pdf \
  --zip-file fileb://function.zip
```

## Rolling Back

If you need to revert to Supabase Edge Functions:

1. Comment out the Lambda code in ExpenseTable.tsx
2. Uncomment the original Edge Function code
3. Remove `VITE_LAMBDA_PDF_URL` from `.env`
4. Restart dev server

## Security Considerations

- User JWT token is passed in request for authentication
- Supabase RLS policies still apply (user can only access their own data)
- Consider adding API Gateway authentication for production
- Use VPC for Lambda if accessing private resources
- Enable CloudWatch Logs encryption

## Production Checklist

- [ ] Lambda function deployed with adequate memory/timeout
- [ ] API Gateway configured with proper CORS
- [ ] Environment variables set in production build
- [ ] Tested with various receipt counts and sizes
- [ ] CloudWatch alarms configured
- [ ] Costs monitored
- [ ] Error tracking in place (e.g., Sentry)
