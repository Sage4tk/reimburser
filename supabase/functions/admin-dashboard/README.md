# Admin Dashboard Edge Function

This edge function provides admin-only access to dashboard data, bypassing RLS (Row Level Security) policies using the Service Role key.

## Endpoint

`POST /functions/v1/admin-dashboard`

## Authentication

Requires a valid JWT token in the Authorization header and the user must have admin privileges.

## Query Parameters

- `monthStart` (required): ISO 8601 datetime string for the start of the month
- `monthEnd` (required): ISO 8601 datetime string for the end of the month

## Example Request

```javascript
const monthStart = startOfMonth(new Date());
const monthEnd = endOfMonth(new Date());

const response = await fetch(
  `${SUPABASE_URL}/functions/v1/admin-dashboard?monthStart=${monthStart.toISOString()}&monthEnd=${monthEnd.toISOString()}`,
  {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  }
);
```

## Response

```json
{
  "expenses": [
    {
      "id": "uuid",
      "created_at": "2026-01-13T10:00:00Z",
      "date": "2026-01-13",
      "details": "Client meeting",
      "food": 25.5,
      "taxi": 15.0,
      "others": 10.0,
      "job_no": "JOB-123",
      "user_id": "uuid",
      "user_profile": {
        "full_name": "John Doe"
      },
      "receipt": [
        {
          "id": "uuid",
          "path": "receipts/xyz.jpg"
        }
      ]
    }
  ],
  "latestReceiptUrl": "https://...signed-url..."
}
```

## Security

- Verifies JWT token from Authorization header
- Checks if user has admin privileges in user_profile table
- Uses Service Role key to bypass RLS policies
- Returns 401 for invalid/missing tokens
- Returns 403 for non-admin users

## Deployment

```bash
npx supabase functions deploy admin-dashboard
```

## Environment Variables

Required in Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
