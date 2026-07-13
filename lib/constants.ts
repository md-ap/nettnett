// Shared client-safe constants. (lib/auth.ts imports next/headers and can't
// be pulled into client components — anything needed on both sides lives here.)

export const B2_PUBLIC_URL = "https://f004.backblazeb2.com/file/nettnett1";

export const MEDIA_TYPES = [
  { value: "texts", label: "Texts (Books, Documents, PDFs)" },
  { value: "movies", label: "Movies (Video files)" },
  { value: "audio", label: "Audio (Music, Podcasts)" },
  { value: "image", label: "Images (Photos, Art)" },
  { value: "software", label: "Software" },
  { value: "data", label: "Data (Generic)" },
];

export const LANGUAGES = [
  { value: "", label: "Select language" },
  { value: "eng", label: "English" },
  { value: "spa", label: "Spanish" },
  { value: "ara", label: "Arabic" },
  { value: "zho", label: "Chinese" },
  { value: "nld", label: "Dutch" },
  { value: "fra", label: "French" },
  { value: "deu", label: "German" },
  { value: "hin", label: "Hindi" },
  { value: "ita", label: "Italian" },
  { value: "jpn", label: "Japanese" },
  { value: "kor", label: "Korean" },
  { value: "pol", label: "Polish" },
  { value: "por", label: "Portuguese" },
  { value: "rus", label: "Russian" },
  { value: "swe", label: "Swedish" },
  { value: "tur", label: "Turkish" },
];

// Role ladder: user (no permissions) → uploader → management → admin
export const ROLES = ["user", "uploader", "management", "admin"] as const;

export const ROLE_STYLES: Record<string, string> = {
  admin: "bg-yellow-500/20 text-yellow-300",
  management: "bg-green-500/20 text-green-300",
  uploader: "bg-blue-500/20 text-blue-300",
  user: "bg-white/10 text-white/60",
};

// Client-safe mirror of lib/auth.ts canManageRadio (display gating only —
// the APIs enforce the real check server-side)
export const canManageRole = (role?: string) =>
  role === "management" || role === "admin";
