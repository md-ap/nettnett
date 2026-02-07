"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  canManage: boolean;
  createdAt: string;
}

interface FileItem {
  title: string;
  folder: string;
  iaIdentifier?: string | null;
  iaUrl?: string | null;
  files: { key: string; name: string; size: number }[];
  createdAt?: string;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editPasswordUser, setEditPasswordUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [viewFilesUser, setViewFilesUser] = useState<User | null>(null);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);
  const [togglingManagement, setTogglingManagement] = useState<string | null>(null);

  async function handleToggleManagement(user: User) {
    const newValue = !user.canManage;
    setTogglingManagement(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/management`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canManage: newValue }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, canManage: newValue } : u))
        );
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update management access");
      }
    } catch {
      alert("Network error");
    } finally {
      setTogglingManagement(null);
    }
  }

  async function handleToggleRole(user: User) {
    const newRole = user.role === "admin" ? "user" : "admin";
    setTogglingRole(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
        );
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update role");
      }
    } catch {
      alert("Network error");
    } finally {
      setTogglingRole(null);
    }
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${u.firstName} ${u.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Admin Panel</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
        >
          + Add User
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by email or name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full rounded border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
      />

      {/* Users table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <p className="py-8 text-center text-white/40">No users found.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/50">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/50">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/50">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/50">
                  Mgmt
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-white/50">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-white/50">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 text-sm text-white">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleRole(user)}
                      disabled={togglingRole === user.id}
                      title={`Click to make ${user.role === "admin" ? "user" : "admin"}`}
                      className={`rounded px-2 py-0.5 text-xs cursor-pointer transition-colors disabled:opacity-50 ${
                        user.role === "admin"
                          ? "bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      }`}
                    >
                      {togglingRole === user.id ? "..." : user.role}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleManagement(user)}
                      disabled={togglingManagement === user.id || user.role === "admin"}
                      title={
                        user.role === "admin"
                          ? "Admins always have management access"
                          : `Click to ${user.canManage ? "revoke" : "grant"} management access`
                      }
                      className={`rounded px-2 py-0.5 text-xs cursor-pointer transition-colors disabled:opacity-50 ${
                        user.role === "admin" || user.canManage
                          ? "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                          : "bg-white/10 text-white/40 hover:bg-white/20"
                      }`}
                    >
                      {togglingManagement === user.id
                        ? "..."
                        : user.role === "admin"
                          ? "admin"
                          : user.canManage
                            ? "yes"
                            : "no"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/40">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setViewFilesUser(user)}
                        className="rounded px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-500/10"
                      >
                        Files
                      </button>
                      <button
                        onClick={() => setEditPasswordUser(user)}
                        className="rounded px-2 py-1 text-xs text-yellow-400 transition-colors hover:bg-yellow-500/10"
                      >
                        Password
                      </button>
                      <button
                        onClick={() => setDeleteUser(user)}
                        className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-white/30">
        {users.length} user{users.length !== 1 ? "s" : ""} total
      </p>

      {/* Modals */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={fetchUsers}
        />
      )}
      {editPasswordUser && (
        <EditPasswordModal
          user={editPasswordUser}
          onClose={() => setEditPasswordUser(null)}
          onSuccess={fetchUsers}
        />
      )}
      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onSuccess={fetchUsers}
        />
      )}
      {viewFilesUser && (
        <UserFilesModal
          user={viewFilesUser}
          onClose={() => setViewFilesUser(null)}
        />
      )}
    </div>
  );
}

/* ─── Add User Modal ─── */
function AddUserModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, lastName, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user");
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Add User</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
            />
          </div>
          <input
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-white/50 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit Password Modal ─── */
function EditPasswordModal({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update password");
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6">
        <h2 className="mb-1 text-lg font-semibold text-white">
          Change Password
        </h2>
        <p className="mb-4 text-sm text-white/40">
          {user.email} ({user.firstName} {user.lastName})
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="New password (min 6 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-white/50 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-yellow-500/20 px-4 py-2 text-sm text-yellow-300 transition-colors hover:bg-yellow-500/30 disabled:opacity-50"
            >
              {saving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Delete User Modal ─── */
function DeleteUserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete user");
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-red-500/30 bg-black p-6">
        <h2 className="mb-2 text-lg font-semibold text-white">Delete User</h2>
        <p className="mb-1 text-sm text-white/60">
          Are you sure you want to delete this user?
        </p>
        <p className="mb-4 text-sm font-medium text-white">
          {user.email} ({user.firstName} {user.lastName})
        </p>
        <p className="mb-4 text-xs text-red-400/70">
          This will permanently remove the user and all their data from the
          database. B2 files will not be deleted.
        </p>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-white/50 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded bg-red-500/20 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete User"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── User Files Modal ─── */
function UserFilesModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchFiles() {
      try {
        const res = await fetch(`/api/admin/users/${user.id}/files`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        } else {
          const data = await res.json();
          setError(data.error || "Failed to load files");
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    fetchFiles();
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-lg border border-white/20 bg-black p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Files: {user.firstName} {user.lastName}
            </h2>
            <p className="text-sm text-white/40">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-sm text-white/50 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-red-400">{error}</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-white/40">
            No files uploaded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.folder}
                className="rounded border border-white/10 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="font-medium text-white">{item.title}</h3>
                  {item.iaUrl ? (
                    <a
                      href={item.iaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-300 hover:bg-green-500/30"
                    >
                      Internet Archive
                    </a>
                  ) : (
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/40">
                      Cloud only
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {item.files.map((file) => (
                    <li
                      key={file.key}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="text-white/60">{file.name}</span>
                      <span className="text-xs text-white/30">
                        {file.size > 1024 * 1024
                          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${(file.size / 1024).toFixed(1)} KB`}
                      </span>
                      <a
                        href={`https://f004.backblazeb2.com/file/nettnett1/${file.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                      >
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-xs text-white/30">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
