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
    // Create Supabase client with service role for direct storage access
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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
    let processedReceipts = 0;
    const MAX_RECEIPTS = 50;
    const MAX_RECEIPTS_PER_EXPENSE = 10;

    for (const expense of expenses as Expense[]) {
      console.log(`Processing expense: ${expense.id}`);

      // Fetch receipts for this expense
      const { data: receipts, error: fetchError } = await supabaseClient
        .from("receipt")
        .select("*")
        .eq("expense_id", expense.id);

      if (fetchError) {
        console.error(
          `Error fetching receipts for expense ${expense.id}:`,
          fetchError,
        );
        continue;
      }

      if (!receipts || receipts.length === 0) {
        console.log(`No receipts found for expense ${expense.id}`);
        continue;
      }

      console.log(
        `Found ${receipts.length} receipts for expense ${expense.id}`,
      );

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
            const { data: imageBlob, error: downloadError } =
              await supabaseClient
                .storage
                .from("receipts")
                .download(receipt.path);

            if (downloadError || !imageBlob) {
              console.warn(
                `Failed to download ${receipt.path}:`,
                downloadError,
              );
              return null;
            }

            // Skip very large images
            const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
            if (imageBlob.size > MAX_IMAGE_SIZE) {
              console.warn(
                `Skipping large image: ${receipt.path} (${imageBlob.size} bytes)`,
              );
              return null;
            }

            // Convert to arrayBuffer and base64
            const arrayBuffer = await imageBlob.arrayBuffer();
            const contentType = imageBlob.type || "image/jpeg";

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
          const imgHeight = 100;

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

    console.log(
      `Finished processing. Total receipts added to PDF: ${processedReceipts}`,
    );

    // Generate PDF as base64 using chunking to avoid stack overflow
    const pdfOutput = pdf.output("arraybuffer");
    const uint8Array = new Uint8Array(pdfOutput);
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(
        i,
        Math.min(i + chunkSize, uint8Array.length),
      );
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
