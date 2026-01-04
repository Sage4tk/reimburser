import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import supabase from "../../lib/supabase";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Spinner } from "../ui/spinner";

interface JobGroup {
  job_no: string;
  month: string;
  expense_count: number;
  user_count: number;
}

interface UserExpense {
  user_id: string;
  full_name: string | null;
  expense_count: number;
  total_amount: number;
}

interface Receipt {
  id: string;
  path: string;
  url: string;
  created_at: string;
  expense_id: string;
  expense_details: string;
  expense_date: string | null;
}

type ViewLevel = "jobs" | "users" | "receipts";

export function ReceiptsManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [fullScreenImage, setFullScreenImage] = useState<Receipt | null>(null);

  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [userExpenses, setUserExpenses] = useState<UserExpense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  // Get current view state from URL
  const selectedJobNo = searchParams.get("job") || "";
  const selectedMonth = searchParams.get("month") || "";
  const selectedUserId = searchParams.get("user") || "";
  const selectedUserName = searchParams.get("userName") || "";

  const viewLevel: ViewLevel = selectedUserId
    ? "receipts"
    : selectedJobNo
    ? "users"
    : "jobs";

  useEffect(() => {
    if (viewLevel === "jobs") {
      fetchJobGroups();
    } else if (viewLevel === "users" && selectedJobNo) {
      fetchUserExpenses(selectedJobNo, selectedMonth);
    } else if (viewLevel === "receipts" && selectedUserId && selectedJobNo) {
      fetchReceipts(selectedUserId);
    }
  }, [viewLevel, selectedJobNo, selectedMonth, selectedUserId]);

  const fetchJobGroups = async () => {
    setLoading(true);
    try {
      const { data: expenses, error } = await supabase
        .from("expense")
        .select("job_no, date, user_id");

      if (error) throw error;

      // Group by month and job_no
      const groups = new Map<string, JobGroup>();

      expenses?.forEach((expense) => {
        const date = expense.date ? new Date(expense.date) : new Date();
        const month = date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        });
        const key = `${month}-${expense.job_no}`;

        if (groups.has(key)) {
          const group = groups.get(key)!;
          group.expense_count++;
        } else {
          groups.set(key, {
            job_no: expense.job_no,
            month,
            expense_count: 1,
            user_count: 0,
          });
        }
      });

      // Get unique user counts for each job
      for (const [key, group] of groups.entries()) {
        const { data: uniqueUsers } = await supabase
          .from("expense")
          .select("user_id", { count: "exact", head: false })
          .eq("job_no", group.job_no);

        const uniqueUserIds = new Set(uniqueUsers?.map((e) => e.user_id));
        group.user_count = uniqueUserIds.size;
      }

      setJobGroups(
        Array.from(groups.values()).sort(
          (a, b) => new Date(b.month).getTime() - new Date(a.month).getTime()
        )
      );
    } catch (err) {
      console.error("Error fetching job groups:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleJobDoubleClick = (jobNo: string, month: string) => {
    setSearchParams({ job: jobNo, month });
  };

  const fetchUserExpenses = async (jobNo: string, month: string) => {
    setLoading(true);

    try {
      // First get all expenses for this job
      const { data: expenses, error: expenseError } = await supabase
        .from("expense")
        .select("user_id, food, taxi, others")
        .eq("job_no", jobNo);

      if (expenseError) {
        console.error("Error fetching expenses:", expenseError);
        throw expenseError;
      }

      console.log("Fetched expenses:", expenses);

      if (!expenses || expenses.length === 0) {
        setUserExpenses([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(expenses.map((e) => e.user_id))];
      console.log("Unique user IDs:", userIds);

      // Fetch user profiles
      const { data: profiles, error: profileError } = await supabase
        .from("user_profile")
        .select("user_id, full_name")
        .in("user_id", userIds);

      if (profileError) {
        console.error("Error fetching profiles:", profileError);
      }

      console.log("Fetched profiles:", profiles);

      // Create a map of user profiles
      const profileMap = new Map(
        profiles?.map((p) => [p.user_id, p.full_name]) || []
      );

      // Group by user
      const userMap = new Map<string, UserExpense>();

      expenses.forEach((expense) => {
        const total =
          (expense.food || 0) + (expense.taxi || 0) + (expense.others || 0);

        if (userMap.has(expense.user_id)) {
          const user = userMap.get(expense.user_id)!;
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

      const userExpensesList = Array.from(userMap.values());
      console.log("User expenses list:", userExpensesList);

      setUserExpenses(userExpensesList);
    } catch (err) {
      console.error("Error in fetchUserExpenses:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUserDoubleClick = (userId: string, userName: string | null) => {
    setSearchParams({
      job: selectedJobNo,
      month: selectedMonth,
      user: userId,
      userName: userName || "Unknown User",
    });
  };

  const fetchReceipts = async (userId: string) => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("receipt")
        .select(
          `
          id,
          path,
          created_at,
          expense_id,
          expense!inner(details, date, user_id, job_no)
        `
        )
        .eq("expense.user_id", userId)
        .eq("expense.job_no", selectedJobNo);

      if (error) throw error;

      // Generate signed URLs for all receipt images
      const receiptData: Receipt[] = await Promise.all(
        (data || []).map(async (r: any) => {
          const { data: urlData } = await supabase.storage
            .from("receipts")
            .createSignedUrl(r.path, 3600); // 1 hour expiry

          return {
            id: r.id,
            path: r.path,
            url: urlData?.signedUrl || "",
            created_at: r.created_at,
            expense_id: r.expense_id,
            expense_details: r.expense?.details || "",
            expense_date: r.expense?.date || null,
          };
        })
      );

      setReceipts(receiptData);
    } catch (err) {
      console.error("Error fetching receipts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (viewLevel === "receipts") {
      setSearchParams({ job: selectedJobNo, month: selectedMonth });
      setReceipts([]);
    } else if (viewLevel === "users") {
      setSearchParams({});
      setUserExpenses([]);
    }
  };

  if (loading && viewLevel === "jobs") {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          {viewLevel === "jobs" && "Receipts by Job & Month"}
          {viewLevel === "users" &&
            `Users for Job ${selectedJobNo} - ${selectedMonth}`}
          {viewLevel === "receipts" &&
            `Receipts for ${selectedUserName} - Job ${selectedJobNo}`}
        </h2>
        {viewLevel !== "jobs" && (
          <Button onClick={handleBack} variant="outline" size="sm">
            Back
          </Button>
        )}
      </div>

      {viewLevel === "jobs" && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Job Number</TableHead>
                <TableHead>Expenses</TableHead>
                <TableHead>Users</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobGroups.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    No receipts found
                  </TableCell>
                </TableRow>
              ) : (
                jobGroups.map((group, index) => (
                  <TableRow
                    key={`${group.month}-${group.job_no}-${index}`}
                    onDoubleClick={() =>
                      handleJobDoubleClick(group.job_no, group.month)
                    }
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>{group.month}</TableCell>
                    <TableCell className="font-medium">
                      {group.job_no}
                    </TableCell>
                    <TableCell>{group.expense_count}</TableCell>
                    <TableCell>{group.user_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {viewLevel === "users" && (
        <div className="rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Expenses</TableHead>
                  <TableHead>Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  userExpenses.map((user) => (
                    <TableRow
                      key={user.user_id}
                      onDoubleClick={() =>
                        handleUserDoubleClick(user.user_id, user.full_name)
                      }
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell className="font-medium">
                        {user.full_name || "Unknown User"}
                      </TableCell>
                      <TableCell>{user.expense_count}</TableCell>
                      <TableCell>${user.total_amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {viewLevel === "receipts" && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No receipts found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <img
                    src={receipt.url}
                    alt={`Receipt for ${receipt.expense_details}`}
                    className="w-full h-64 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                    onDoubleClick={() => setFullScreenImage(receipt)}
                  />
                  <div className="text-sm">
                    <p className="font-medium">{receipt.expense_details}</p>
                    <p className="text-muted-foreground">
                      {receipt.expense_date
                        ? new Date(receipt.expense_date).toLocaleDateString()
                        : "No date"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Screen Image Dialog */}
      <Dialog
        open={!!fullScreenImage}
        onOpenChange={() => setFullScreenImage(null)}
      >
        <DialogContent className="max-w-7xl max-h-[95vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>
              {fullScreenImage?.expense_details}
              {fullScreenImage?.expense_date && (
                <span className="text-sm text-muted-foreground ml-2">
                  {new Date(fullScreenImage.expense_date).toLocaleDateString()}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 pt-4 overflow-auto">
            {fullScreenImage && (
              <img
                src={fullScreenImage.url}
                alt={`Receipt for ${fullScreenImage.expense_details}`}
                className="w-full h-auto object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
