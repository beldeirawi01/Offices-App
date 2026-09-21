interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="btn-ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next →
      </button>
    </div>
  );
}
