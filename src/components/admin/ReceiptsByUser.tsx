import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import supabase from "../../lib/supabase";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Spinner } from "../ui/spinner";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import type { Tables } from "../../lib/database.types";
import * as XLSX from "xlsx-js-style";

type Expense = Tables<"expense">;

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

interface Receipt {
  id: string;
  path: string;
  url: string;
  created_at: string;
  expense_id: string;
}

interface ExpenseWithReceipts extends Expense {
  receipts: Receipt[];
}

type ViewLevel = "users" | "months" | "expenses";

export function ReceiptsByUser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>("");

  // Data states
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithReceipts[]>([]);
  const [fullScreenImage, setFullScreenImage] = useState<Receipt | null>(null);

  // Get current view state from URL
  const selectedUserId = searchParams.get("userId") || "";
  const selectedUserName = searchParams.get("userName") || "";
  const selectedMonth = searchParams.get("month") || "";

  const viewLevel: ViewLevel = selectedMonth
    ? "expenses"
    : selectedUserId
      ? "months"
      : "users";

  useEffect(() => {
    if (viewLevel === "users") {
      fetchUsers();
    } else if (viewLevel === "months" && selectedUserId) {
      fetchMonths(selectedUserId);
    } else if (viewLevel === "expenses" && selectedUserId && selectedMonth) {
      fetchExpenses(selectedUserId, selectedMonth);
    }
  }, [viewLevel, selectedUserId, selectedMonth]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(
        `${
          import.meta.env.VITE_SUPABASE_URL
        }/functions/v1/user-receipts?action=users`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch users: ${errorText}`);
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const fetchMonths = async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(
        `${
          import.meta.env.VITE_SUPABASE_URL
        }/functions/v1/user-receipts?action=months&userId=${encodeURIComponent(
          userId,
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch months: ${errorText}`);
      }

      const data = await response.json();
      setMonths(data.months || []);
    } catch (err) {
      console.error("Error fetching months:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch months");
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async (userId: string, month: string) => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(
        `${
          import.meta.env.VITE_SUPABASE_URL
        }/functions/v1/user-receipts?action=expenses&userId=${encodeURIComponent(
          userId,
        )}&month=${encodeURIComponent(month)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch expenses: ${errorText}`);
      }

      const data = await response.json();
      setExpenses(data.expenses || []);
    } catch (err) {
      console.error("Error fetching expenses:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch expenses");
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = (user: UserSummary) => {
    setSearchParams({
      userId: user.user_id,
      userName: user.full_name || user.email,
    });
  };

  const handleMonthClick = (month: MonthSummary) => {
    setSearchParams({
      userId: selectedUserId,
      userName: selectedUserName,
      month: month.month,
    });
  };

  const handleBack = () => {
    if (viewLevel === "expenses") {
      // Go back to months
      setSearchParams({
        userId: selectedUserId,
        userName: selectedUserName,
      });
    } else if (viewLevel === "months") {
      // Go back to users
      setSearchParams({});
    }
  };

  const formatMonthDisplay = (monthString: string) => {
    const [year, month] = monthString.split("-").map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "$0.00";
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  const calculateTotal = (expense: Expense) => {
    return (expense.food || 0) + (expense.taxi || 0) + (expense.others || 0);
  };

  const handleExportToExcel = () => {
    if (expenses.length === 0) {
      setError("No expenses to export");
      return;
    }

    const wb = XLSX.utils.book_new();

    // Create data array with proper structure
    const data: any[][] = [];

    // Row 1: Empty
    data.push([]);

    // Row 2: Title (will be merged B2:H2)
    data.push(["", "Amplitude Event Services FZE LLC", "", "", "", "", "", ""]);

    // Row 3: Subtitle (will be merged B3:H3)
    data.push(["", "Internal Expense Claim", "", "", "", "", "", ""]);

    // Row 4: Empty
    data.push([]);

    // Row 5: Name and Month fields
    const monthDisplay = formatMonthDisplay(selectedMonth);
    data.push([
      "",
      "Name",
      selectedUserName || "",
      "",
      "",
      "Month",
      monthDisplay,
      "",
    ]);

    // Row 6: Empty
    data.push([]);

    // Row 7: Headers
    data.push([
      "",
      "Date",
      "Job No",
      "Details",
      "Taxi",
      "Food",
      "Others",
      "Amount",
    ]);

    // Rows 8+: Data
    expenses.forEach((expense) => {
      // Format date to only show YYYY-MM-DD without time
      const dateOnly = expense.date ? expense.date.split("T")[0] : "";

      data.push([
        "",
        dateOnly,
        expense.job_no,
        expense.details,
        expense.taxi || 0,
        expense.food || 0,
        expense.others || 0,
        (expense.taxi || 0) + (expense.food || 0) + (expense.others || 0),
      ]);
    });

    // Calculate totals
    const totalTaxi = expenses.reduce((sum, e) => sum + (e.taxi || 0), 0);
    const totalFood = expenses.reduce((sum, e) => sum + (e.food || 0), 0);
    const totalOthers = expenses.reduce((sum, e) => sum + (e.others || 0), 0);
    const grandTotal = totalTaxi + totalFood + totalOthers;

    // Totals row
    data.push([
      "",
      "",
      "",
      "Total",
      totalTaxi,
      totalFood,
      totalOthers,
      grandTotal,
    ]);

    // Empty row
    data.push([]);

    // Approved for payment
    data.push(["", "Approved for payment", "", "", "", "", "", ""]);

    // Create worksheet from array
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws["!cols"] = [
      { wch: 2 }, // Column A (empty)
      { wch: 12 }, // B - Date
      { wch: 12 }, // C - Job No
      { wch: 35 }, // D - Details
      { wch: 10 }, // E - Taxi
      { wch: 10 }, // F - Food
      { wch: 10 }, // G - Others
      { wch: 12 }, // H - Amount
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");

    // Generate filename
    const filename = `${selectedUserName}_${monthDisplay.replace(" ", "_")}_Expenses.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
  };

  const handleGeneratePDF = async () => {
    if (expenses.length === 0) {
      setError("No expenses to generate PDF");
      return;
    }

    setPdfGenerating(true);
    setPdfProgress("Preparing data...");
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("No active session");
        setPdfGenerating(false);
        return;
      }

      // Call admin Lambda function directly
      setPdfProgress("Generating PDF...");

      const requestBody = {
        expenses: expenses,
        selectedMonth: formatMonthDisplay(selectedMonth),
        userName: selectedUserName || null,
        userId: selectedUserId,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        userToken: session.access_token,
      };

      console.log("Calling Lambda with:", {
        url: import.meta.env.VITE_LAMBDA_ADMIN_PDF_URL,
        expenseCount: expenses.length,
        userName: selectedUserName,
        userId: selectedUserId,
      });

      const response = await fetch(import.meta.env.VITE_LAMBDA_ADMIN_PDF_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Lambda error response:", response.status, errorData);
        setError(
          `Failed to generate PDF: ${errorData.error || response.statusText}`,
        );
        setPdfGenerating(false);
        return;
      }

      const data = await response.json();
      console.log("PDF generation response:", data);

      if (!data || !data.downloadUrl) {
        setError("No PDF download URL received from server");
        setPdfGenerating(false);
        return;
      }

      // For mobile, fetch the PDF and create a blob URL for better compatibility
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(
        navigator.userAgent,
      );

      if (isMobileDevice) {
        try {
          console.log("Mobile detected - fetching PDF from:", data.downloadUrl);

          setPdfProgress("Downloading PDF...");
          // Fetch the PDF from S3
          const pdfResponse = await fetch(data.downloadUrl);
          console.log(
            "PDF fetch response:",
            pdfResponse.status,
            pdfResponse.statusText,
          );

          if (!pdfResponse.ok) {
            setError(`Failed to download PDF: ${pdfResponse.statusText}`);
            setPdfGenerating(false);
            return;
          }

          const blob = await pdfResponse.blob();
          console.log("PDF blob size:", blob.size, "bytes, type:", blob.type);

          setPdfProgress("Opening PDF...");
          const blobUrl = window.URL.createObjectURL(blob);

          // Try to open in new window first (works better on mobile)
          const newWindow = window.open(blobUrl, "_blank");

          // Fallback to download if popup was blocked
          if (!newWindow || newWindow.closed) {
            console.log("Popup blocked, using download fallback");
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = data.filename || "receipts.pdf";
            link.style.display = "none";
            document.body.appendChild(link);

            // Trigger download with a slight delay for mobile compatibility
            setTimeout(() => {
              link.click();
              document.body.removeChild(link);
              setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
            }, 100);
          }
        } catch (mobileError) {
          console.error("Mobile PDF download error:", mobileError);
          setError(
            `Mobile download failed: ${
              mobileError instanceof Error
                ? mobileError.message
                : "Unknown error"
            }`,
          );
          setPdfGenerating(false);
          return;
        }
      } else {
        // Desktop: Direct link download
        const link = document.createElement("a");
        link.href = data.downloadUrl;
        link.download = data.filename || "receipts.pdf";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setError(null);
      setPdfGenerating(false);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError(
        `Failed to generate PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      setPdfGenerating(false);
    }
  };

  const downloadReceipt = async (receipt: Receipt) => {
    try {
      const response = await fetch(receipt.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = receipt.path.split("/").pop() || "receipt";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error downloading receipt:", err);
    }
  };

  const renderBreadcrumb = () => {
    if (viewLevel === "users") return null;

    return (
      <div className="mb-6 flex items-center gap-2">
        <Button onClick={handleBack} variant="ghost" size="sm">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="text-sm text-muted-foreground">
          {viewLevel === "months" && (
            <span>
              Users / <span className="font-medium">{selectedUserName}</span>
            </span>
          )}
          {viewLevel === "expenses" && (
            <span>
              Users / {selectedUserName} /{" "}
              <span className="font-medium">
                {formatMonthDisplay(selectedMonth)}
              </span>
            </span>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receipts by User</h1>
        <p className="text-muted-foreground mt-2">
          {viewLevel === "users" &&
            "Select a user to view their reimbursement months"}
          {viewLevel === "months" && "Select a month to view expenses"}
          {viewLevel === "expenses" && "View all expenses and receipts"}
        </p>
      </div>

      {renderBreadcrumb()}

      {/* Users Table */}
      {viewLevel === "users" && (
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Total Expenses</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      No users with expenses found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow
                      key={user.user_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleUserClick(user)}
                    >
                      <TableCell className="font-medium">
                        {user.full_name || "N/A"}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell className="text-right">
                        {user.total_expenses}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(user.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Months Table */}
      {viewLevel === "months" && (
        <Card>
          <CardHeader>
            <CardTitle>
              Months with Reimbursements - {selectedUserName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      No expenses found for this user
                    </TableCell>
                  </TableRow>
                ) : (
                  months.map((month) => (
                    <TableRow
                      key={month.month}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleMonthClick(month)}
                    >
                      <TableCell className="font-medium">
                        {formatMonthDisplay(month.month)}
                      </TableCell>
                      <TableCell className="text-right">
                        {month.expense_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(month.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Expenses Table */}
      {viewLevel === "expenses" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Expenses - {selectedUserName} -{" "}
                {formatMonthDisplay(selectedMonth)}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportToExcel}
                  variant="outline"
                  size="sm"
                  disabled={pdfGenerating}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button
                  onClick={handleGeneratePDF}
                  variant="outline"
                  size="sm"
                  disabled={pdfGenerating}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {pdfGenerating ? pdfProgress : "PDF"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Job No</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Food</TableHead>
                  <TableHead className="text-right">Taxi</TableHead>
                  <TableHead className="text-right">Others</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Receipts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground"
                    >
                      No expenses found
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{formatDate(expense.date)}</TableCell>
                      <TableCell className="font-medium">
                        {expense.job_no}
                      </TableCell>
                      <TableCell>{expense.details}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(expense.food)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(expense.taxi)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(expense.others)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(calculateTotal(expense))}
                      </TableCell>
                      <TableCell>
                        {expense.receipts.length > 0 ? (
                          <div className="flex gap-2">
                            {expense.receipts.map((receipt) => (
                              <div key={receipt.id} className="relative group">
                                <img
                                  src={receipt.url}
                                  alt="Receipt"
                                  className="h-12 w-12 object-cover rounded cursor-pointer border"
                                  onClick={() => setFullScreenImage(receipt)}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadReceipt(receipt);
                                  }}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            No receipts
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Full Screen Image Dialog */}
      {fullScreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullScreenImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh]">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 text-white hover:bg-white/20"
              onClick={() => setFullScreenImage(null)}
            >
              ✕
            </Button>
            <img
              src={fullScreenImage.url}
              alt="Receipt"
              className="max-w-full max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
