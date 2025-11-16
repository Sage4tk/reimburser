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

    // Loop through each expense
    for (const expense of expenses as Expense[]) {
      // Fetch receipts for this expense
      const { data: receipts } = await supabaseClient
        .from("receipt")
        .select("*")
        .eq("expense_id", expense.id);

      if (!receipts || receipts.length === 0) continue;

      // Add new page if needed
      if (yPosition > pageHeight - 40) {
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

      // Process each receipt image
      for (const receipt of receipts as Receipt[]) {
        // Get signed URL
        const { data: urlData } = await supabaseClient.storage
          .from("receipts")
          .createSignedUrl(receipt.path, 3600);

        if (!urlData?.signedUrl) continue;

        try {
          // Fetch the image
          const response = await fetch(urlData.signedUrl);
          const arrayBuffer = await response.arrayBuffer();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer)),
          );
          const dataUrl = `data:${
            response.headers.get(
              "content-type",
            )
          };base64,${base64}`;

          // Get image dimensions
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
          });

          // Calculate scaled dimensions
          let imgWidth = imageMaxWidth;
          let imgHeight = (img.height * imageMaxWidth) / img.width;

          // If image is too tall, scale to fit page
          const maxHeight = pageHeight - yPosition - margin;
          if (imgHeight > maxHeight) {
            if (yPosition > 60) {
              // Start new page if we're not at the top
              pdf.addPage();
              yPosition = 20;
            }
            imgHeight = Math.min(imgHeight, pageHeight - 2 * margin);
            imgWidth = (img.width * imgHeight) / img.height;
          }

          // Check if we need a new page
          if (yPosition + imgHeight > pageHeight - margin) {
            pdf.addPage();
            yPosition = 20;
          }

          // Add image to PDF
          pdf.addImage(dataUrl, "JPEG", margin, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 10;
        } catch (error) {
          console.error("Error processing receipt image:", error);
        }
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
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate PDF" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
