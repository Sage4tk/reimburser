import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import supabase from "../lib/supabase";
import type { Tables, TablesInsert } from "../lib/database.types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import { Spinner } from "./ui/spinner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useIsMobile } from "../hooks/use-mobile";
import { z } from "zod";

type Expense = Tables<"expense">;

// Zod validation schema
const expenseSchema = z.object({
  job_no: z
    .string()
    .min(1, "Job number is required")
    .max(100, "Job number is too long"),
  date: z.string().min(1, "Date is required"),
  details: z
    .string()
    .min(1, "Details are required")
    .max(500, "Details are too long"),
  food: z
    .number()
    .min(0, "Food amount must be 0 or greater")
    .max(999999, "Amount is too large"),
  taxi: z
    .number()
    .min(0, "Taxi amount must be 0 or greater")
    .max(999999, "Amount is too large"),
  others: z
    .number()
    .min(0, "Others amount must be 0 or greater")
    .max(999999, "Amount is too large"),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface FormErrors {
  job_no?: string;
  date?: string;
  details?: string;
  food?: string;
  taxi?: string;
  others?: string;
}

export function ExpenseTable() {
  const { user } = useAuthStore();
  const isMobile = useIsMobile();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState<ExpenseFormData>({
    job_no: "",
    date: new Date().toISOString().split("T")[0],
    details: "",
    food: 0,
    taxi: 0,
    others: 0,
  });
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptPreviews, setReceiptPreviews] = useState<string[]>([]);
  const [existingReceipts, setExistingReceipts] = useState<
    Array<{ id: string; path: string; url: string }>
  >([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Get current month in YYYY-MM format
  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  };

  // Get month range from YYYY-MM string
  const getMonthRange = (monthString: string) => {
    const [year, month] = monthString.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    return {
      start: firstDay.toISOString().split("T")[0],
      end: lastDay.toISOString().split("T")[0],
    };
  };

  // Format month string for display
  const formatMonthDisplay = (monthString: string) => {
    const [year, month] = monthString.split("-").map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  // Fetch available months with expenses
  const fetchAvailableMonths = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("expense")
      .select("date")
      .eq("user_id", user.id)
      .not("date", "is", null)
      .order("date", { ascending: false });

    if (!error && data) {
      // Extract unique months from dates
      const months = new Set<string>();
      data.forEach((expense) => {
        if (expense.date) {
          const date = new Date(expense.date);
          const monthKey = `${date.getFullYear()}-${String(
            date.getMonth() + 1
          ).padStart(2, "0")}`;
          months.add(monthKey);
        }
      });

      const sortedMonths = Array.from(months).sort().reverse();
      setAvailableMonths(sortedMonths);

      // Set current month as selected if available, otherwise use the most recent
      const currentMonth = getCurrentMonth();
      if (sortedMonths.includes(currentMonth)) {
        setSelectedMonth(currentMonth);
      } else if (sortedMonths.length > 0) {
        setSelectedMonth(sortedMonths[0]);
      } else {
        setSelectedMonth(currentMonth);
      }
    }
  };

  const fetchExpenses = async () => {
    if (!user || !selectedMonth) return;

    setLoading(true);
    setError(null);

    const { start, end } = getMonthRange(selectedMonth);

    const { data, error } = await supabase
      .from("expense")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setExpenses(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchAvailableMonths();
    }
  }, [user]);

  useEffect(() => {
    if (selectedMonth) {
      fetchExpenses();
    }
  }, [user, selectedMonth]);

  const resetForm = () => {
    setFormData({
      job_no: "",
      date: new Date().toISOString().split("T")[0],
      details: "",
      food: 0,
      taxi: 0,
      others: 0,
    });
    setFormErrors({});
    setReceiptFiles([]);
    setReceiptPreviews([]);
    setExistingReceipts([]);
  };

  // Handle file selection (multiple files)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    const validFiles: File[] = [];

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image file`);
        continue;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name} is too large (max 5MB)`);
        continue;
      }

      validFiles.push(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }

    if (validFiles.length > 0) {
      setReceiptFiles((prev) => [...prev, ...validFiles]);
      setError(null);
    }
  };

  // Remove selected file by index
  const handleRemoveFile = (index: number) => {
    setReceiptFiles((prev) => prev.filter((_, i) => i !== index));
    setReceiptPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Fetch receipts for an expense
  const fetchReceipts = async (expenseId: string) => {
    const { data, error } = await supabase
      .from("receipt")
      .select("*")
      .eq("expense_id", expenseId);

    if (error) {
      console.error("Error fetching receipts:", error);
      return;
    }

    if (data) {
      // Get signed URLs for the receipts (valid for 1 hour)
      const receiptsWithUrls = await Promise.all(
        data.map(async (receipt) => {
          const { data: urlData } = await supabase.storage
            .from("receipts")
            .createSignedUrl(receipt.path, 3600); // 3600 seconds = 1 hour
          return {
            id: receipt.id,
            path: receipt.path,
            url: urlData?.signedUrl || "",
          };
        })
      );

      setExistingReceipts(receiptsWithUrls);
    }
  };

  // Upload receipt to storage and create database record
  const uploadReceipt = async (expenseId: string, file: File) => {
    if (!user) return false;

    setUploadingReceipt(true);
    try {
      // Create unique filename with user ID as top level
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${expenseId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      // Create receipt record in database
      const { error: dbError } = await supabase.from("receipt").insert({
        expense_id: expenseId,
        path: fileName,
      });

      if (dbError) {
        // If database insert fails, try to delete the uploaded file
        await supabase.storage.from("receipts").remove([fileName]);
        throw dbError;
      }

      return true;
    } catch (err) {
      console.error("Error uploading receipt:", err);
      setError(err instanceof Error ? err.message : "Failed to upload receipt");
      return false;
    } finally {
      setUploadingReceipt(false);
    }
  };

  // Delete a receipt
  const handleDeleteReceipt = async (
    receiptId: string,
    receiptPath: string
  ) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("receipts")
        .remove([receiptPath]);

      if (storageError) {
        throw storageError;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("receipt")
        .delete()
        .eq("id", receiptId);

      if (dbError) {
        throw dbError;
      }

      // Update local state
      setExistingReceipts(
        existingReceipts.filter((receipt) => receipt.id !== receiptId)
      );
    } catch (err) {
      console.error("Error deleting receipt:", err);
      setError(err instanceof Error ? err.message : "Failed to delete receipt");
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setFormErrors({});

    // Validate form data with Zod
    const validation = expenseSchema.safeParse(formData);

    if (!validation.success) {
      const errors: FormErrors = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0] as keyof FormErrors] = issue.message;
        }
      });
      setFormErrors(errors);
      return;
    }

    const newExpense: TablesInsert<"expense"> = {
      ...formData,
      user_id: user.id,
      food: formData.food || null,
      taxi: formData.taxi || null,
      others: formData.others || null,
    };

    const { data, error } = await supabase
      .from("expense")
      .insert(newExpense)
      .select()
      .single();

    if (error) {
      setError(error.message);
    } else {
      // Upload receipts if any were selected
      if (receiptFiles.length > 0 && data) {
        for (const file of receiptFiles) {
          await uploadReceipt(data.id, file);
        }
      }

      setIsAddDialogOpen(false);
      resetForm();
      fetchAvailableMonths();
      fetchExpenses();
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    setError(null);
    setFormErrors({});

    // Validate form data with Zod
    const validation = expenseSchema.safeParse(formData);

    if (!validation.success) {
      const errors: FormErrors = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0] as keyof FormErrors] = issue.message;
        }
      });
      setFormErrors(errors);
      return;
    }

    const { error } = await supabase
      .from("expense")
      .update({
        job_no: formData.job_no,
        date: formData.date,
        details: formData.details,
        food: formData.food || null,
        taxi: formData.taxi || null,
        others: formData.others || null,
      })
      .eq("id", editingExpense.id);

    if (error) {
      setError(error.message);
    } else {
      // Upload receipts if any were selected
      if (receiptFiles.length > 0 && editingExpense) {
        for (const file of receiptFiles) {
          await uploadReceipt(editingExpense.id, file);
        }
      }

      setIsEditDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      fetchAvailableMonths();
      fetchExpenses();
    }
  };

  const handleDelete = async () => {
    if (!deleteExpenseId) return;

    setError(null);

    // First, fetch and delete all receipts associated with this expense
    const { data: receipts } = await supabase
      .from("receipt")
      .select("*")
      .eq("expense_id", deleteExpenseId);

    if (receipts && receipts.length > 0) {
      // Delete files from storage
      const filePaths = receipts.map((r) => r.path);
      await supabase.storage.from("receipts").remove(filePaths);

      // Delete receipt records
      await supabase.from("receipt").delete().eq("expense_id", deleteExpenseId);
    }

    // Delete the expense
    const { error } = await supabase
      .from("expense")
      .delete()
      .eq("id", deleteExpenseId);

    if (error) {
      setError(error.message);
    } else {
      setDeleteExpenseId(null);
      fetchAvailableMonths();
      fetchExpenses();
    }
  };

  const openEditDialog = async (expense: Expense) => {
    setEditingExpense(expense);

    // Ensure date is in YYYY-MM-DD format for the input field
    let formattedDate = new Date().toISOString().split("T")[0];
    if (expense.date) {
      // Handle both YYYY-MM-DD and full ISO date formats
      formattedDate = expense.date.split("T")[0];
    }

    setFormData({
      job_no: expense.job_no,
      date: formattedDate,
      details: expense.details,
      food: expense.food || 0,
      taxi: expense.taxi || 0,
      others: expense.others || 0,
    });
    // Fetch existing receipts for this expense
    await fetchReceipts(expense.id);
    setIsEditDialogOpen(true);
  };

  const getTotalExpense = (expense: Expense) => {
    return (expense.food || 0) + (expense.taxi || 0) + (expense.others || 0);
  };

  const getMonthTotal = () => {
    return expenses.reduce((sum, expense) => sum + getTotalExpense(expense), 0);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 w-full sm:w-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-2">
              <CardTitle className="text-xl sm:text-2xl">Expenses</CardTitle>
              {availableMonths.length > 0 && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonths.map((month) => (
                      <SelectItem key={month} value={month}>
                        {formatMonthDisplay(month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <CardDescription className="text-sm">
              {availableMonths.length > 0
                ? "View and manage your expenses"
                : "Add your first expense to get started"}
            </CardDescription>
          </div>

          {/* Add Button with Drawer for Mobile, Dialog for Desktop */}
          {isMobile ? (
            <Drawer open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DrawerTrigger asChild>
                <Button onClick={resetForm} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <form onSubmit={handleAdd} className="px-4">
                  <DrawerHeader>
                    <DrawerTitle>Add New Expense</DrawerTitle>
                    <DrawerDescription>
                      Enter the details of your expense
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                    <div className="grid gap-2">
                      <Label htmlFor="job_no">Job Number</Label>
                      <Input
                        id="job_no"
                        value={formData.job_no}
                        onChange={(e) => {
                          setFormData({ ...formData, job_no: e.target.value });
                          if (formErrors.job_no) {
                            setFormErrors({ ...formErrors, job_no: undefined });
                          }
                        }}
                        required
                      />
                      {formErrors.job_no && (
                        <p className="text-sm text-red-500">
                          {formErrors.job_no}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => {
                          setFormData({ ...formData, date: e.target.value });
                          if (formErrors.date) {
                            setFormErrors({ ...formErrors, date: undefined });
                          }
                        }}
                        required
                      />
                      {formErrors.date && (
                        <p className="text-sm text-red-500">
                          {formErrors.date}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="details">Details</Label>
                      <Input
                        id="details"
                        value={formData.details}
                        onChange={(e) => {
                          setFormData({ ...formData, details: e.target.value });
                          if (formErrors.details) {
                            setFormErrors({
                              ...formErrors,
                              details: undefined,
                            });
                          }
                        }}
                        required
                      />
                      {formErrors.details && (
                        <p className="text-sm text-red-500">
                          {formErrors.details}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="food">Food ($)</Label>
                        <Input
                          id="food"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.food === 0 ? "" : formData.food}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              food: value === "" ? 0 : parseFloat(value),
                            });
                            if (formErrors.food) {
                              setFormErrors({ ...formErrors, food: undefined });
                            }
                          }}
                        />
                        {formErrors.food && (
                          <p className="text-sm text-red-500">
                            {formErrors.food}
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="taxi">Taxi ($)</Label>
                        <Input
                          id="taxi"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.taxi === 0 ? "" : formData.taxi}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              taxi: value === "" ? 0 : parseFloat(value),
                            });
                            if (formErrors.taxi) {
                              setFormErrors({ ...formErrors, taxi: undefined });
                            }
                          }}
                        />
                        {formErrors.taxi && (
                          <p className="text-sm text-red-500">
                            {formErrors.taxi}
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="others">Others ($)</Label>
                        <Input
                          id="others"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.others === 0 ? "" : formData.others}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              others: value === "" ? 0 : parseFloat(value),
                            });
                            if (formErrors.others) {
                              setFormErrors({
                                ...formErrors,
                                others: undefined,
                              });
                            }
                          }}
                        />
                        {formErrors.others && (
                          <p className="text-sm text-red-500">
                            {formErrors.others}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Receipt Upload Section */}
                    <div className="grid gap-2">
                      <Label htmlFor="receipt">Receipts (Optional)</Label>
                      <Input
                        id="receipt"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="cursor-pointer"
                      />
                      {receiptPreviews.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {receiptPreviews.map((preview, index) => (
                            <div key={index} className="relative">
                              <img
                                src={preview}
                                alt={`Receipt preview ${index + 1}`}
                                className="h-24 w-full rounded border object-cover"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => handleRemoveFile(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG up to 5MB each. Select multiple files.
                      </p>
                    </div>
                  </div>
                  <DrawerFooter>
                    <Button type="submit" disabled={uploadingReceipt}>
                      {uploadingReceipt ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Uploading...
                        </>
                      ) : (
                        "Add Expense"
                      )}
                    </Button>
                    <DrawerClose asChild>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </DrawerClose>
                  </DrawerFooter>
                </form>
              </DrawerContent>
            </Drawer>
          ) : (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleAdd}>
                  <DialogHeader>
                    <DialogTitle>Add New Expense</DialogTitle>
                    <DialogDescription>
                      Enter the details of your expense
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="dialog_job_no">Job Number</Label>
                      <Input
                        id="dialog_job_no"
                        value={formData.job_no}
                        onChange={(e) => {
                          setFormData({ ...formData, job_no: e.target.value });
                          if (formErrors.job_no) {
                            setFormErrors({ ...formErrors, job_no: undefined });
                          }
                        }}
                        required
                      />
                      {formErrors.job_no && (
                        <p className="text-sm text-red-500">
                          {formErrors.job_no}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dialog_date">Date</Label>
                      <Input
                        id="dialog_date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => {
                          setFormData({ ...formData, date: e.target.value });
                          if (formErrors.date) {
                            setFormErrors({ ...formErrors, date: undefined });
                          }
                        }}
                        required
                      />
                      {formErrors.date && (
                        <p className="text-sm text-red-500">
                          {formErrors.date}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dialog_details">Details</Label>
                      <Input
                        id="dialog_details"
                        value={formData.details}
                        onChange={(e) => {
                          setFormData({ ...formData, details: e.target.value });
                          if (formErrors.details) {
                            setFormErrors({
                              ...formErrors,
                              details: undefined,
                            });
                          }
                        }}
                        required
                      />
                      {formErrors.details && (
                        <p className="text-sm text-red-500">
                          {formErrors.details}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="dialog_food">Food ($)</Label>
                        <Input
                          id="dialog_food"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.food === 0 ? "" : formData.food}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              food: value === "" ? 0 : parseFloat(value),
                            });
                            if (formErrors.food) {
                              setFormErrors({ ...formErrors, food: undefined });
                            }
                          }}
                        />
                        {formErrors.food && (
                          <p className="text-sm text-red-500">
                            {formErrors.food}
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="dialog_taxi">Taxi ($)</Label>
                        <Input
                          id="dialog_taxi"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.taxi === 0 ? "" : formData.taxi}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              taxi: value === "" ? 0 : parseFloat(value),
                            });
                            if (formErrors.taxi) {
                              setFormErrors({ ...formErrors, taxi: undefined });
                            }
                          }}
                        />
                        {formErrors.taxi && (
                          <p className="text-sm text-red-500">
                            {formErrors.taxi}
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="dialog_others">Others ($)</Label>
                        <Input
                          id="dialog_others"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.others === 0 ? "" : formData.others}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData({
                              ...formData,
                              others: value === "" ? 0 : parseFloat(value),
                            });
                            if (formErrors.others) {
                              setFormErrors({
                                ...formErrors,
                                others: undefined,
                              });
                            }
                          }}
                        />
                        {formErrors.others && (
                          <p className="text-sm text-red-500">
                            {formErrors.others}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Receipt Upload Section */}
                    <div className="grid gap-2">
                      <Label htmlFor="dialog_receipt">
                        Receipts (Optional)
                      </Label>
                      <Input
                        id="dialog_receipt"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="cursor-pointer"
                      />
                      {receiptPreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {receiptPreviews.map((preview, index) => (
                            <div key={index} className="relative">
                              <img
                                src={preview}
                                alt={`Receipt preview ${index + 1}`}
                                className="h-24 w-full rounded border object-cover"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => handleRemoveFile(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG up to 5MB each. Select multiple files.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={uploadingReceipt}>
                      {uploadingReceipt ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Uploading...
                        </>
                      ) : (
                        "Add Expense"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No expenses for this month. Add your first expense to get started.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Job No.</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Food</TableHead>
                    <TableHead className="text-right">Taxi</TableHead>
                    <TableHead className="text-right">Others</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        {expense.date
                          ? new Date(expense.date).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>{expense.job_no}</TableCell>
                      <TableCell>{expense.details}</TableCell>
                      <TableCell className="text-right">
                        ${(expense.food || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(expense.taxi || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(expense.others || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${getTotalExpense(expense).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(expense)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteExpenseId(expense.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {expenses.map((expense) => (
                <Card key={expense.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-semibold">{expense.job_no}</div>
                        <div className="text-sm text-muted-foreground">
                          {expense.date
                            ? new Date(expense.date).toLocaleDateString()
                            : "-"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(expense)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteExpenseId(expense.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm">{expense.details}</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">
                          Food
                        </div>
                        <div className="font-medium">
                          ${(expense.food || 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">
                          Taxi
                        </div>
                        <div className="font-medium">
                          ${(expense.taxi || 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">
                          Others
                        </div>
                        <div className="font-medium">
                          ${(expense.others || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Total
                      </span>
                      <span className="font-bold text-lg">
                        ${getTotalExpense(expense).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <div className="text-lg font-bold">
                Month Total: ${getMonthTotal().toFixed(2)}
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Edit Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DrawerContent>
            <form onSubmit={handleEdit} className="px-4">
              <DrawerHeader>
                <DrawerTitle>Edit Expense</DrawerTitle>
                <DrawerDescription>
                  Update the details of your expense
                </DrawerDescription>
              </DrawerHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                <div className="grid gap-2">
                  <Label htmlFor="edit_job_no">Job Number</Label>
                  <Input
                    id="edit_job_no"
                    value={formData.job_no}
                    onChange={(e) => {
                      setFormData({ ...formData, job_no: e.target.value });
                      if (formErrors.job_no) {
                        setFormErrors({ ...formErrors, job_no: undefined });
                      }
                    }}
                    required
                  />
                  {formErrors.job_no && (
                    <p className="text-sm text-red-500">{formErrors.job_no}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit_date">Date</Label>
                  <Input
                    id="edit_date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      setFormData({ ...formData, date: e.target.value });
                      if (formErrors.date) {
                        setFormErrors({ ...formErrors, date: undefined });
                      }
                    }}
                    required
                  />
                  {formErrors.date && (
                    <p className="text-sm text-red-500">{formErrors.date}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit_details">Details</Label>
                  <Input
                    id="edit_details"
                    value={formData.details}
                    onChange={(e) => {
                      setFormData({ ...formData, details: e.target.value });
                      if (formErrors.details) {
                        setFormErrors({ ...formErrors, details: undefined });
                      }
                    }}
                    required
                  />
                  {formErrors.details && (
                    <p className="text-sm text-red-500">{formErrors.details}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit_food">Food ($)</Label>
                    <Input
                      id="edit_food"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.food === 0 ? "" : formData.food}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          food: value === "" ? 0 : parseFloat(value),
                        });
                        if (formErrors.food) {
                          setFormErrors({ ...formErrors, food: undefined });
                        }
                      }}
                    />
                    {formErrors.food && (
                      <p className="text-sm text-red-500">{formErrors.food}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_taxi">Taxi ($)</Label>
                    <Input
                      id="edit_taxi"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.taxi === 0 ? "" : formData.taxi}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          taxi: value === "" ? 0 : parseFloat(value),
                        });
                        if (formErrors.taxi) {
                          setFormErrors({ ...formErrors, taxi: undefined });
                        }
                      }}
                    />
                    {formErrors.taxi && (
                      <p className="text-sm text-red-500">{formErrors.taxi}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit_others">Others ($)</Label>
                    <Input
                      id="edit_others"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.others === 0 ? "" : formData.others}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          others: value === "" ? 0 : parseFloat(value),
                        });
                        if (formErrors.others) {
                          setFormErrors({ ...formErrors, others: undefined });
                        }
                      }}
                    />
                    {formErrors.others && (
                      <p className="text-sm text-red-500">
                        {formErrors.others}
                      </p>
                    )}
                  </div>
                </div>

                {/* Existing Receipts */}
                {existingReceipts.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Existing Receipts</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {existingReceipts.map((receipt) => (
                        <div key={receipt.id} className="relative">
                          <a
                            href={receipt.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={receipt.url}
                              alt="Receipt"
                              className="h-24 w-full rounded border object-cover"
                            />
                          </a>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1"
                            onClick={() =>
                              handleDeleteReceipt(receipt.id, receipt.path)
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload New Receipt */}
                <div className="grid gap-2">
                  <Label htmlFor="edit_receipt">Add Receipts (Optional)</Label>
                  <Input
                    id="edit_receipt"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                  />
                  {receiptPreviews.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {receiptPreviews.map((preview, index) => (
                        <div key={index} className="relative">
                          <img
                            src={preview}
                            alt={`Receipt preview ${index + 1}`}
                            className="h-24 w-full rounded border object-cover"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1"
                            onClick={() => handleRemoveFile(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG up to 5MB each. Select multiple files.
                  </p>
                </div>
              </div>
              <DrawerFooter>
                <Button type="submit" disabled={uploadingReceipt}>
                  {uploadingReceipt ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Uploading...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingExpense(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </form>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleEdit}>
              <DialogHeader>
                <DialogTitle>Edit Expense</DialogTitle>
                <DialogDescription>
                  Update the details of your expense
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="dialog_edit_job_no">Job Number</Label>
                  <Input
                    id="dialog_edit_job_no"
                    value={formData.job_no}
                    onChange={(e) => {
                      setFormData({ ...formData, job_no: e.target.value });
                      if (formErrors.job_no) {
                        setFormErrors({ ...formErrors, job_no: undefined });
                      }
                    }}
                    required
                  />
                  {formErrors.job_no && (
                    <p className="text-sm text-red-500">{formErrors.job_no}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dialog_edit_date">Date</Label>
                  <Input
                    id="dialog_edit_date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      setFormData({ ...formData, date: e.target.value });
                      if (formErrors.date) {
                        setFormErrors({ ...formErrors, date: undefined });
                      }
                    }}
                    required
                  />
                  {formErrors.date && (
                    <p className="text-sm text-red-500">{formErrors.date}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dialog_edit_details">Details</Label>
                  <Input
                    id="dialog_edit_details"
                    value={formData.details}
                    onChange={(e) => {
                      setFormData({ ...formData, details: e.target.value });
                      if (formErrors.details) {
                        setFormErrors({ ...formErrors, details: undefined });
                      }
                    }}
                    required
                  />
                  {formErrors.details && (
                    <p className="text-sm text-red-500">{formErrors.details}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dialog_edit_food">Food ($)</Label>
                    <Input
                      id="dialog_edit_food"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.food === 0 ? "" : formData.food}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          food: value === "" ? 0 : parseFloat(value),
                        });
                        if (formErrors.food) {
                          setFormErrors({ ...formErrors, food: undefined });
                        }
                      }}
                    />
                    {formErrors.food && (
                      <p className="text-sm text-red-500">{formErrors.food}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dialog_edit_taxi">Taxi ($)</Label>
                    <Input
                      id="dialog_edit_taxi"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.taxi === 0 ? "" : formData.taxi}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          taxi: value === "" ? 0 : parseFloat(value),
                        });
                        if (formErrors.taxi) {
                          setFormErrors({ ...formErrors, taxi: undefined });
                        }
                      }}
                    />
                    {formErrors.taxi && (
                      <p className="text-sm text-red-500">{formErrors.taxi}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dialog_edit_others">Others ($)</Label>
                    <Input
                      id="dialog_edit_others"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.others === 0 ? "" : formData.others}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          others: value === "" ? 0 : parseFloat(value),
                        });
                        if (formErrors.others) {
                          setFormErrors({ ...formErrors, others: undefined });
                        }
                      }}
                    />
                    {formErrors.others && (
                      <p className="text-sm text-red-500">
                        {formErrors.others}
                      </p>
                    )}
                  </div>
                </div>

                {/* Existing Receipts */}
                {existingReceipts.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Existing Receipts</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {existingReceipts.map((receipt) => (
                        <div key={receipt.id} className="relative">
                          <a
                            href={receipt.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={receipt.url}
                              alt="Receipt"
                              className="h-24 w-full rounded border object-cover"
                            />
                          </a>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1"
                            onClick={() =>
                              handleDeleteReceipt(receipt.id, receipt.path)
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload New Receipt */}
                <div className="grid gap-2">
                  <Label htmlFor="dialog_edit_receipt">
                    Add Receipts (Optional)
                  </Label>
                  <Input
                    id="dialog_edit_receipt"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                  />
                  {receiptPreviews.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {receiptPreviews.map((preview, index) => (
                        <div key={index} className="relative">
                          <img
                            src={preview}
                            alt={`Receipt preview ${index + 1}`}
                            className="h-24 w-full rounded border object-cover"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1"
                            onClick={() => handleRemoveFile(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG up to 5MB each. Select multiple files.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingExpense(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={uploadingReceipt}>
                  {uploadingReceipt ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Uploading...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteExpenseId !== null}
        onOpenChange={(open) => !open && setDeleteExpenseId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              expense record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
