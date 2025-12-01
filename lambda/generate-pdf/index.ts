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

    // Create Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    });

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

    // Process each expense
    let processedReceipts = 0;
    const MAX_RECEIPTS = 150; // Increased limit for Lambda
    const MAX_RECEIPTS_PER_EXPENSE = 20;

    for (const expense of expenses) {
      // Fetch receipts for this expense
      const { data: receipts } = await supabaseClient
        .from("receipt")
        .select("*")
        .eq("expense_id", expense.id);

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

      // Limit receipts to process
      const receiptsToProcess = (receipts as Receipt[]).slice(
        0,
        Math.min(MAX_RECEIPTS_PER_EXPENSE, MAX_RECEIPTS - processedReceipts),
      );

      // Download all receipts in parallel using Promise.all
      const downloadResults = await Promise.all(
        receiptsToProcess.map(async (receipt) => {
          try {
            // Get signed URL for receipt
            const { data: urlData } = await supabaseClient.storage
              .from("receipts")
              .createSignedUrl(receipt.path, 3600);

            if (!urlData?.signedUrl) return null;

            // Fetch image with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(urlData.signedUrl, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) return null;

            const arrayBuffer = await response.arrayBuffer();
            const contentType = response.headers.get("content-type") ||
              "image/jpeg";

            // Skip very large images
            const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
            if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
              console.warn(`Skipping large image: ${receipt.path}`);
              return null;
            }

            // Convert to base64 in chunks
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

            return { dataUrl, contentType };
          } catch (error) {
            console.error(`Error downloading receipt ${receipt.path}:`, error);
            return null;
          }
        }),
      );

      // Add images to PDF sequentially (jsPDF is not thread-safe)
      for (const result of downloadResults) {
        if (!result) continue;

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

          const imageFormat = result.dataUrl.includes("image/png")
            ? "PNG"
            : "JPEG";

          pdf.addImage(
            result.dataUrl,
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
    const fileName = `receipts/${Date.now()}-${
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
