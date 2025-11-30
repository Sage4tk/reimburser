import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";

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

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // In production, replace with your actual domain
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
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
        headers: corsHeaders,
        body: JSON.stringify({ error: "No expenses provided" }),
      };
    }

    if (!supabaseUrl || !supabaseAnonKey || !userToken) {
      return {
        statusCode: 400,
        headers: corsHeaders,
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

      // Process each receipt
      for (const receipt of receipts as Receipt[]) {
        if (processedReceipts >= MAX_RECEIPTS) {
          console.warn(`Reached maximum receipt limit of ${MAX_RECEIPTS}`);
          break;
        }

        try {
          // Get signed URL for receipt
          const { data: urlData } = await supabaseClient.storage
            .from("receipts")
            .createSignedUrl(receipt.path, 3600);

          if (!urlData?.signedUrl) continue;

          // Fetch image with timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for Lambda

          const response = await fetch(urlData.signedUrl, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const arrayBuffer = await response.arrayBuffer();
          const contentType = response.headers.get("content-type") ||
            "image/jpeg";

          // Skip very large images
          const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB for Lambda
          if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
            console.warn(
              `Skipping large image: ${receipt.path} (${arrayBuffer.byteLength} bytes)`,
            );
            continue;
          }

          // Convert to base64 in chunks
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = "";
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          const base64 = btoa(binaryString);
          const dataUrl = `data:${contentType};base64,${base64}`;

          // Image dimensions
          const imgWidth = imageMaxWidth;
          const imgHeight = 120;

          // Validate dimensions
          if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
            console.error(`Invalid image dimensions: ${imgWidth}x${imgHeight}`);
            continue;
          }

          // Calculate available space on current page
          const availableHeight = pageHeight - yPosition - margin;

          // If image doesn't fit on current page, move to next page
          if (imgHeight > availableHeight) {
            if (yPosition > 40) {
              pdf.addPage();
              yPosition = 20;
            }
          }

          // Determine image format from data URL
          const imageFormat = dataUrl.includes("image/png") ? "PNG" : "JPEG";

          // Add image to PDF
          pdf.addImage(
            dataUrl,
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
          if (error instanceof Error && error.name === "AbortError") {
            console.error("Image fetch timeout:", receipt.path);
          } else {
            console.error("Error processing receipt:", receipt.path, error);
          }
        }
      }

      yPosition += 10; // Space between expense groups

      if (processedReceipts >= MAX_RECEIPTS) break;
    }

    // Generate PDF as base64
    const pdfOutput = pdf.output("arraybuffer");
    const uint8Array = new Uint8Array(pdfOutput);
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Pdf = Buffer.from(pdfOutput).toString("base64");

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pdf: base64Pdf,
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
      headers: corsHeaders,
      body: JSON.stringify({ error: errorMessage }),
    };
  }
};
