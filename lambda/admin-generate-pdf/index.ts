import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

interface Expense {
  id: string;
  job_no: string;
  date: string;
  details: string;
}

interface Receipt {
  id: string;
  path: string;
  expense_id: string;
}

interface RequestBody {
  expenses: Expense[];
  selectedMonth: string;
  userName?: string | null;
  userId?: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  userToken: string;
}

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // CORS is handled by Lambda Function URL configuration
  // No need to handle OPTIONS or add CORS headers in code

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing request body" }),
      };
    }

    const {
      expenses,
      selectedMonth,
      userName,
      userId,
      supabaseUrl,
      supabaseAnonKey,
      userToken,
    }: RequestBody = JSON.parse(event.body);

    if (!expenses || expenses.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No expenses provided" }),
      };
    }

    if (!supabaseUrl || !supabaseAnonKey || !userToken) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing Supabase credentials" }),
      };
    }

    // Get service role key from environment
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseServiceRoleKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Service role key not configured" }),
      };
    }

    // Create regular Supabase client to verify user identity
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    });

    // Verify the user is authenticated and get their ID
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(userToken);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized - Invalid token" }),
      };
    }

    // Create admin client with service role key (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if user is admin using admin client
    const { data: userProfile, error: profileError } = await adminClient
      .from("user_profile")
      .select("admin")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      console.error("Error fetching user profile:", profileError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to verify admin status" }),
      };
    }

    if (!userProfile?.admin) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Forbidden - Admin privileges required",
        }),
      };
    }

    // Create PDF
    const pdf = new jsPDF();
    let yPosition = 20;
    const pageHeight = pdf.internal.pageSize.height;
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 15;
    const imageMaxWidth = pageWidth - 2 * margin;

    // Title
    pdf.setFontSize(18);
    pdf.text("Expense Receipts", pageWidth / 2, yPosition, {
      align: "center",
    });
    yPosition += 10;

    // Name and Month
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    if (userName) {
      pdf.text(`Name: ${userName}`, margin, yPosition);
      yPosition += 7;
    }
    if (selectedMonth) {
      pdf.text(`Month: ${selectedMonth}`, margin, yPosition);
      yPosition += 7;
    }
    yPosition += 8;

    // Fetch ALL receipts for ALL expenses in one query using admin client
    const expenseIds = expenses.map((e) => e.id);
    const { data: allReceipts } = await adminClient
      .from("receipt")
      .select("*")
      .in("expense_id", expenseIds);

    if (!allReceipts || allReceipts.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No receipts found for expenses" }),
      };
    }

    // Group receipts by expense_id
    const receiptsByExpense = new Map<string, Receipt[]>();
    for (const receipt of allReceipts as Receipt[]) {
      if (!receiptsByExpense.has(receipt.expense_id)) {
        receiptsByExpense.set(receipt.expense_id, []);
      }
      receiptsByExpense.get(receipt.expense_id)!.push(receipt);
    }

    // Download ALL images in parallel upfront using admin client
    const MAX_RECEIPTS = 150;
    const receiptsToDownload = (allReceipts as Receipt[]).slice(
      0,
      MAX_RECEIPTS,
    );

    console.log(
      `Downloading ${receiptsToDownload.length} receipts in parallel...`,
    );
    const imageCache = new Map<
      string,
      { dataUrl: string; contentType: string }
    >();

    const downloadPromises = receiptsToDownload.map(async (receipt) => {
      try {
        const { data: urlData } = await adminClient.storage
          .from("receipts")
          .createSignedUrl(receipt.path, 3600);

        if (!urlData?.signedUrl) return;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(urlData.signedUrl, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") ||
          "image/jpeg";

        const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
        if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) return;

        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(
            i,
            Math.min(i + chunkSize, uint8Array.length),
          );
          binaryString += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binaryString);
        const dataUrl = `data:${contentType};base64,${base64}`;

        imageCache.set(receipt.id, { dataUrl, contentType });
      } catch (error) {
        console.error(`Error downloading receipt ${receipt.path}:`, error);
      }
    });

    await Promise.all(downloadPromises);
    console.log(`Downloaded ${imageCache.size} images successfully`);

    // Now generate PDF with cached images
    let processedReceipts = 0;

    for (const expense of expenses) {
      const receipts = receiptsByExpense.get(expense.id);
      if (!receipts || receipts.length === 0) continue;

      // Calculate header height
      const headerHeight = 24;
      const minSpaceForContent = 50;

      // Check if we need a new page before adding the header
      if (yPosition + headerHeight + minSpaceForContent > pageHeight - margin) {
        pdf.addPage();
        yPosition = 20;
      }

      // Add header for this expense
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Job No: ${expense.job_no}`, margin, yPosition);
      yPosition += 7;
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Date: ${expense.date || "N/A"}`, margin, yPosition);
      yPosition += 7;
      pdf.text(`Details: ${expense.details}`, margin, yPosition);
      yPosition += 10;

      // Add images from cache
      for (const receipt of receipts) {
        const cachedImage = imageCache.get(receipt.id);
        if (!cachedImage) continue;

        try {
          const imgWidth = imageMaxWidth;
          const imgHeight = 120;

          // Calculate available space on current page
          const availableHeight = pageHeight - yPosition - margin;

          // If image doesn't fit on current page, move to next page
          if (imgHeight > availableHeight && yPosition > 40) {
            pdf.addPage();
            yPosition = 20;
          }

          const imageFormat = cachedImage.dataUrl.includes("image/png")
            ? "PNG"
            : "JPEG";

          pdf.addImage(
            cachedImage.dataUrl,
            imageFormat,
            margin,
            yPosition,
            imgWidth,
            imgHeight,
            undefined,
            "FAST",
          );

          yPosition += imgHeight + 10;
          processedReceipts++;
        } catch (error) {
          console.error("Error adding image to PDF:", error);
        }
      }

      yPosition += 10; // Space between expense groups

      if (processedReceipts >= MAX_RECEIPTS) break;
    }

    // Generate PDF buffer
    const pdfOutput = pdf.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfOutput);

    // Upload to S3
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
    const bucketName = process.env.PDF_BUCKET_NAME || "reimburse-pdfs";
    const fileName = `receipts/admin-${Date.now()}-${
      selectedMonth.replace(/\s+/g, "-")
    }.pdf`;

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    });

    await s3Client.send(putCommand);

    // Generate presigned URL for downloading (GET) - valid for 1 hour
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
    });

    const presignedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 3600, // 1 hour
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        downloadUrl: presignedUrl,
        filename: `amplitude-receipts-${selectedMonth.replace(" ", "-")}.pdf`,
      }),
    };
  } catch (error) {
    console.error("Error generating PDF:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to generate PDF";

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: errorMessage }),
    };
  }
};
