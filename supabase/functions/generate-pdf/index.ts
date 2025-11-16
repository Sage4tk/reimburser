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

// Helper function to get image dimensions without loading in browser
async function getImageDimensions(
  arrayBuffer: ArrayBuffer,
): Promise<{ width: number; height: number }> {
  const bytes = new Uint8Array(arrayBuffer);

  // Check for JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      offset += 2;

      // SOF markers (Start of Frame)
      if (
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8
      ) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return { width, height };
      }

      const length = (bytes[offset] << 8) | bytes[offset + 1];
      offset += length;
    }
  }

  // Check for PNG
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) |
      bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) |
      bytes[23];
    return { width, height };
  }

  // Default fallback
  return { width: 800, height: 600 };
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
    const { expenses, selectedMonth } = await req.json();

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
    yPosition += 15;

    // Fetch all receipts for all expenses in parallel
    const allReceiptsPromises = (expenses as Expense[]).map((expense) =>
      supabaseClient
        .from("receipt")
        .select("*")
        .eq("expense_id", expense.id)
        .then(({ data }) => ({ expense, receipts: data || [] }))
    );

    const expensesWithReceipts = await Promise.all(allReceiptsPromises);

    // Process each expense
    for (const { expense, receipts } of expensesWithReceipts) {
      if (receipts.length === 0) continue;

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

      // Fetch all receipt images in parallel for this expense
      const receiptImagePromises = (receipts as Receipt[]).map(
        async (receipt) => {
          const { data: urlData } = await supabaseClient.storage
            .from("receipts")
            .createSignedUrl(receipt.path, 3600);

          if (!urlData?.signedUrl) {
            console.error(
              `Failed to get signed URL for receipt: ${receipt.path}`,
            );
            return null;
          }

          try {
            const response = await fetch(urlData.signedUrl);
            if (!response.ok) {
              console.error(
                `Failed to fetch image: ${response.status} ${response.statusText}`,
              );
              return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            const contentType = response.headers.get("content-type") ||
              "image/jpeg";

            // Get dimensions without loading in browser
            const dimensions = await getImageDimensions(arrayBuffer);

            const base64 = btoa(
              String.fromCharCode(...new Uint8Array(arrayBuffer)),
            );
            const dataUrl = `data:${contentType};base64,${base64}`;

            console.log(
              `Successfully processed receipt: ${receipt.path}, dimensions: ${dimensions.width}x${dimensions.height}`,
            );

            return {
              dataUrl,
              width: dimensions.width,
              height: dimensions.height,
            };
          } catch (error) {
            console.error(
              "Error processing receipt image:",
              receipt.path,
              error,
            );
            return null;
          }
        },
      );

      const receiptImages = (await Promise.all(receiptImagePromises)).filter(
        (img): img is { dataUrl: string; width: number; height: number } =>
          img !== null,
      );

      console.log(
        `Adding ${receiptImages.length} images to PDF for expense ${expense.job_no}`,
      );

      // Add images to PDF
      for (const img of receiptImages) {
        // Calculate scaled dimensions
        let imgWidth = imageMaxWidth;
        let imgHeight = (img.height * imageMaxWidth) / img.width;

        // Calculate available space on current page
        const availableHeight = pageHeight - yPosition - margin;

        // If image doesn't fit on current page, move to next page
        if (imgHeight > availableHeight) {
          if (yPosition > 40) {
            pdf.addPage();
            yPosition = 20;
          }

          const newAvailableHeight = pageHeight - yPosition - margin;

          // If image is still too tall, scale it to fit
          if (imgHeight > newAvailableHeight) {
            imgHeight = newAvailableHeight;
            imgWidth = (img.width * imgHeight) / img.height;
          }
        }

        // Add image to PDF
        pdf.addImage(
          img.dataUrl,
          "JPEG",
          margin,
          yPosition,
          imgWidth,
          imgHeight,
        );
        yPosition += imgHeight + 10;
      }

      yPosition += 10; // Space between expense groups
    }

    // Generate PDF as base64
    const pdfOutput = pdf.output("arraybuffer");
    const base64Pdf = btoa(
      String.fromCharCode(...new Uint8Array(pdfOutput)),
    );

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
