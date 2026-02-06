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
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Search } from "lucide-react";

interface JobGroup {
  job_no: string;
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
  const [isPaginating, setIsPaginating] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<Receipt | null>(null);

  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [userExpenses, setUserExpenses] = useState<UserExpense[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;

  // Get current view state from URL
  const selectedJobNo = searchParams.get("job") || "";
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
      fetchUserExpenses(selectedJobNo);
    } else if (viewLevel === "receipts" && selectedUserId && selectedJobNo) {
      fetchReceipts(selectedUserId);
    }
  }, [viewLevel, selectedJobNo, selectedUserId, currentPage]);

  const fetchJobGroups = async () => {
    const isInitialLoad = jobGroups.length === 0;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setIsPaginating(true);
    }
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
        }/functions/v1/admin-receipts?action=job-groups&page=${currentPage}&limit=${itemsPerPage}`,
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
        throw new Error(errorData.error || "Failed to fetch job groups");
      }

      const { jobGroups, pagination } = await response.json();
      setJobGroups(jobGroups);
      setTotalPages(pagination.totalPages);
      setTotalCount(pagination.totalCount);
    } catch (err) {
      console.error("Error fetching job groups:", err);
    } finally {
      setLoading(false);
      setIsPaginating(false);
    }
  };

  const handleJobDoubleClick = (jobNo: string) => {
    setCurrentPage(1);
    setSearchQuery("");
    setSearchParams({ job: jobNo });
  };

  const fetchUserExpenses = async (jobNo: string) => {
    const isInitialLoad = userExpenses.length === 0;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setIsPaginating(true);
    }

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
        }/functions/v1/admin-receipts?action=user-expenses&jobNo=${jobNo}&page=${currentPage}&limit=${itemsPerPage}`,
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
        throw new Error(errorData.error || "Failed to fetch user expenses");
      }

      const { userExpenses, pagination } = await response.json();
      setUserExpenses(userExpenses);
      setTotalPages(pagination.totalPages);
      setTotalCount(pagination.totalCount);
    } catch (err) {
      console.error("Error in fetchUserExpenses:", err);
    } finally {
      setLoading(false);
      setIsPaginating(false);
    }
  };

  const handleUserDoubleClick = (userId: string, userName: string | null) => {
    setCurrentPage(1);
    setSearchQuery("");
    setSearchParams({
      job: selectedJobNo,
      user: userId,
      userName: userName || "Unknown User",
    });
  };

  const fetchReceipts = async (userId: string) => {
    const isInitialLoad = receipts.length === 0;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setIsPaginating(true);
    }

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
        }/functions/v1/admin-receipts?action=receipts&userId=${userId}&jobNo=${selectedJobNo}&page=${currentPage}&limit=${itemsPerPage}`,
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
        throw new Error(errorData.error || "Failed to fetch receipts");
      }

      const { receipts, pagination } = await response.json();
      setReceipts(receipts);
      setTotalPages(pagination.totalPages);
      setTotalCount(pagination.totalCount);
    } catch (err) {
      console.error("Error fetching receipts:", err);
    } finally {
      setLoading(false);
      setIsPaginating(false);
    }
  };

  const handleBack = () => {
    setSearchQuery("");
    if (viewLevel === "receipts") {
      setSearchParams({ job: selectedJobNo });
      setReceipts([]);
      setCurrentPage(1);
    } else if (viewLevel === "users") {
      setSearchParams({});
      setUserExpenses([]);
      setCurrentPage(1);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Filter data by search query
  const filteredJobGroups = searchQuery
    ? jobGroups.filter((g) =>
        g.job_no.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : jobGroups;

  const filteredUserExpenses = searchQuery
    ? userExpenses.filter((u) =>
        (u.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase())
      )
    : userExpenses;

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
          {viewLevel === "jobs" && "Receipts by Job Number"}
          {viewLevel === "users" && `Users for Job ${selectedJobNo}`}
          {viewLevel === "receipts" &&
            `Receipts for ${selectedUserName} - Job ${selectedJobNo}`}
        </h2>
        <div className="flex items-center gap-2">
          {viewLevel !== "receipts" && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={
                  viewLevel === "jobs" ? "Search job numbers..." : "Search users..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-[250px]"
              />
            </div>
          )}
          {viewLevel !== "jobs" && (
            <Button onClick={handleBack} variant="outline" size="sm">
              Back
            </Button>
          )}
        </div>
      </div>

      {viewLevel === "jobs" && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Number</TableHead>
                <TableHead>Expenses</TableHead>
                <TableHead>Users</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobGroups.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    {searchQuery ? "No jobs match your search" : "No receipts found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobGroups.map((group, index) => (
                  <TableRow
                    key={`${group.job_no}-${index}`}
                    onDoubleClick={() => handleJobDoubleClick(group.job_no)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
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
                {filteredUserExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      {searchQuery ? "No users match your search" : "No users found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUserExpenses.map((user) => (
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount}{" "}
            items
          </p>
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isPaginating}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-3">
              {isPaginating ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <>
                  Page {currentPage} of {totalPages}
                </>
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isPaginating}
            >
              Next
            </Button>
          </div>
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
