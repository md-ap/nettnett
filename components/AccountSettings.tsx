"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import { ROLE_STYLES } from "@/lib/constants";

export interface AccountProfile {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  emailVerified: boolean;
}

// /account — self-service settings for EVERY logged-in role (a plain "user"
// can manage their account even before an admin grants permissions):
// rename, change email (re-verification via Resend), change password,
// delete the account.
export default function AccountSettings({
  initialProfile,
}: {
  initialProfile: AccountProfile;
}) {
  const [profile, setProfile] = useState(initialProfile);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">My account</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs ${ROLE_STYLES[profile.role] || ROLE_STYLES.user}`}
        >
          {profile.role}
        </span>
      </div>

      <div className="space-y-4">
        <ProfileSection profile={profile} onSaved={setProfile} />
        <EmailSection profile={profile} onChanged={setProfile} />
        <PasswordSection />
        <DangerSection />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  danger = false,
  children,
}: {
  title: string;
  subtitle: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border p-6 ${
        danger ? "border-red-500/30 bg-red-500/5" : "border-white/10 bg-white/5"
      }`}
    >
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-white/40">{subtitle}</p>
      {children}
    </section>
  );
}

function Feedback({ error, success }: { error: string; success: string }) {
  if (error) {
    return (
      <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
        {error}
      </div>
    );
  }
  if (success) {
    return (
      <div className="mb-4 rounded bg-green-500/10 p-3 text-sm text-green-400">
        ✓ {success}
      </div>
    );
  }
  return null;
}

/* ─── Profile (name) ─── */
function ProfileSection({
  profile,
  onSaved,
}: {
  profile: AccountProfile;
  onSaved: (p: AccountProfile) => void;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const unchanged =
    firstName.trim() === profile.firstName && lastName.trim() === profile.lastName;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update profile");
        return;
      }
      onSaved({ ...profile, firstName: data.user.firstName, lastName: data.user.lastName });
      setSuccess("Profile updated");
      router.refresh(); // navbar shows the name from the (re-signed) session
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Profile" subtitle="The name shown across NettNett.">
      <Feedback error={error} success={success} />
      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            required
          />
          <Input
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
            required
          />
        </div>
        <Button type="submit" loading={saving} disabled={unchanged || !firstName.trim() || !lastName.trim()}>
          Save changes
        </Button>
      </form>
    </SectionCard>
  );
}

/* ─── Email ─── */
function EmailSection({
  profile,
  onChanged,
}: {
  profile: AccountProfile;
  onChanged: (p: AccountProfile) => void;
}) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change email");
        return;
      }
      onChanged({ ...profile, email: data.user.email, emailVerified: false });
      setNewEmail("");
      setPassword("");
      setSuccess(data.message || "Email updated — check the new inbox");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Email"
      subtitle="Used to sign in. Changing it sends a confirmation link to the new address."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white">{profile.email}</span>
        {profile.emailVerified ? (
          <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-300">
            Verified
          </span>
        ) : (
          <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">
            Pending verification
          </span>
        )}
      </div>
      {!profile.emailVerified && (
        <p className="mb-4 text-xs text-white/40">
          Confirm this address within 7 days or the account deactivates until
          you verify it.{" "}
          <Link href="/verify-email" className="text-white/70 underline hover:text-white">
            Resend the confirmation email →
          </Link>
        </p>
      )}
      <Feedback error={error} success={success} />
      <form onSubmit={handleChange} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="New email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            required
          />
          <Input
            label="Current password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Confirm it's you"
            required
          />
        </div>
        <Button type="submit" loading={saving} disabled={!newEmail || !password}>
          Change email
        </Button>
      </form>
    </SectionCard>
  );
}

/* ─── Password ─── */
function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Password"
      subtitle="Minimum 6 characters. You'll get an email notice after the change."
    >
      <Feedback error={error} success={success} />
      <form onSubmit={handleChange} className="space-y-3">
        <Input
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <Button
          type="submit"
          loading={saving}
          disabled={!currentPassword || !newPassword || !confirmPassword}
        >
          Change password
        </Button>
      </form>
    </SectionCard>
  );
}

/* ─── Danger zone (delete account) ─── */
function DangerSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setConfirmOpen(false);
    setPassword("");
    setError("");
  }

  async function handleDelete() {
    setError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete account");
        return;
      }
      // Session cookie is already cleared server-side — full reload home
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SectionCard
      title="Delete account"
      subtitle="Permanent. Files you already uploaded to the archive stay in the radio library — ask an admin if you also want those removed."
      danger
    >
      <Button variant="danger" onClick={() => setConfirmOpen(true)}>
        Delete my account
      </Button>

      {confirmOpen && (
        <Modal onClose={close} closeOnBackdrop={false} maxWidth="sm">
          <h2 className="mb-2 text-lg font-semibold text-white">Delete account</h2>
          <p className="mb-4 text-sm text-white/60">
            This cannot be undone. Enter your password to confirm.
          </p>
          {error && (
            <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="dangerSolid"
              onClick={handleDelete}
              loading={deleting}
              disabled={!password}
            >
              Delete my account
            </Button>
          </div>
        </Modal>
      )}
    </SectionCard>
  );
}
