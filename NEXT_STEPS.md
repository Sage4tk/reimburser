# Next Steps: Deploy Admin PDF Export

## Quick Start

Your admin PDF export is now connected! Here's what to do next:

### 1. Deploy the Admin Lambda Function

```bash
cd lambda/admin-generate-pdf
npm run package
```

Then deploy to AWS Lambda using the AWS Console:

- Function name: `reimburse-admin-generate-pdf`
- Runtime: Node.js 20.x
- Memory: 1024 MB
- Timeout: 90 seconds
- Upload: `function.zip`

**Environment Variables** (in Lambda):

```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PDF_BUCKET_NAME=reimburse-pdfs
AWS_REGION=us-east-1
```

**Create Function URL** (in Lambda Configuration):

- Auth type: NONE
- Enable CORS
- Copy the Function URL (e.g., `https://abc123.lambda-url.us-east-1.on.aws/`)

### 2. Update Environment Variables

Update `.env` file:

```env
VITE_LAMBDA_ADMIN_PDF_URL=https://YOUR_ACTUAL_LAMBDA_URL.lambda-url.us-east-1.on.aws/
```

### 3. Set Supabase Edge Function Secret

```bash
npx supabase secrets set LAMBDA_ADMIN_PDF_URL=https://YOUR_ACTUAL_LAMBDA_URL.lambda-url.us-east-1.on.aws/
```

### 4. Deploy Edge Function

```bash
npx supabase functions deploy admin-generate-pdf
```

### 5. Test It!

1. Login as admin
2. Go to "Receipts by User"
3. Select a user and month
4. Click "Export PDF"
5. PDF should download with all receipts

## What Changed

✅ **Edge Function** (`supabase/functions/admin-generate-pdf/index.ts`):

- Now uses `LAMBDA_ADMIN_PDF_URL` environment variable
- Sends expenses to admin Lambda (Lambda fetches receipts)
- Removed duplicate receipt fetching

✅ **Environment** (`.env`):

- Added `VITE_LAMBDA_ADMIN_PDF_URL` placeholder

✅ **Documentation**:

- `ADMIN_LAMBDA_DEPLOYMENT.md` - Full deployment guide
- `ADMIN_PDF_INTEGRATION.md` - Architecture and flow documentation

## Files Modified

1. `.env` - Added admin Lambda URL placeholder
2. `supabase/functions/admin-generate-pdf/index.ts` - Updated to use admin Lambda URL

## Files Created

1. `ADMIN_LAMBDA_DEPLOYMENT.md` - Step-by-step deployment guide
2. `ADMIN_PDF_INTEGRATION.md` - Full architecture documentation
3. `NEXT_STEPS.md` - This file

## Already Complete ✓

- ✅ Admin Lambda function built and ready to package
- ✅ Edge function updated to call admin Lambda
- ✅ Frontend already integrated (ReceiptsByUser.tsx)
- ✅ Security checks in place (admin verification)

## Need Help?

- See `ADMIN_LAMBDA_DEPLOYMENT.md` for detailed deployment steps
- See `ADMIN_PDF_INTEGRATION.md` for architecture details
- Check CloudWatch Logs in AWS for Lambda debugging
- Check Supabase Logs for edge function debugging
