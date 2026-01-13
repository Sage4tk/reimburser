import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client with Service Role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user from the Authorization header
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

    // Verify the JWT and get user
    const jwt = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !data?.user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({
          error: "Invalid token",
          details: userError?.message,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const user = data.user;

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profile")
      .select("admin")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.admin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get month range from query params or use current month
    const url = new URL(req.url);
    const monthStart = url.searchParams.get("monthStart");
    const monthEnd = url.searchParams.get("monthEnd");

    if (!monthStart || !monthEnd) {
      return new Response(
        JSON.stringify({ error: "monthStart and monthEnd are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch all expenses for the month with receipts
    const { data: expenses, error: expensesError } = await supabaseAdmin
      .from("expense")
      .select(
        `
        *,
        receipt(id, path)
      `,
      )
      .gte("created_at", monthStart)
      .lte("created_at", monthEnd)
      .order("created_at", { ascending: false });

    if (expensesError) {
      console.error("Error fetching expenses:", expensesError);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch expenses",
          details: expensesError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get unique user IDs from expenses
    const userIds = [...new Set(expenses?.map((e) => e.user_id) || [])];

    // Fetch user profiles for those user IDs
    const { data: userProfiles, error: profilesError } = await supabaseAdmin
      .from("user_profile")
      .select("user_id, full_name")
      .in("user_id", userIds);

    if (profilesError) {
      console.error("Error fetching user profiles:", profilesError);
    }

    // Create a map of user_id to full_name
    const userMap = new Map(
      userProfiles?.map((p) => [p.user_id, p.full_name]) || [],
    );

    // Combine expenses with user profile data
    const enrichedExpenses = expenses?.map((expense) => ({
      ...expense,
      user_profile: {
        full_name: userMap.get(expense.user_id) || null,
      },
    })) || [];

    // Get signed URL for the latest receipt if available
    let latestReceiptUrl = null;
    if (
      enrichedExpenses && enrichedExpenses.length > 0 &&
      enrichedExpenses[0].receipt &&
      enrichedExpenses[0].receipt.length > 0
    ) {
      const { data: signedUrl } = await supabaseAdmin.storage
        .from("receipts")
        .createSignedUrl(enrichedExpenses[0].receipt[0].path, 3600);

      if (signedUrl) {
        latestReceiptUrl = signedUrl.signedUrl;
      }
    }

    return new Response(
      JSON.stringify({
        expenses: enrichedExpenses || [],
        latestReceiptUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in admin-dashboard function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
