# Generate PDF Edge Function

This Supabase Edge Function generates a PDF document containing all receipt images for a given set of expenses.

## Deployment

### Deploy to Supabase

```bash
supabase functions deploy generate-pdf
```

### Test Locally

1. Start Supabase locally:

```bash
supabase start
```

2. Serve the function:

```bash
supabase functions serve generate-pdf
```

3. Test with curl:

```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-pdf' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "expenses": [
      {
        "id": "expense-id",
        "job_no": "JOB-001",
        "date": "2025-01-15",
        "details": "Test expense"
      }
    ],
    "selectedMonth": "January 2025"
  }'
```

## Request Format

**POST** `/functions/v1/generate-pdf`

**Headers:**

- `Authorization`: Bearer token (user's access token)
- `Content-Type`: application/json

**Body:**

```json
{
  "expenses": [
    {
      "id": "string",
      "job_no": "string",
      "date": "string",
      "details": "string"
    }
  ],
  "selectedMonth": "string"
}
```

## Response Format

**Success (200):**

```json
{
  "pdf": "base64-encoded-pdf-data",
  "filename": "amplitude-receipts-January-2025.pdf"
}
```

**Error (400/500):**

```json
{
  "error": "Error message"
}
```

## How It Works

1. Receives expense data from the frontend
2. For each expense, fetches associated receipt images from Supabase Storage
3. Generates a PDF with:
   - Title "Expense Receipts"
   - For each expense: Job No, Date, Details
   - All receipt images scaled to fit the page
4. Returns the PDF as base64-encoded data
5. Frontend converts base64 to blob and triggers download

## Benefits Over Client-Side Generation

- **Performance**: Offloads heavy PDF processing from client browsers
- **Memory**: Reduces memory usage on client devices
- **Reliability**: More consistent results across different devices/browsers
- **Scalability**: Can handle larger PDFs without freezing the UI
