"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";

export default function FileUploadZone() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const router = useRouter();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      const total = acceptedFiles.length;
      let completed = 0;

      for (const file of acceptedFiles) {
        setProgress(`Uploading ${completed + 1} of ${total}: ${file.name}`);

        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/files/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            console.error(`Failed to upload ${file.name}:`, data.error);
          }
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
        }

        completed++;
      }

      setUploading(false);
      setProgress("");
      router.refresh();
    },
    [router]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
        isDragActive
          ? "border-white bg-white/10"
          : "border-white/30 hover:border-white/60"
      } ${uploading ? "pointer-events-none opacity-50" : ""}`}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div>
          <p className="text-lg">{progress}</p>
          <div className="mx-auto mt-4 h-1 w-64 overflow-hidden rounded bg-white/20">
            <div className="h-full animate-pulse rounded bg-white" />
          </div>
        </div>
      ) : isDragActive ? (
        <p className="text-lg">Drop files here...</p>
      ) : (
        <div>
          <p className="text-lg">Drag & drop files here, or click to select</p>
          <p className="mt-2 text-sm text-white/50">
            Upload multiple files at once
          </p>
        </div>
      )}
    </div>
  );
}
