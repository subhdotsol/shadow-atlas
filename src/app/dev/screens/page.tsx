import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ScreenPreview } from "@/components/screen-preview";

/** Development only: every game screen with a fixed match state (see screen-preview.tsx). */
export default function ScreensPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <ScreenPreview />
    </Suspense>
  );
}
