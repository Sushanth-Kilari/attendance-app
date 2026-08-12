"use client";

export function DeleteButton({
  label = "Delete",
  confirmText = "Delete this? This can't be undone.",
}: {
  label?: string;
  confirmText?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="text-red-700 underline underline-offset-4 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
    >
      {label}
    </button>
  );
}
