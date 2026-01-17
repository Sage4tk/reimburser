import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import supabase from "../../lib/supabase";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { Skeleton } from "../ui/skeleton";

interface Expense {
  id: string;
  created_at: string;
  date: string | null;
  details: string;
  food: number | null;
  taxi: number | null;
  others: number | null;
  job_no: string;
  user_id: string;
  user_profile?: {
    full_name: string | null;
  };
  receipt?: {
    id: string;
    path: string;
  }[];
}

interface UserExpense {
  name: string;
  value: number;
}

interface DailyExpense {
  date: string;
  total: number;
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82CA9D",
  "#FFC658",
  "#FF6B9D",
  "#C084FC",
  "#34D399",
];

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [latestExpense, setLatestExpense] = useState<Expense | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [userExpenses, setUserExpenses] = useState<UserExpense[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>([]);
  const [currentDate] = useState(new Date());
  const [showReimbursementModal, setShowReimbursementModal] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);

      // Get the session token for authentication
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      // Call the edge function with admin privileges
      const response = await fetch(
        `${
          import.meta.env.VITE_SUPABASE_URL
        }/functions/v1/admin-dashboard?monthStart=${monthStart.toISOString()}&monthEnd=${monthEnd.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Dashboard fetch error:", errorData);
        throw new Error(
          errorData.details ||
            errorData.error ||
            "Failed to fetch dashboard data"
        );
      }

      const { expenses, latestReceiptUrl } = await response.json();

      if (expenses && expenses.length > 0) {
        // Latest expense
        setLatestExpense(expenses[0]);
        setReceiptUrl(latestReceiptUrl);

        // Calculate monthly total
        const total = expenses.reduce((sum: number, expense: Expense) => {
          return (
            sum +
            (expense.food || 0) +
            (expense.taxi || 0) +
            (expense.others || 0)
          );
        }, 0);
        setMonthlyTotal(total);

        // Calculate user expenses for pie chart
        const userMap = new Map<string, number>();
        expenses.forEach((expense: Expense) => {
          const userName = expense.user_profile?.full_name || "Unknown User";
          const expenseTotal =
            (expense.food || 0) + (expense.taxi || 0) + (expense.others || 0);
          userMap.set(userName, (userMap.get(userName) || 0) + expenseTotal);
        });

        const userExpenseData = Array.from(userMap.entries()).map(
          ([name, value]) => ({
            name,
            value: Number(value.toFixed(2)),
          })
        );
        setUserExpenses(userExpenseData);

        // Calculate daily expenses for line chart
        const dailyMap = new Map<string, number>();
        const daysInMonth = eachDayOfInterval({
          start: monthStart,
          end: monthEnd,
        });

        // Initialize all days with 0
        daysInMonth.forEach((day) => {
          dailyMap.set(format(day, "MMM dd"), 0);
        });

        // Add expense totals to corresponding days
        expenses.forEach((expense: Expense) => {
          const day = format(new Date(expense.created_at), "MMM dd");
          const expenseTotal =
            (expense.food || 0) + (expense.taxi || 0) + (expense.others || 0);
          dailyMap.set(day, (dailyMap.get(day) || 0) + expenseTotal);
        });

        // Convert to array and calculate cumulative totals
        const dailyExpenseData = Array.from(dailyMap.entries()).map(
          ([date, total]) => ({
            date,
            total: Number(total.toFixed(2)),
          })
        );

        // Calculate cumulative sum
        let cumulativeTotal = 0;
        const cumulativeExpenseData = dailyExpenseData.map((item) => {
          cumulativeTotal += item.total;
          return {
            date: item.date,
            total: Number(cumulativeTotal.toFixed(2)),
          };
        });

        setDailyExpenses(cumulativeExpenseData);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getExpenseTotal = (expense: Expense) => {
    return (expense.food || 0) + (expense.taxi || 0) + (expense.others || 0);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          {format(currentDate, "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Total</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <line x1="12" x2="12" y1="2" y2="22" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${monthlyTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              All users for {format(currentDate, "MMMM yyyy")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userExpenses.length}</div>
            <p className="text-xs text-muted-foreground">
              With expenses this month
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Latest Reimbursement
            </CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
          </CardHeader>
          <CardContent>
            {latestExpense ? (
              <div
                className="space-y-2 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                onClick={() => setShowReimbursementModal(true)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="text-xl font-bold">
                      ${getExpenseTotal(latestExpense).toFixed(2)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {latestExpense.user_profile?.full_name || "Unknown User"}{" "}
                      - {latestExpense.details}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(
                        new Date(latestExpense.created_at),
                        "MMM dd, yyyy"
                      )}
                    </p>
                  </div>
                  {receiptUrl && (
                    <div className="ml-4">
                      <div className="block w-20 h-20 rounded-md overflow-hidden border">
                        <img
                          src={receiptUrl}
                          alt="Receipt"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reimbursements this month
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pie Chart - User Expenses */}
        <Card>
          <CardHeader>
            <CardTitle>Reimbursements by User</CardTitle>
            <p className="text-sm text-muted-foreground">
              Monthly breakdown for {format(currentDate, "MMMM yyyy")}
            </p>
          </CardHeader>
          <CardContent>
            {userExpenses.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={userExpenses}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {userExpenses.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Line Chart - Daily Expenses */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Reimbursements</CardTitle>
            <p className="text-sm text-muted-foreground">
              Total expenses by day for {format(currentDate, "MMMM yyyy")}
            </p>
          </CardHeader>
          <CardContent>
            {dailyExpenses.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyExpenses}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => `$${value.toFixed(2)}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="Total ($)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reimbursement Details Modal */}
      <Dialog
        open={showReimbursementModal}
        onOpenChange={setShowReimbursementModal}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reimbursement Details</DialogTitle>
          </DialogHeader>
          {latestExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    User
                  </label>
                  <p className="text-base">
                    {latestExpense.user_profile?.full_name || "Unknown User"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Job Number
                  </label>
                  <p className="text-base">{latestExpense.job_no}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Date
                  </label>
                  <p className="text-base">
                    {latestExpense.date
                      ? format(new Date(latestExpense.date), "MMM dd, yyyy")
                      : "No date"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Created
                  </label>
                  <p className="text-base">
                    {format(
                      new Date(latestExpense.created_at),
                      "MMM dd, yyyy HH:mm"
                    )}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Details
                </label>
                <p className="text-base">{latestExpense.details}</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Food
                  </label>
                  <p className="text-lg font-semibold">
                    ${(latestExpense.food || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Taxi
                  </label>
                  <p className="text-lg font-semibold">
                    ${(latestExpense.taxi || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Others
                  </label>
                  <p className="text-lg font-semibold">
                    ${(latestExpense.others || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <label className="text-sm font-medium text-muted-foreground">
                  Total Amount
                </label>
                <p className="text-2xl font-bold">
                  ${getExpenseTotal(latestExpense).toFixed(2)}
                </p>
              </div>

              {receiptUrl && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">
                    Receipt
                  </label>
                  <img
                    src={receiptUrl}
                    alt="Receipt"
                    className="w-full rounded-lg border max-h-96 object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
