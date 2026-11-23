import { DashboardSkeleton } from "@/components/ui/page-skeletons";

export default function StorefrontLoading() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <DashboardSkeleton />
    </div>
  );
}
