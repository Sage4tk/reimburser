# Receipt Upload Setup Guide

This guide explains how to set up the Supabase Storage bucket for receipt uploads.

## Prerequisites

- Supabase project already created
- Access to Supabase Dashboard

## Quick Setup (Recommended)

### Option 1: Run SQL Script (Easiest)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the entire contents of `supabase-setup-receipts.sql`
5. Click **Run** or press `Ctrl+Enter`
6. ✅ Done! All policies and bucket configuration are created

### Option 2: Manual Setup

If you prefer to set up manually, follow these steps:

### 1. Create Storage Bucket

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New Bucket**
4. Configure the bucket:
   - **Name**: `receipts`
   - **Public**: ✅ Enable (so receipts can be viewed)
   - **File size limit**: 5242880 bytes (5MB)
   - **Allowed MIME types**: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`

### 2. Set Up Storage Policies

Navigate to the **Policies** tab for the `receipts` bucket and create the following policies:

#### Policy 1: Allow authenticated users to upload

```sql
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

#### Policy 2: Allow authenticated users to read their own receipts

```sql
CREATE POLICY "Users can view their receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

#### Policy 3: Allow authenticated users to delete their own receipts

```sql
CREATE POLICY "Users can delete their receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### 3. Verify Database Schema

Make sure your `receipt` table has the following structure (should already be created):

```sql
CREATE TABLE receipt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  expense_id UUID NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
  path TEXT NOT NULL
);

-- Add index for faster lookups
CREATE INDEX idx_receipt_expense_id ON receipt(expense_id);
```

### 4. Enable Row Level Security (RLS) on receipt table

```sql
ALTER TABLE receipt ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view receipts for their own expenses
CREATE POLICY "Users can view their own receipts"
ON receipt FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expense
    WHERE expense.id = receipt.expense_id
    AND expense.user_id = auth.uid()
  )
);

-- Policy: Users can insert receipts for their own expenses
CREATE POLICY "Users can insert receipts for their own expenses"
ON receipt FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM expense
    WHERE expense.id = receipt.expense_id
    AND expense.user_id = auth.uid()
  )
);

-- Policy: Users can delete receipts for their own expenses
CREATE POLICY "Users can delete their own receipts"
ON receipt FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM expense
    WHERE expense.id = receipt.expense_id
    AND expense.user_id = auth.uid()
  )
);
```

## Features Implemented

### Receipt Upload

- ✅ Upload receipt images (PNG, JPG, WEBP) up to 5MB
- ✅ Preview images before submission
- ✅ Validate file types and sizes
- ✅ Automatic file organization by user ID and expense ID

### Receipt Management

- ✅ View existing receipts in edit mode
- ✅ Delete individual receipts
- ✅ Click to open receipts in new tab
- ✅ Automatic cleanup when expense is deleted

### Security

- ✅ Files stored in user-specific folders for better isolation
- ✅ RLS policies ensure users only access their own receipts
- ✅ Automatic orphan cleanup on expense deletion
- ✅ Public URLs for viewing (restricted by folder structure)

## File Structure

Receipts are stored with the following path structure:

```
receipts/
  {user_id}/
    {expense_id}/
      {timestamp}.{extension}
```

Example: `receipts/abc12345-user-id/123e4567-expense-id/1699123456789.jpg`

## Testing

1. **Upload a receipt**: Add or edit an expense, select an image file
2. **View receipts**: Edit an expense with receipts to see the gallery
3. **Delete receipt**: Click the X button on any receipt thumbnail
4. **Delete expense**: Delete an expense and verify receipts are also removed

## Troubleshooting

### "Failed to upload receipt" error

- Check that the `receipts` bucket exists and is public
- Verify storage policies are correctly configured
- Ensure file size is under 5MB
- Confirm file type is an image

### Cannot view receipts

- Verify the bucket is set to **Public**
- Check RLS policies on the `receipt` table
- Ensure user is authenticated

### Receipts not deleted with expense

- Verify the foreign key has `ON DELETE CASCADE`
- Check that storage policies allow deletion
- Confirm the path stored in database matches storage path
