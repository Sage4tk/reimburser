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
    // Get the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create client with service role for admin operations
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify the user's JWT and get their session
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if user is an admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("user_profile")
      .select("admin")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.admin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { action, data } = await req.json();

    switch (action) {
      case "create": {
        const { email, password, full_name, admin } = data;

        console.log("Creating user with data:", { email, full_name, admin });

        // Create auth user
        const { data: authData, error: authError } = await supabaseClient.auth
          .admin.createUser({
            email,
            password,
            email_confirm: true,
          });

        if (authError) {
          console.error("Auth error:", authError);
          throw authError;
        }

        console.log("Auth user created:", authData.user.id);

        // Create user profile
        const { error: profileError } = await supabaseClient
          .from("user_profile")
          .insert({
            user_id: authData.user.id,
            full_name,
            admin: admin || false,
            initial_login: true,
          });

        if (profileError) {
          console.error("Profile error:", profileError);
          // Rollback: delete auth user if profile creation fails
          await supabaseClient.auth.admin.deleteUser(authData.user.id);
          throw profileError;
        }

        console.log("User profile created successfully");

        return new Response(
          JSON.stringify({ success: true, user: authData.user }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "delete": {
        const { user_id } = data;

        // Delete user profile
        const { error: profileError } = await supabaseClient
          .from("user_profile")
          .delete()
          .eq("user_id", user_id);

        if (profileError) throw profileError;

        // Delete auth user
        const { error: authError } = await supabaseClient.auth.admin.deleteUser(
          user_id,
        );

        if (authError) {
          console.error("Error deleting auth user:", authError);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list": {
        // Get all user profiles
        const { data: profiles, error: profileError } = await supabaseClient
          .from("user_profile")
          .select("*")
          .order("created_at", { ascending: false });

        if (profileError) throw profileError;

        // Get auth users
        const { data: authData, error: authError } = await supabaseClient.auth
          .admin.listUsers();

        if (authError) throw authError;

        // Merge profile data with auth data
        const usersWithEmails = profiles?.map((profile) => {
          const authUser = authData.users.find(
            (u: { id: string }) => u.id === profile.user_id,
          );
          return {
            ...profile,
            email: authUser?.email || "Unknown",
          };
        });

        return new Response(
          JSON.stringify({ success: true, users: usersWithEmails }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      default:
        throw new Error("Invalid action");
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "An error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
