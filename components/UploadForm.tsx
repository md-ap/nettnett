"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import RichTextEditor from "./RichTextEditor";

const MEDIA_TYPES = [
  { value: "texts", label: "Texts (Books, Documents, PDFs)" },
  { value: "movies", label: "Movies (Video files)" },
  { value: "audio", label: "Audio (Music, Podcasts)" },
  { value: "image", label: "Images (Photos, Art)" },
  { value: "software", label: "Software" },
  { value: "data", label: "Data (Generic)" },
];

const LANGUAGES = [
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

export default function UploadForm({ disabled = false, onRefresh }: { disabled?: boolean; onRefresh?: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediatype, setMediatype] = useState("data");
  const [creator, setCreator] = useState("");
  const [date, setDate] = useState("");
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("");
  const [uploadToIA, setUploadToIA] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isDisabled = uploading || disabled;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: isDisabled,
  });

  function uploadFileWithProgress(
    url: string,
    file: File,
    onProgress: (loaded: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
      xhr.send(file);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !description.trim() || files.length === 0) {
      setError("Title, description, and at least one file are required.");
      return;
    }

    setUploading(true);
    setProgressPercent(0);

    const totalSteps = 3;

    try {
      // ── Step 1: Get presigned URLs ──
      setProgressText(`Step 1/${totalSteps}: Preparing upload...`);
      setProgressPercent(5);

      const presignRes = await fetch("/api/files/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });

      if (!presignRes.ok) {
        const data = await presignRes.json();
        setError(data.error || "Failed to prepare upload");
        return;
      }

      const { titleFolder, presignedUrls } = await presignRes.json();

      // ── Step 2: Upload files directly to Cloud ──
      setProgressText(`Step 2/${totalSteps}: Uploading to Cloud...`);
      setProgressPercent(10);

      const fileTotalSize = files.reduce((acc, f) => acc + f.size, 0);
      let uploadedSize = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const presigned = presignedUrls[i];

        setProgressText(
          `Step 2/${totalSteps}: Uploading ${file.name} (${i + 1}/${files.length})...`
        );

        await uploadFileWithProgress(presigned.uploadUrl, file, (loaded) => {
          const currentProgress = 10 + ((uploadedSize + loaded) / fileTotalSize) * 70;
          setProgressPercent(Math.min(Math.round(currentProgress), 80));
        });

        uploadedSize += file.size;
      }

      // ── Step 3: Finalize ──
      setProgressText(`Step 3/${totalSteps}: Finalizing...`);
      setProgressPercent(85);

      const finalizeRes = await fetch("/api/files/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          titleFolder,
          description: description.trim(),
          mediatype,
          creator: creator.trim() || undefined,
          date: date || undefined,
          subject: subject.trim() || undefined,
          language: language || undefined,
          uploadToIA,
          uploadedFiles: files.map((f) => ({ name: f.name, size: f.size })),
        }),
      });

      if (!finalizeRes.ok) {
        const data = await finalizeRes.json();
        setError(data.error || "Failed to finalize upload");
        return;
      }

      setProgressPercent(100);

      const destinations = ["Cloud"];
      if (uploadToIA) destinations.push("Internet Archive");
      setSuccess(
        `Uploaded ${files.length} file${files.length !== 1 ? "s" : ""} to ${destinations.join(" & ")}!`
      );

      // Reset form
      setTitle("");
      setDescription("");
      setMediatype("data");
      setCreator("");
      setDate("");
      setSubject("");
      setLanguage("");
      setUploadToIA(false);
      setFiles([]);
      if (onRefresh) onRefresh();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
      setTimeout(() => {
        setProgressText("");
        setProgressPercent(0);
      }, 2000);
    }
  }

  function formatSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <form onSubmit={handleSubmit} className={`rounded-lg border border-white/10 bg-white/[0.02] p-6 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <h2 className="mb-6 text-lg font-semibold">New Upload</h2>

      {error && (
        <div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      {success && (
        <div className="mb-4 rounded bg-emerald-500/10 p-3 text-sm text-emerald-400">{success}</div>
      )}

      {/* Two-column layout: metadata left, files right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── LEFT COLUMN: Metadata Fields ── */}
        <div className="space-y-4">
          {/* Title - Required */}
          <div>
            <label className="mb-1 block text-sm text-white/60">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={uploading}
              placeholder="Item title"
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/50 disabled:opacity-50"
            />
          </div>

          {/* Description - Required */}
          <div>
            <label className="mb-1 block text-sm text-white/60">Description *</label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Describe the content (supports bold, italic, links, lists...)"
              disabled={uploading}
            />
          </div>

          {/* Media Type & Creator - side by side */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-white/60">Media Type *</label>
              <select
                value={mediatype}
                onChange={(e) => setMediatype(e.target.value)}
                disabled={uploading}
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-white/50 disabled:opacity-50"
              >
                {MEDIA_TYPES.map((mt) => (
                  <option key={mt.value} value={mt.value} className="bg-black">
                    {mt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-white/60">Creator</label>
              <input
                type="text"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                disabled={uploading}
                placeholder="Author or creator"
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/50 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Date & Language - side by side */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-white/60">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={uploading}
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-white/50 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-white/60">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={uploading}
                className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-white/50 disabled:opacity-50"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value} className="bg-black">
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm text-white/60">Tags</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={uploading}
              placeholder="Comma-separated tags (e.g. music, jazz, vinyl)"
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/50 disabled:opacity-50"
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN: Files, IA Checkbox, Upload Button ── */}
        <div className="flex flex-col">
          {/* Drop Zone */}
          <div>
            <label className="mb-1 block text-sm text-white/60">Files *</label>
            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragActive
                  ? "border-white bg-white/10"
                  : "border-white/20 hover:border-white/40"
              } ${uploading ? "pointer-events-none opacity-50" : ""}`}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-sm">Drop files here...</p>
              ) : (
                <p className="text-sm text-white/50">
                  Drag & drop files here, or click to select
                </p>
              )}
            </div>

            {/* Selected Files */}
            {files.length > 0 && (
              <div className="mt-3">
                <ul className="space-y-1">
                  {files.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {file.name}{" "}
                        <span className="text-white/40">({formatSize(file.size)})</span>
                      </span>
                      {!uploading && (
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="ml-2 shrink-0 text-red-400 hover:text-red-300"
                        >
                          &times;
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-white/40">
                  {files.length} file{files.length !== 1 ? "s" : ""} &middot; {formatSize(totalSize)} total
                </p>
              </div>
            )}
          </div>

          {/* Internet Archive Checkbox */}
          <div className="mt-4 flex items-center gap-3 rounded border border-white/10 bg-white/[0.03] px-4 py-3">
            <input
              type="checkbox"
              id="uploadToIA"
              checked={uploadToIA}
              onChange={(e) => setUploadToIA(e.target.checked)}
              disabled={uploading}
              className="h-4 w-4 shrink-0 rounded border-white/30 accent-white"
            />
            <label htmlFor="uploadToIA" className="cursor-pointer text-sm">
              Also upload to{" "}
              <span className="font-medium text-white">Internet Archive</span>
              <span className="ml-1 text-white/40">
                (publicly accessible at archive.org)
              </span>
            </label>
          </div>

          {/* Progress Bar */}
          {uploading && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-white/70">{progressText}</span>
                <span className="text-white/50">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit - pushed to bottom */}
          <div className="mt-auto pt-4">
            {!uploading && (
              <button
                type="submit"
                disabled={files.length === 0 || !title.trim() || !description.trim()}
                className="w-full rounded bg-white py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                Upload {files.length} file{files.length !== 1 ? "s" : ""}
                {uploadToIA ? " to Cloud & Internet Archive" : " to Cloud"}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
