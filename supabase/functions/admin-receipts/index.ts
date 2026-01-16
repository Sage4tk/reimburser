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

    // Get action from query params
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get pagination params
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    if (action === "job-groups") {
      // Fetch all expenses
      const { data: expenses, error: expensesError } = await supabaseAdmin
        .from("expense")
        .select("job_no, date, user_id");

      if (expensesError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch expenses" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Group by job_no only (removed month grouping)
      const groups = new Map();

      expenses?.forEach((expense) => {
        const key = expense.job_no;

        if (groups.has(key)) {
          const group = groups.get(key);
          group.expense_count++;
          group.user_ids.add(expense.user_id);
        } else {
          groups.set(key, {
            job_no: key,
            expense_count: 1,
            user_ids: new Set([expense.user_id]),
          });
        }
      });

      const jobGroups = Array.from(groups.values()).map((group) => ({
        job_no: group.job_no,
        expense_count: group.expense_count,
        user_count: group.user_ids.size,
      }));

      // Sort job numbers by format MMYY-JJ
      // Jobs that don't follow format go to the end
      jobGroups.sort((a, b) => {
        const formatRegex = /^(\d{2})(\d{2})-(\d+)$/;
        const matchA = a.job_no.match(formatRegex);
        const matchB = b.job_no.match(formatRegex);

        // If both match the format, compare them
        if (matchA && matchB) {
          const [, monthA, yearA, jobA] = matchA;
          const [, monthB, yearB, jobB] = matchB;

          // Compare year first (descending - most recent first)
          if (yearA !== yearB) {
            return parseInt(yearB) - parseInt(yearA);
          }

          // Then month (descending - most recent first)
          if (monthA !== monthB) {
            return parseInt(monthB) - parseInt(monthA);
          }

          // Finally job number (descending)
          return parseInt(jobB) - parseInt(jobA);
        }

        // If only A matches, A comes first
        if (matchA) return -1;

        // If only B matches, B comes first
        if (matchB) return 1;

        // If neither match, sort alphabetically
        return a.job_no.localeCompare(b.job_no);
      });

      // Apply pagination
      const totalCount = jobGroups.length;
      const totalPages = Math.ceil(totalCount / limit);
      const paginatedJobGroups = jobGroups.slice(offset, offset + limit);

      return new Response(
        JSON.stringify({
          jobGroups: paginatedJobGroups,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } else if (action === "user-expenses") {
      const jobNo = url.searchParams.get("jobNo");

      if (!jobNo) {
        return new Response(
          JSON.stringify({ error: "jobNo is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Fetch all expenses for this job
      const { data: expenses, error: expensesError } = await supabaseAdmin
        .from("expense")
        .select("user_id, food, taxi, others")
        .eq("job_no", jobNo);

      if (expensesError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch expenses" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Get unique user IDs
      const userIds = [...new Set(expenses?.map((e) => e.user_id) || [])];

      // Fetch user profiles
      const { data: profiles } = await supabaseAdmin
        .from("user_profile")
        .select("user_id, full_name")
        .in("user_id", userIds);

      // Create a map of user profiles
      const profileMap = new Map(
        profiles?.map((p) => [p.user_id, p.full_name]) || [],
      );

      // Group by user
      const userMap = new Map();

      expenses?.forEach((expense) => {
        const total = (expense.food || 0) + (expense.taxi || 0) +
          (expense.others || 0);

        if (userMap.has(expense.user_id)) {
          const user = userMap.get(expense.user_id);
          user.expense_count++;
          user.total_amount += total;
        } else {
          userMap.set(expense.user_id, {
            user_id: expense.user_id,
            full_name: profileMap.get(expense.user_id) || null,
            expense_count: 1,
            total_amount: total,
          });
        }
      });

      const userExpenses = Array.from(userMap.values());

      // Apply pagination
      const totalCount = userExpenses.length;
      const totalPages = Math.ceil(totalCount / limit);
      const paginatedUserExpenses = userExpenses.slice(offset, offset + limit);

      return new Response(
        JSON.stringify({
          userExpenses: paginatedUserExpenses,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } else if (action === "receipts") {
      const userId = url.searchParams.get("userId");
      const jobNo = url.searchParams.get("jobNo");

      if (!userId || !jobNo) {
        return new Response(
          JSON.stringify({ error: "userId and jobNo are required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Fetch all receipts
      const { data: allReceipts, error: allReceiptsError } = await supabaseAdmin
        .from("receipt")
        .select("id, path, created_at, expense_id");

      if (allReceiptsError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch receipts" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Fetch expenses for this user and job
      const { data: userExpenses } = await supabaseAdmin
        .from("expense")
        .select("id, details, date")
        .eq("user_id", userId)
        .eq("job_no", jobNo);

      const expenseMap = new Map(
        userExpenses?.map((e) => [e.id, e]) || [],
      );

      // Filter receipts and enrich with expense details
      const filteredReceipts = allReceipts
        ?.filter((r) => expenseMap.has(r.expense_id))
        .map((r) => {
          const expense = expenseMap.get(r.expense_id);
          return {
            ...r,
            expense_details: expense?.details || "",
            expense_date: expense?.date || null,
          };
        });

      // Generate signed URLs
      const receiptsWithUrls = await Promise.all(
        (filteredReceipts || []).map(async (receipt) => {
          const { data: urlData } = await supabaseAdmin.storage
            .from("receipts")
            .createSignedUrl(receipt.path, 3600);

          return {
            ...receipt,
            url: urlData?.signedUrl || "",
          };
        }),
      );

      // Apply pagination
      const totalCount = receiptsWithUrls.length;
      const totalPages = Math.ceil(totalCount / limit);
      const paginatedReceipts = receiptsWithUrls.slice(offset, offset + limit);

      return new Response(
        JSON.stringify({
          receipts: paginatedReceipts,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in admin-receipts function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
