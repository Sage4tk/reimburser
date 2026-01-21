import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract the JWT token from the Authorization header
    const token = authHeader.replace("Bearer ", "");

    // Create a regular client to verify the user is an admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Verify admin access using the JWT token
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: userError?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("user_profile")
      .select("admin")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.admin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    const body = await req.json();
    const { expenses, selectedMonth, userName, userId } = body;

    if (!expenses || !selectedMonth || !userName || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create admin client to bypass RLS for receipt access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // Get Lambda URL from environment
    const lambdaUrl = Deno.env.get("LAMBDA_PDF_URL");
    if (!lambdaUrl) {
      return new Response(
        JSON.stringify({ error: "Lambda URL not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch all receipts for the expenses using admin client
    const expenseIds = expenses.map((e: any) => e.id);
    const { data: receiptsData } = await supabaseAdmin
      .from("receipt")
      .select("id, path, expense_id, created_at")
      .in("expense_id", expenseIds)
      .order("created_at", { ascending: true });

    // Generate signed URLs for all receipts
    const receiptsWithUrls = await Promise.all(
      (receiptsData || []).map(async (receipt) => {
        const { data: signedUrl } = await supabaseAdmin.storage
          .from("receipts")
          .createSignedUrl(receipt.path, 3600); // 1 hour expiry

        return {
          id: receipt.id,
          path: receipt.path,
          url: signedUrl?.signedUrl || "",
          created_at: receipt.created_at,
          expense_id: receipt.expense_id,
        };
      }),
    );

    // Map receipts to expenses
    const expensesWithReceipts = expenses.map((expense: any) => {
      const expenseReceipts = receiptsWithUrls.filter(
        (r) => r.expense_id === expense.id && r.url,
      );
      return {
        ...expense,
        receipts: expenseReceipts,
      };
    });

    // Call Lambda to generate PDF
    const lambdaResponse = await fetch(lambdaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expenses: expensesWithReceipts,
        selectedMonth,
        userName,
        supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
        supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        userToken: token, // Include token for Lambda (though receipts already have signed URLs)
      }),
    });

    if (!lambdaResponse.ok) {
      const errorData = await lambdaResponse.json().catch(() => ({}));
      console.error("Lambda error:", lambdaResponse.status, errorData);
      return new Response(
        JSON.stringify({
          error: `Lambda error: ${
            errorData.error || lambdaResponse.statusText
          }`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const pdfData = await lambdaResponse.json();

    return new Response(JSON.stringify(pdfData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
