# Admin PDF Export Integration Summary

This document summarizes how the admin PDF export functionality connects together.

## Architecture Overview

```
User (Admin) → Frontend Component → Supabase Edge Function → AWS Lambda → PDF Generated
              ReceiptsByUser.tsx   admin-generate-pdf      admin-generate-pdf
```

## Component Flow

### 1. Frontend (ReceiptsByUser.tsx)

**Location**: `src/components/admin/ReceiptsByUser.tsx`

**Function**: `handleGeneratePDF()`

- Triggered when admin clicks "Export PDF" button
- Fetches current user session token
- Calls Supabase edge function `/functions/v1/admin-generate-pdf`
- Sends:
  - `expenses`: Array of expense objects
  - `selectedMonth`: Month string (e.g., "January 2026")
  - `userName`: Name of the user whose receipts are being exported
  - `userId`: User ID for the receipts

### 2. Supabase Edge Function

**Location**: `supabase/functions/admin-generate-pdf/index.ts`

**Responsibilities**:

1. **Authentication**: Verifies the JWT token from the request
2. **Authorization**: Checks if user has `admin = true` in `user_profile` table
3. **Proxy**: Forwards the request to AWS Lambda
4. **Data**: Sends expenses to Lambda (receipts will be fetched by Lambda)

**Environment Variables Required**:

- `LAMBDA_ADMIN_PDF_URL`: URL of the admin Lambda function

**Key Code**:

```typescript
// Verify admin status
const { data: profile } = await supabaseClient
  .from("user_profile")
  .select("admin")
  .eq("user_id", user.id)
  .single();

if (!profile?.admin) {
  return new Response(JSON.stringify({ error: "Admin access required" }), {
    status: 403,
  });
}

// Call Lambda
const lambdaResponse = await fetch(lambdaUrl, {
  method: "POST",
  body: JSON.stringify({
    expenses,
    selectedMonth,
    userName,
    userId,
    supabaseUrl,
    supabaseAnonKey,
    userToken: token,
  }),
});
```

### 3. AWS Lambda Function

**Location**: `lambda/admin-generate-pdf/index.ts`

**Responsibilities**:

1. **Re-verify Authentication**: Validates JWT token with Supabase
2. **Re-verify Admin**: Checks admin status using **service role key** (bypasses RLS)
3. **Fetch Receipts**: Uses admin client to fetch ALL receipts for ALL expenses
4. **Download Images**: Downloads all receipt images in parallel
5. **Generate PDF**: Creates PDF with jsPDF, embedding all receipt images
6. **Upload to S3**: Saves PDF to S3 bucket
7. **Return URL**: Sends back presigned S3 download URL

**Environment Variables Required**:

- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin access
- `PDF_BUCKET_NAME`: S3 bucket name (e.g., `reimburse-pdfs`)
- `AWS_REGION`: AWS region (e.g., `us-east-1`)

**Key Features**:

- Uses `createClient(supabaseUrl, supabaseServiceRoleKey)` for admin access
- Bypasses Row Level Security (RLS) to access any user's receipts
- Validates admin status twice (edge function + lambda) for security
- Generates PDF with user name and month header
- Handles up to 150 receipts per PDF

## Data Flow

```
1. Frontend Request
   └─> POST /functions/v1/admin-generate-pdf
       Body: {
         expenses: [...],
         selectedMonth: "January 2026",
         userName: "John Doe",
         userId: "uuid-123"
       }
       Headers: {
         Authorization: "Bearer jwt_token"
       }

2. Edge Function Processing
   └─> Verify JWT token
   └─> Check admin role
   └─> POST to Lambda Function URL
       Body: {
         expenses: [...],
         selectedMonth: "January 2026",
         userName: "John Doe",
         userId: "uuid-123",
         supabaseUrl: "https://...",
         supabaseAnonKey: "...",
         userToken: "jwt_token"
       }

3. Lambda Processing
   └─> Verify JWT token
   └─> Check admin role (using service role key)
   └─> Fetch receipts for expenses (admin client)
   └─> Download receipt images
   └─> Generate PDF
   └─> Upload to S3
   └─> Return: {
         downloadUrl: "https://s3-presigned-url...",
         filename: "John_Doe-receipts-January-2026.pdf"
       }

4. Frontend Response
   └─> Download PDF from S3 URL
   └─> Mobile: Fetch and create blob URL
   └─> Desktop: Direct download link
```

## Security Layers

### Layer 1: Frontend

- Only shows "Export PDF" button to admin users
- Requires active Supabase session

### Layer 2: Edge Function

- Validates JWT token
- Checks `admin = true` in `user_profile` table
- Only admins can call Lambda

### Layer 3: Lambda Function

- Re-validates JWT token with Supabase
- Re-checks admin status using service role key
- Service role key stored as environment variable (not in code)

### Layer 4: Data Access

- Regular users: Subject to RLS policies
- Admin Lambda: Uses service role key to bypass RLS
- Can only be triggered by verified admin users

## Configuration Files

### Frontend Environment (.env)

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_LAMBDA_PDF_URL=https://xxx.lambda-url.us-east-1.on.aws/
VITE_LAMBDA_ADMIN_PDF_URL=https://xxx.lambda-url.us-east-1.on.aws/
```

### Supabase Edge Function Secrets

```bash
LAMBDA_ADMIN_PDF_URL=https://xxx.lambda-url.us-east-1.on.aws/
```

### Lambda Environment Variables

```bash
SUPABASE_SERVICE_ROLE_KEY=xxx
PDF_BUCKET_NAME=reimburse-pdfs
AWS_REGION=us-east-1
```

## Deployment Checklist

- [x] Build admin Lambda function: `npm run build` in `lambda/admin-generate-pdf/`
- [x] Package Lambda: `npm run package`
- [ ] Deploy Lambda to AWS
- [ ] Configure Lambda environment variables (SERVICE_ROLE_KEY, etc.)
- [ ] Create Lambda Function URL
- [ ] Copy Lambda Function URL
- [ ] Update `.env` with `VITE_LAMBDA_ADMIN_PDF_URL`
- [ ] Set Supabase edge function secret: `LAMBDA_ADMIN_PDF_URL`
- [ ] Deploy edge function: `npx supabase functions deploy admin-generate-pdf`
- [ ] Test with admin account

## Testing

### Test Scenarios

1. **Admin User - Valid Request**
   - Login as admin
   - Navigate to Receipts by User
   - Select user with expenses
   - Click "Export PDF"
   - ✅ Should generate PDF with all receipts

2. **Non-Admin User**
   - Login as regular user
   - Try to access admin endpoints
   - ✅ Should be blocked at edge function level

3. **No Receipts**
   - Select user/month with no receipts
   - ✅ Lambda should return error: "No receipts found"

4. **Large Dataset**
   - Select user with 50+ receipts
   - ✅ Should handle up to 150 receipts

5. **Mobile Device**
   - Test on iPhone/Android
   - ✅ Should download PDF or open in new tab

## Troubleshooting

### Common Issues

**Error: "Admin Lambda URL not configured"**

- Edge function doesn't have `LAMBDA_ADMIN_PDF_URL` secret
- Solution: Set the secret in Supabase and redeploy

**Error: "Service role key not configured"**

- Lambda missing `SUPABASE_SERVICE_ROLE_KEY` environment variable
- Solution: Add to Lambda environment variables

**Error: "Admin access required"**

- User is not admin
- Solution: Set `admin = true` in user_profile table

**PDF generation slow**

- Too many receipts or large images
- Solution: Increase Lambda memory to 2048 MB

## Future Enhancements

1. **Progress Bar**: Real-time progress updates during PDF generation
2. **Batch Export**: Export multiple users at once
3. **Email Delivery**: Email PDF instead of download
4. **PDF Templates**: Customizable PDF layouts
5. **Compression**: Optimize image sizes for smaller PDFs
