import { Loader } from '@/components/ui/Loader';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center full-height gap-md">
      <Loader size="lg" />
      <p className="text-secondary">Loading board...</p>
    </div>
  );
}
