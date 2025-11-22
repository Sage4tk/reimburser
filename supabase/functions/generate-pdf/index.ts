// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import jsPDF from "jspdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Get request body
    const { expenses, selectedMonth, userName } = await req.json();

    if (!expenses || expenses.length === 0) {
      return new Response(
        JSON.stringify({ error: "No expenses provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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

    // Process each expense sequentially
    for (const expense of expenses as Expense[]) {
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

      // Process each receipt sequentially
      for (const receipt of receipts as Receipt[]) {
        try {
          // Get signed URL for receipt
          const { data: urlData } = await supabaseClient.storage
            .from("receipts")
            .createSignedUrl(receipt.path, 3600);

          if (!urlData?.signedUrl) continue;

          // Fetch image
          const response = await fetch(urlData.signedUrl);
          if (!response.ok) continue;

          const arrayBuffer = await response.arrayBuffer();
          const contentType = response.headers.get("content-type") ||
            "image/jpeg";

          // Convert to base64 in chunks to avoid stack overflow
          const uint8Array = new Uint8Array(arrayBuffer);
          let binaryString = "";
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryString += String.fromCharCode(...chunk);
          }
          const base64 = btoa(binaryString);
          const dataUrl = `data:${contentType};base64,${base64}`;

          // Use default image dimensions - let jsPDF handle it
          const imgWidth = imageMaxWidth;
          const imgHeight = 150; // Default height, will be scaled by jsPDF

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
          );
          yPosition += imgHeight + 10;
        } catch (error) {
          console.error("Error processing receipt:", receipt.path, error);
        }
      }

      yPosition += 10; // Space between expense groups
    }

    // Generate PDF as base64 using chunking to avoid stack overflow
    const pdfOutput = pdf.output("arraybuffer");
    const uint8Array = new Uint8Array(pdfOutput);
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Pdf = btoa(binaryString);

    return new Response(
      JSON.stringify({
        pdf: base64Pdf,
        filename: `amplitude-receipts-${selectedMonth.replace(" ", "-")}.pdf`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error generating PDF:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to generate PDF";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
