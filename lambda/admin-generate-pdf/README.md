# Admin Generate PDF Lambda Function

This Lambda function generates PDF documents containing expense receipts with **admin privileges**, bypassing Row Level Security (RLS) in Supabase.

## Features

- **Admin-only access**: Verifies that the requesting user has admin role
- **Service role authentication**: Uses Supabase service role key to bypass RLS
- **User verification**: Validates the user token before checking admin status
- **Cross-user access**: Can generate PDFs for any user's expenses (admin only)

## Key Differences from Regular generate-pdf

1. **Admin verification**: Checks if the authenticated user has `role = 'admin'` in the `user_profile` table
2. **Service role key**: Uses `SUPABASE_SERVICE_ROLE_KEY` environment variable instead of anon key for data access
3. **RLS bypass**: Can access all receipts and expenses regardless of user ownership
4. **Dual client approach**:
   - Regular client for user authentication
   - Admin client for data access

## Environment Variables

Required:

- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (must be set in Lambda configuration)
- `AWS_REGION` - AWS region for S3 (default: us-east-1)
- `PDF_BUCKET_NAME` - S3 bucket name for PDF storage (default: reimburse-pdfs)

## Request Body

```json
{
  "expenses": [
    {
      "id": "uuid",
      "job_no": "123",
      "date": "2026-01-15",
      "details": "Office supplies"
    }
  ],
  "selectedMonth": "January 2026",
  "userName": "John Doe",
  "userId": "user-uuid",
  "supabaseUrl": "https://xxx.supabase.co",
  "supabaseAnonKey": "anon-key",
  "userToken": "jwt-token"
}
```

## Response

Success (200):

```json
{
  "downloadUrl": "https://s3-presigned-url",
  "filename": "amplitude-receipts-January-2026.pdf"
}
```

Error responses:

- 401: Invalid or missing token
- 403: User is not an admin
- 400: Missing required data
- 500: Server error

## Security

- Validates JWT token before processing
- Verifies admin role in database
- Uses service role key securely from environment variables
- Never exposes service role key in responses or logs

## Deployment

1. Install dependencies:

   ```bash
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

4. Set environment variable in AWS Lambda:
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
   - `PDF_BUCKET_NAME`: Your S3 bucket name
   - `AWS_REGION`: Your AWS region

5. Deploy the function.zip to AWS Lambda
