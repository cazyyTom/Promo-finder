import { AlertCircle, RotateCcw } from "lucide-react";
export function ErrorCard({
  message,
  onRetry,
  title = "Something needs attention",
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="error-card" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button className="text-button" onClick={onRetry}>
          <RotateCcw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
