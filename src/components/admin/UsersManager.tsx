import { useState, useEffect } from "react";
import supabase from "../../lib/supabase";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Spinner } from "../ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Pencil, Trash2 } from "lucide-react";

interface User {
  id: string;
  user_id: string;
  full_name: string | null;
  admin: boolean;
  initial_login: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
}

export function UsersManager() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Form state
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formAdmin, setFormAdmin] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get all users via edge function
      const { data: response, error } = await supabase.functions.invoke(
        "manage-users",
        {
          body: { action: "list" },
        }
      );

      if (error) throw error;
      if (response.error) throw new Error(response.error);

      setUsers(response.users || []);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formEmail.trim() || !formPassword.trim()) {
      setFormError("Email and password are required");
      return;
    }

    if (!formFullName.trim()) {
      setFormError("Full name is required");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create",
          data: {
            email: formEmail.trim(),
            password: formPassword,
            full_name: formFullName.trim(),
            admin: formAdmin,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Reset form and close dialog
      resetForm();
      setIsCreateDialogOpen(false);
      await fetchUsers();
    } catch (err: any) {
      console.error("Error creating user:", err);
      setFormError(err.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setSaving(true);
    setFormError(null);

    try {
      const { error } = await supabase
        .from("user_profile")
        .update({
          full_name: formFullName.trim() || null,
          admin: formAdmin,
        })
        .eq("id", editingUser.id);

      if (error) throw error;

      setEditingUser(null);
      resetForm();
      await fetchUsers();
    } catch (err: any) {
      console.error("Error updating user:", err);
      setFormError(err.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    setSaving(true);

    try {
      // Call edge function to delete user
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "delete",
          data: {
            user_id: user.user_id,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setDeleteConfirmUser(null);
      await fetchUsers();
    } catch (err: any) {
      console.error("Error deleting user:", err);
      setFormError(err.message || "Failed to delete user");
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormFullName(user.full_name || "");
    setFormAdmin(user.admin);
    setFormError(null);
  };

  const resetForm = () => {
    setFormEmail("");
    setFormPassword("");
    setFormFullName("");
    setFormAdmin(false);
    setFormError(null);
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    resetForm();
  };

  const handleCloseEditDialog = () => {
    setEditingUser(null);
    resetForm();
  };

  // Pagination calculations
  const totalPages = Math.ceil(users.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = users.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">User Management</h2>
        <Button onClick={() => setIsCreateDialogOpen(true)}>Create User</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Initial Login</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.full_name || "-"}</TableCell>
                  <TableCell>{user.admin ? "Yes" : "No"}</TableCell>
                  <TableCell>{user.initial_login ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditDialog(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirmUser(user)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, users.length)} of{" "}
            {users.length} users
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => handlePageChange(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={handleCloseCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account with email and password
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Temporary password"
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder="John Doe"
                disabled={saving}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="admin"
                type="checkbox"
                checked={formAdmin}
                onChange={(e) => setFormAdmin(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="admin">Admin User</Label>
            </div>
            {formError && <p className="text-sm text-red-500">{formError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseCreateDialog}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={saving}>
              {saving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={handleCloseEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input value={editingUser?.email || ""} disabled />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder="John Doe"
                disabled={saving}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="edit_admin"
                type="checkbox"
                checked={formAdmin}
                onChange={(e) => setFormAdmin(e.target.checked)}
                disabled={saving}
                className="h-4 w-4"
              />
              <Label htmlFor="edit_admin">Admin User</Label>
            </div>
            {formError && <p className="text-sm text-red-500">{formError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseEditDialog}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirmUser}
        onOpenChange={() => setDeleteConfirmUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user account for{" "}
              <strong>{deleteConfirmUser?.email}</strong>. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirmUser && handleDeleteUser(deleteConfirmUser)
              }
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Deleting...
                </>
              ) : (
                "Delete User"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
