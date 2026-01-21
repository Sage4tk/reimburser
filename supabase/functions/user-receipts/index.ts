import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UserSummary {
  user_id: string;
  full_name: string | null;
  email: string;
  total_expenses: number;
  total_amount: number;
}

interface MonthSummary {
  month: string;
  expense_count: number;
  total_amount: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the service role key to bypass RLS
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

    // Parse URL and get action
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const userId = url.searchParams.get("userId");
    const month = url.searchParams.get("month");

    // Handle different actions
    if (action === "users") {
      // Fetch all users with their expense summary
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("user_profile")
        .select("user_id, full_name")
        .order("full_name", { ascending: true });

      if (usersError) {
        throw usersError;
      }

      // Get email for each user from auth.users
      const usersWithStats: UserSummary[] = [];

      for (const userProfile of usersData || []) {
        // Get user email from auth
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
          userProfile.user_id,
        );

        if (!authUser.user) continue;

        // Get expense stats for this user
        const { data: expenses } = await supabaseAdmin
          .from("expense")
          .select("food, taxi, others")
          .eq("user_id", userProfile.user_id);

        const totalExpenses = expenses?.length || 0;
        const totalAmount = expenses?.reduce(
          (sum, exp) =>
            sum + (exp.food || 0) + (exp.taxi || 0) + (exp.others || 0),
          0,
        ) || 0;

        usersWithStats.push({
          user_id: userProfile.user_id,
          full_name: userProfile.full_name,
          email: authUser.user.email || "",
          total_expenses: totalExpenses,
          total_amount: totalAmount,
        });
      }

      return new Response(JSON.stringify({ users: usersWithStats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "months" && userId) {
      // Fetch all months with expenses for a specific user
      const { data: expenses, error: expensesError } = await supabaseAdmin
        .from("expense")
        .select("date, food, taxi, others")
        .eq("user_id", userId)
        .not("date", "is", null)
        .order("date", { ascending: false });

      if (expensesError) {
        throw expensesError;
      }

      // Group by month
      const monthsMap = new Map<string, MonthSummary>();

      for (const expense of expenses || []) {
        if (!expense.date) continue;

        const date = new Date(expense.date);
        const monthKey = `${date.getFullYear()}-${
          String(
            date.getMonth() + 1,
          ).padStart(2, "0")
        }`;

        if (!monthsMap.has(monthKey)) {
          monthsMap.set(monthKey, {
            month: monthKey,
            expense_count: 0,
            total_amount: 0,
          });
        }

        const monthData = monthsMap.get(monthKey)!;
        monthData.expense_count++;
        monthData.total_amount += (expense.food || 0) + (expense.taxi || 0) +
          (expense.others || 0);
      }

      const months = Array.from(monthsMap.values()).sort((a, b) =>
        b.month.localeCompare(a.month)
      );

      return new Response(JSON.stringify({ months }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "expenses" && userId && month) {
      // Fetch expenses for a specific user and month
      const [year, monthNum] = month.split("-").map(Number);
      const firstDay = new Date(year, monthNum - 1, 1);
      const lastDay = new Date(year, monthNum, 0);

      const formatLocalDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };

      const startDate = formatLocalDate(firstDay);
      const endDate = formatLocalDate(lastDay);

      const { data: expenses, error: expensesError } = await supabaseAdmin
        .from("expense")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (expensesError) {
        throw expensesError;
      }

      // Fetch receipts for all expenses
      const expensesWithReceipts = await Promise.all(
        (expenses || []).map(async (expense) => {
          const { data: receiptsData } = await supabaseAdmin
            .from("receipt")
            .select("id, path, created_at")
            .eq("expense_id", expense.id)
            .order("created_at", { ascending: true });

          // Generate signed URLs for receipts
          const receipts = await Promise.all(
            (receiptsData || []).map(async (receipt) => {
              const { data: signedUrl } = await supabaseAdmin.storage
                .from("receipts")
                .createSignedUrl(receipt.path, 3600); // 1 hour expiry

              return {
                id: receipt.id,
                path: receipt.path,
                url: signedUrl?.signedUrl || "",
                created_at: receipt.created_at,
                expense_id: expense.id,
              };
            }),
          );

          return {
            ...expense,
            receipts: receipts.filter((r) => r.url), // Filter out receipts without valid URLs
          };
        }),
      );

      return new Response(JSON.stringify({ expenses: expensesWithReceipts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action or missing parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
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
