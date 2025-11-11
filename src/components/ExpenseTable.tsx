import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import supabase from "../lib/supabase";
import type { Tables, TablesInsert } from "../lib/database.types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
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
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Download,
  FileText,
  Camera,
  Upload,
} from "lucide-react";
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
  const [isFabOpen, setIsFabOpen] = useState(false);
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

  // Export expenses to Excel
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
    data.push(["", "Name", "", "", "", "Month", "", ""]);

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

    // Define border style
    const thinBorder = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    };

    const mediumBorder = {
      top: { style: "medium", color: { rgb: "000000" } },
      bottom: { style: "medium", color: { rgb: "000000" } },
      left: { style: "medium", color: { rgb: "000000" } },
      right: { style: "medium", color: { rgb: "000000" } },
    };

    // Style Title (B2)
    const titleCell = "B2";
    ws[titleCell].s = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: mediumBorder.top,
        left: mediumBorder.left,
      },
    };

    // Apply thick border to merged title cells C2:H2
    ["C2", "D2", "E2", "F2", "G2", "H2"].forEach((cell) => {
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          top: mediumBorder.top,
          right: cell === "H2" ? mediumBorder.right : undefined,
        },
      };
    });

    // Style Subtitle (B3)
    ws["B3"].s = {
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        left: mediumBorder.left,
      },
    };
    ["C3", "D3", "E3", "F3", "G3", "H3"].forEach((cell) => {
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          right: cell === "H3" ? mediumBorder.right : undefined,
        },
      };
    });

    // Style empty Row 4 (B4:H4) - add side borders only
    ["B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
      const cell = `${col}4`;
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          left: col === "B" ? mediumBorder.left : undefined,
          right: col === "H" ? mediumBorder.right : undefined,
        },
      };
    });

    // Style Name and Month labels (B5, F5)
    ws["B5"].s = {
      font: { bold: true },
      border: {
        top: thinBorder.top,
        left: mediumBorder.left,
        bottom: thinBorder.bottom,
        right: thinBorder.right,
      },
    };

    // Add borders to Name input areas (C5, D5, E5)
    ["C5", "D5", "E5"].forEach((cell) => {
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          top: thinBorder.top,
          bottom: thinBorder.bottom,
          left: thinBorder.left,
          right: thinBorder.right,
        },
      };
    });

    // Style Month label and input
    ws["F5"].s = {
      font: { bold: true },
      border: {
        top: thinBorder.top,
        bottom: thinBorder.bottom,
        left: thinBorder.left,
        right: thinBorder.right,
      },
    };

    ["G5", "H5"].forEach((cell) => {
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          top: thinBorder.top,
          bottom: thinBorder.bottom,
          left: thinBorder.left,
          right: cell === "H5" ? mediumBorder.right : thinBorder.right,
        },
      };
    });

    // Style empty Row 6 (B6:H6) - add side borders only
    ["B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
      const cell = `${col}6`;
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          left: col === "B" ? mediumBorder.left : undefined,
          right: col === "H" ? mediumBorder.right : undefined,
        },
      };
    });

    // Style Headers (Row 7)
    ["B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
      const cell = `${col}7`;
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: thinBorder.top,
          bottom: thinBorder.bottom,
          left: col === "B" ? mediumBorder.left : thinBorder.left,
          right: col === "H" ? mediumBorder.right : thinBorder.right,
        },
      };
    });

    // Style data rows with borders
    const firstDataRow = 7; // 0-indexed
    const lastDataRow = 7 + expenses.length - 1;
    for (let row = firstDataRow; row <= lastDataRow; row++) {
      ["B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
        const cell = `${col}${row + 1}`;
        if (!ws[cell]) ws[cell] = { t: "s", v: "" };
        ws[cell].s = {
          border: {
            top: thinBorder.top,
            bottom: thinBorder.bottom,
            left: col === "B" ? mediumBorder.left : thinBorder.left,
            right: col === "H" ? mediumBorder.right : thinBorder.right,
          },
          alignment: ["E", "F", "G", "H"].includes(col)
            ? { horizontal: "right" }
            : undefined,
          numFmt: ["E", "F", "G", "H"].includes(col) ? "0.00" : undefined,
        };
      });
    }

    // Style totals row
    const totalRow = 8 + expenses.length;
    ["B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
      const cell = `${col}${totalRow}`;
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        font: { bold: true },
        border: {
          top: thinBorder.top,
          bottom: mediumBorder.bottom,
          left: col === "B" ? mediumBorder.left : thinBorder.left,
          right: col === "H" ? mediumBorder.right : thinBorder.right,
        },
        alignment: ["E", "F", "G", "H"].includes(col)
          ? { horizontal: "right" }
          : col === "D"
          ? { horizontal: "right" }
          : undefined,
        numFmt: ["E", "F", "G", "H"].includes(col) ? "0.00" : undefined,
      };
    });

    // Style "Approved for payment" with border
    const approvalRow = totalRow + 2;
    ws[`B${approvalRow}`].s = {
      font: { bold: true },
      border: {
        top: thinBorder.top,
        left: thinBorder.left,
        bottom: thinBorder.bottom,
        right: thinBorder.right,
      },
    };
    ["C", "D", "E"].forEach((col) => {
      const cell = `${col}${approvalRow}`;
      if (!ws[cell]) ws[cell] = { t: "s", v: "" };
      ws[cell].s = {
        border: {
          top: thinBorder.top,
          bottom: thinBorder.bottom,
          left: thinBorder.left,
          right: thinBorder.right,
        },
      };
    });

    // Merge cells for title, subtitle, and "Approved for payment"
    ws["!merges"] = [
      { s: { r: 1, c: 1 }, e: { r: 1, c: 7 } }, // Title B2:H2
      { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } }, // Subtitle B3:H3
      { s: { r: approvalRow - 1, c: 1 }, e: { r: approvalRow - 1, c: 4 } }, // Approved for payment
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Internal Expense Claim");

    // Generate filename with month
    const monthDisplay = formatMonthDisplay(selectedMonth);
    const filename = `amplitude-expense-claim-${monthDisplay.replace(
      " ",
      "-"
    )}.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
  };

  // Export receipts to PDF
  const handleExportReceiptsToPDF = async () => {
    if (expenses.length === 0) {
      setError("No expenses to export");
      return;
    }

    setUploadingReceipt(true);
    try {
      const pdf = new jsPDF();
      let yPosition = 20;
      const pageHeight = pdf.internal.pageSize.height;
      const pageWidth = pdf.internal.pageSize.width;
      const margin = 15;
      const imageMaxWidth = pageWidth - 2 * margin;

      // Title
      pdf.setFontSize(18);
      pdf.text("Expense Receipts", pageWidth / 2, yPosition, {
        align: "center",
      });
      yPosition += 15;

      // Loop through each expense
      for (const expense of expenses) {
        // Fetch receipts for this expense
        const { data: receipts } = await supabase
          .from("receipt")
          .select("*")
          .eq("expense_id", expense.id);

        if (!receipts || receipts.length === 0) continue;

        // Add new page if needed
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = 20;
        }

        // Add header for this expense
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Job No: ${expense.job_no}`, margin, yPosition);
        yPosition += 7;
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Date: ${expense.date || "N/A"}`, margin, yPosition);
        yPosition += 7;
        pdf.text(`Details: ${expense.details}`, margin, yPosition);
        yPosition += 10;

        // Process each receipt image
        for (const receipt of receipts) {
          // Get signed URL
          const { data: urlData } = await supabase.storage
            .from("receipts")
            .createSignedUrl(receipt.path, 3600);

          if (!urlData?.signedUrl) continue;

          try {
            // Fetch the image
            const response = await fetch(urlData.signedUrl);
            const blob = await response.blob();

            // Convert to base64
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });

            // Get image dimensions to calculate scaling
            const img = new Image();
            await new Promise((resolve) => {
              img.onload = resolve;
              img.src = base64;
            });

            // Calculate scaled dimensions
            let imgWidth = imageMaxWidth;
            let imgHeight = (img.height * imageMaxWidth) / img.width;

            // If image is too tall, scale to fit page
            const maxHeight = pageHeight - yPosition - margin;
            if (imgHeight > maxHeight) {
              if (yPosition > 60) {
                // Start new page if we're not at the top
                pdf.addPage();
                yPosition = 20;
              }
              imgHeight = Math.min(imgHeight, pageHeight - 2 * margin);
              imgWidth = (img.width * imgHeight) / img.height;
            }

            // Check if we need a new page
            if (yPosition + imgHeight > pageHeight - margin) {
              pdf.addPage();
              yPosition = 20;
            }

            // Add image to PDF
            pdf.addImage(
              base64,
              "JPEG",
              margin,
              yPosition,
              imgWidth,
              imgHeight
            );
            yPosition += imgHeight + 10;
          } catch (error) {
            console.error("Error processing receipt image:", error);
          }
        }

        yPosition += 10; // Space between expense groups
      }

      // Generate filename with month
      const monthDisplay = formatMonthDisplay(selectedMonth);
      const filename = `amplitude-receipts-${monthDisplay.replace(
        " ",
        "-"
      )}.pdf`;

      // Save PDF
      pdf.save(filename);
      setError(null);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setUploadingReceipt(false);
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

          {/* Desktop only buttons */}
          {!isMobile && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {/* Export Buttons */}
              <Button
                variant="outline"
                onClick={handleExportToExcel}
                disabled={expenses.length === 0}
                className="w-full sm:w-auto"
              >
                <Download className="mr-2 h-4 w-4" />
                Export to Excel
              </Button>

              <Button
                variant="outline"
                onClick={handleExportReceiptsToPDF}
                disabled={expenses.length === 0 || uploadingReceipt}
                className="w-full sm:w-auto"
              >
                {uploadingReceipt ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Export Receipts to PDF
                  </>
                )}
              </Button>

              {/* Add Button - Drawer for Mobile, Dialog for Desktop */}
              {isMobile ? (
                <Drawer
                  open={isAddDialogOpen}
                  onOpenChange={setIsAddDialogOpen}
                >
                  <DrawerTrigger asChild>
                    <Button onClick={resetForm} className="w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Expense
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="max-h-[95vh]">
                    <form
                      onSubmit={handleAdd}
                      className="px-4 flex flex-col max-h-[95vh]"
                    >
                      <DrawerHeader>
                        <DrawerTitle>Add New Expense</DrawerTitle>
                        <DrawerDescription>
                          Enter the details of your expense
                        </DrawerDescription>
                      </DrawerHeader>
                      <div className="grid gap-4 py-4 overflow-y-auto px-1 flex-1">
                        <div className="grid gap-2">
                          <Label htmlFor="job_no">Job Number</Label>
                          <Input
                            id="job_no"
                            value={formData.job_no}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                job_no: e.target.value,
                              });
                              if (formErrors.job_no) {
                                setFormErrors({
                                  ...formErrors,
                                  job_no: undefined,
                                });
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
                              setFormData({
                                ...formData,
                                date: e.target.value,
                              });
                              if (formErrors.date) {
                                setFormErrors({
                                  ...formErrors,
                                  date: undefined,
                                });
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
                              setFormData({
                                ...formData,
                                details: e.target.value,
                              });
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
                            <Label htmlFor="food">Food (AED)</Label>
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
                                  setFormErrors({
                                    ...formErrors,
                                    food: undefined,
                                  });
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
                            <Label htmlFor="taxi">Taxi (AED)</Label>
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
                                  setFormErrors({
                                    ...formErrors,
                                    taxi: undefined,
                                  });
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
                            <Label htmlFor="others">Others (AED)</Label>
                            <Input
                              id="others"
                              type="number"
                              step="0.01"
                              min="0"
                              value={
                                formData.others === 0 ? "" : formData.others
                              }
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
                          <Label>Receipts (Optional)</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                document
                                  .getElementById("receipt-camera")
                                  ?.click()
                              }
                              className="flex-1"
                            >
                              <Camera className="mr-2 h-4 w-4" />
                              Take Picture
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                document.getElementById("receipt")?.click()
                              }
                              className="flex-1"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Upload File
                            </Button>
                          </div>
                          <input
                            id="receipt-camera"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <input
                            id="receipt"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
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
                      <DrawerFooter className="pb-8">
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
                <Dialog
                  open={isAddDialogOpen}
                  onOpenChange={setIsAddDialogOpen}
                >
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
                              setFormData({
                                ...formData,
                                job_no: e.target.value,
                              });
                              if (formErrors.job_no) {
                                setFormErrors({
                                  ...formErrors,
                                  job_no: undefined,
                                });
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
                              setFormData({
                                ...formData,
                                date: e.target.value,
                              });
                              if (formErrors.date) {
                                setFormErrors({
                                  ...formErrors,
                                  date: undefined,
                                });
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
                              setFormData({
                                ...formData,
                                details: e.target.value,
                              });
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
                            <Label htmlFor="dialog_food">Food (AED)</Label>
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
                                  setFormErrors({
                                    ...formErrors,
                                    food: undefined,
                                  });
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
                            <Label htmlFor="dialog_taxi">Taxi (AED)</Label>
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
                                  setFormErrors({
                                    ...formErrors,
                                    taxi: undefined,
                                  });
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
                            <Label htmlFor="dialog_others">Others (AED)</Label>
                            <Input
                              id="dialog_others"
                              type="number"
                              step="0.01"
                              min="0"
                              value={
                                formData.others === 0 ? "" : formData.others
                              }
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
                          <Label>Receipts (Optional)</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                document
                                  .getElementById("dialog-receipt-camera")
                                  ?.click()
                              }
                              className="flex-1"
                            >
                              <Camera className="mr-2 h-4 w-4" />
                              Take Picture
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                document
                                  .getElementById("dialog_receipt")
                                  ?.click()
                              }
                              className="flex-1"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Upload File
                            </Button>
                          </div>
                          <input
                            id="dialog-receipt-camera"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <input
                            id="dialog_receipt"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
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
                        AED {(expense.food || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        AED {(expense.taxi || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        AED {(expense.others || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        AED {getTotalExpense(expense).toFixed(2)}
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
                          AED {(expense.food || 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">
                          Taxi
                        </div>
                        <div className="font-medium">
                          AED {(expense.taxi || 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">
                          Others
                        </div>
                        <div className="font-medium">
                          AED {(expense.others || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Total
                      </span>
                      <span className="font-bold text-lg">
                        AED {getTotalExpense(expense).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <div className="text-lg font-bold">
                Month Total: AED {getMonthTotal().toFixed(2)}
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Edit Dialog/Drawer */}
      {isMobile ? (
        <Drawer open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DrawerContent className="max-h-[95vh]">
            <form
              onSubmit={handleEdit}
              className="px-4 flex flex-col max-h-[95vh]"
            >
              <DrawerHeader>
                <DrawerTitle>Edit Expense</DrawerTitle>
                <DrawerDescription>
                  Update the details of your expense
                </DrawerDescription>
              </DrawerHeader>
              <div className="grid gap-4 py-4 overflow-y-auto px-1 flex-1">
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
                    <Label htmlFor="edit_food">Food (AED)</Label>
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
                    <Label htmlFor="edit_taxi">Taxi (AED)</Label>
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
                    <Label htmlFor="edit_others">Others (AED)</Label>
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
                  <Label>Add Receipts (Optional)</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document.getElementById("edit-receipt-camera")?.click()
                      }
                      className="flex-1"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Take Picture
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document.getElementById("edit_receipt")?.click()
                      }
                      className="flex-1"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload File
                    </Button>
                  </div>
                  <input
                    id="edit-receipt-camera"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <input
                    id="edit_receipt"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
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
              <DrawerFooter className="pb-8">
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
                    <Label htmlFor="dialog_edit_food">Food (AED)</Label>
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
                    <Label htmlFor="dialog_edit_taxi">Taxi (AED)</Label>
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
                    <Label htmlFor="dialog_edit_others">Others (AED)</Label>
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
                  <Label>Add Receipts (Optional)</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document
                          .getElementById("dialog-edit-receipt-camera")
                          ?.click()
                      }
                      className="flex-1"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Take Picture
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document.getElementById("dialog_edit_receipt")?.click()
                      }
                      className="flex-1"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload File
                    </Button>
                  </div>
                  <input
                    id="dialog-edit-receipt-camera"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <input
                    id="dialog_edit_receipt"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
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

      {/* Mobile FAB */}
      {isMobile && (
        <>
          {/* Overlay */}
          {isFabOpen && (
            <div
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => setIsFabOpen(false)}
            />
          )}

          {/* FAB Action Buttons */}
          <div className="fixed bottom-20 right-4 flex flex-col gap-2 z-50">
            {isFabOpen && (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setIsFabOpen(false);
                    resetForm();
                    setIsAddDialogOpen(true);
                  }}
                  className="shadow-lg"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Add Expense
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setIsFabOpen(false);
                    handleExportToExcel();
                  }}
                  disabled={expenses.length === 0}
                  className="shadow-lg"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Export Excel
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setIsFabOpen(false);
                    handleExportReceiptsToPDF();
                  }}
                  disabled={expenses.length === 0 || uploadingReceipt}
                  className="shadow-lg"
                >
                  {uploadingReceipt ? (
                    <>
                      <Spinner className="mr-2 h-5 w-5" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-5 w-5" />
                      Export PDF
                    </>
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Main FAB Button */}
          <Button
            size="lg"
            onClick={() => setIsFabOpen(!isFabOpen)}
            className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50"
          >
            <Plus
              className={`h-6 w-6 transition-transform ${
                isFabOpen ? "rotate-45" : ""
              }`}
            />
          </Button>

          {/* Mobile Add Expense Drawer */}
          <Drawer open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DrawerContent className="max-h-[95vh]">
              <form
                onSubmit={handleAdd}
                className="px-4 flex flex-col max-h-[95vh]"
              >
                <DrawerHeader>
                  <DrawerTitle>Add New Expense</DrawerTitle>
                  <DrawerDescription>
                    Enter the details of your expense
                  </DrawerDescription>
                </DrawerHeader>
                <div className="grid gap-4 py-4 overflow-y-auto px-1 flex-1">
                  <div className="grid gap-2">
                    <Label htmlFor="mobile_job_no">Job Number</Label>
                    <Input
                      id="mobile_job_no"
                      value={formData.job_no}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          job_no: e.target.value,
                        });
                        if (formErrors.job_no) {
                          setFormErrors({
                            ...formErrors,
                            job_no: undefined,
                          });
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
                    <Label htmlFor="mobile_date">Date</Label>
                    <Input
                      id="mobile_date"
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
                    <Label htmlFor="mobile_details">Details</Label>
                    <Input
                      id="mobile_details"
                      value={formData.details}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          details: e.target.value,
                        });
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
                      <Label htmlFor="mobile_food">Food (AED)</Label>
                      <Input
                        id="mobile_food"
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
                            setFormErrors({
                              ...formErrors,
                              food: undefined,
                            });
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
                      <Label htmlFor="mobile_taxi">Taxi (AED)</Label>
                      <Input
                        id="mobile_taxi"
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
                            setFormErrors({
                              ...formErrors,
                              taxi: undefined,
                            });
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
                      <Label htmlFor="mobile_others">Others (AED)</Label>
                      <Input
                        id="mobile_others"
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
                    <Label>Receipts (Optional)</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          document
                            .getElementById("mobile-receipt-camera")
                            ?.click()
                        }
                        className="flex-1"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Take Picture
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          document.getElementById("mobile-receipt")?.click()
                        }
                        className="flex-1"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload File
                      </Button>
                    </div>
                    <input
                      id="mobile-receipt-camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <input
                      id="mobile-receipt"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
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
                <DrawerFooter className="pb-8">
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
        </>
      )}
    </Card>
  );
}
