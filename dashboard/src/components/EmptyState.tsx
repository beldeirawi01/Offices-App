import { ReactNode } from "react";
import { InboxEmptyIcon } from "./Icons";

export default function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <InboxEmptyIcon className="empty-state-icon" />
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}
