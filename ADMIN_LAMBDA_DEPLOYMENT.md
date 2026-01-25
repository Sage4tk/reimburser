# Admin Generate PDF Lambda Deployment Guide

This guide will help you deploy the admin PDF generation Lambda function to AWS.

## Prerequisites

- AWS Account with CLI configured
- Node.js 20+ installed
- Admin Lambda function built and packaged

## Step 1: Build and Package

```bash
cd lambda/admin-generate-pdf
npm install
npm run build
npm run package
```

This creates `function.zip` ready for deployment.

## Step 2: Deploy to AWS Lambda

### Option A: AWS Console (Recommended)

1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Click "Create function"
3. Choose "Author from scratch"
4. Configure:
   - **Function name**: `reimburse-admin-generate-pdf`
   - **Runtime**: Node.js 20.x
   - **Architecture**: x86_64
   - **Execution role**: Use existing role from regular PDF Lambda or create new with:
     - S3 read/write permissions
     - CloudWatch Logs permissions
5. Click "Create function"
6. In "Code" tab, click "Upload from" → ".zip file"
7. Upload `lambda/admin-generate-pdf/function.zip`
8. Click "Save"

### Configure Function Settings

1. Go to "Configuration" → "General configuration" → "Edit":
   - **Memory**: 1024 MB (or 2048 MB for large PDF batches)
   - **Timeout**: 90 seconds
   - **Ephemeral storage**: 512 MB (default)
2. Click "Save"

### Set Environment Variables

1. Go to "Configuration" → "Environment variables" → "Edit"
2. Add the following variables:
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
     - Get from: Supabase Dashboard → Settings → API → service_role key
   - `PDF_BUCKET_NAME`: `reimburse-pdfs` (or your S3 bucket name)
   - `AWS_REGION`: `us-east-1` (or your region)
3. Click "Save"

⚠️ **IMPORTANT**: The `SUPABASE_SERVICE_ROLE_KEY` gives admin access to your database. Keep it secure!

### Configure Lambda Function URL

1. Go to "Configuration" → "Function URL"
2. Click "Create function URL"
3. Configure:
   - **Auth type**: NONE (authentication is handled in code via JWT)
   - **CORS**: Configure CORS
     - **Allow origin**: `*` (or your specific domain)
     - **Allow methods**: `POST`
     - **Allow headers**: `content-type, authorization`
     - **Max age**: 3600
4. Click "Save"
5. **Copy the Function URL** - you'll need this for the environment variables

Example URL: `https://abc123xyz.lambda-url.us-east-1.on.aws/`

## Step 3: Update Your Application

### Update .env File

Open `c:\Users\ttimb\coding\personal\reimburse\reimburse-frontend\.env` and update:

```env
VITE_LAMBDA_ADMIN_PDF_URL=https://YOUR_FUNCTION_URL_HERE.lambda-url.us-east-1.on.aws/
```

Replace `YOUR_FUNCTION_URL_HERE` with the actual Function URL from Step 2.

### Update Supabase Edge Function Secrets

The edge function needs access to the admin Lambda URL. Set it in Supabase:

```bash
# From your project root
npx supabase secrets set LAMBDA_ADMIN_PDF_URL=https://YOUR_FUNCTION_URL_HERE.lambda-url.us-east-1.on.aws/
```

Or via Supabase Dashboard:

1. Go to Edge Functions
2. Select `admin-generate-pdf`
3. Go to Settings
4. Add secret: `LAMBDA_ADMIN_PDF_URL` with your Function URL

## Step 4: Test the Deployment

1. Log in to your app as an admin user
2. Navigate to "Receipts by User" section
3. Select a user and month with expenses
4. Click "Export PDF"
5. Verify PDF is generated with all receipts

## Troubleshooting

### Lambda Timeout Errors

- Increase memory to 2048 MB
- Increase timeout to 120 seconds
- Check CloudWatch Logs for specific errors

### "Service role key not configured" Error

- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Lambda environment variables
- Make sure there are no extra spaces in the key

### "Admin Lambda URL not configured" Error

- Verify edge function has `LAMBDA_ADMIN_PDF_URL` secret set
- Redeploy edge function after setting the secret

### PDF Generation Fails

1. Check CloudWatch Logs in AWS Lambda Console
2. Verify S3 bucket permissions
3. Check that expenses have receipts in Supabase storage

### CORS Errors

- Verify Function URL has CORS configured correctly
- Check that `Access-Control-Allow-Origin` includes your domain

## Security Notes

1. **Service Role Key**: Never commit the service role key to version control
2. **Function URL**: The function validates admin status before processing
3. **JWT Token**: The function verifies the user token with Supabase
4. **S3 Presigned URLs**: Generated URLs expire after 1 hour

## Cost Optimization

- Lambda free tier: 1M requests/month, 400,000 GB-seconds
- S3 storage: First 5 GB free
- Consider lifecycle policies for old PDFs in S3

## Next Steps

After successful deployment:

- Monitor CloudWatch Logs for any errors
- Set up CloudWatch Alarms for failures
- Consider adding CloudFront CDN for faster PDF downloads
- Implement PDF cleanup policy in S3 (e.g., delete after 30 days)
