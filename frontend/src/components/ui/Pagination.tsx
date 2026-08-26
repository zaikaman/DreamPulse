import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  isLoading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'items',
  isLoading = false,
  className = '',
  style = {},
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page list with ellipsis
  const paginationItems = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (safeCurrentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalPages];
  }, [safeCurrentPage, totalPages]);

  if (totalItems === 0) return null;

  return (
    <div
      className={`dreampulse-pagination-bar ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        padding: '12px 18px',
        borderTop: '1px solid var(--border)',
        background: 'rgba(0, 0, 0, 0.25)',
        ...style,
      }}
    >
      {/* Item Range Counter */}
      <div
        style={{
          fontSize: '12px',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>Showing</span>
        <strong style={{ color: 'var(--foreground)' }}>
          {startItem}–{endItem}
        </strong>
        <span>of</span>
        <strong style={{ color: 'var(--brand-cyan)' }}>{totalItems}</strong>
        <span>{itemLabel}</span>
      </div>

      {/* Controls Group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Page Size Selector */}
        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--muted-foreground)',
            }}
          >
            <span>Rows:</span>
            <div
              style={{
                display: 'flex',
                gap: '2px',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '2px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
              }}
            >
              {pageSizeOptions.map((size) => {
                const isActive = pageSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onPageSizeChange(size)}
                    style={{
                      padding: '2px 7px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      background: isActive ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                      border: isActive ? '1px solid var(--brand-cyan)' : '1px solid transparent',
                      color: isActive ? 'var(--brand-cyan)' : 'var(--muted-foreground)',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontWeight: isActive ? 700 : 400,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Page Navigation Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* First Page */}
          <button
            type="button"
            disabled={safeCurrentPage === 1 || isLoading}
            onClick={() => onPageChange(1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              color: safeCurrentPage === 1 ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)',
              cursor: safeCurrentPage === 1 || isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            title="First Page"
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous Page */}
          <button
            type="button"
            disabled={safeCurrentPage === 1 || isLoading}
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              color: safeCurrentPage === 1 ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)',
              cursor: safeCurrentPage === 1 || isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            title="Previous Page"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Numeric Page Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {paginationItems.map((item, idx) => {
              if (item === '...') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    style={{
                      padding: '0 4px',
                      fontSize: '11px',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ...
                  </span>
                );
              }
              const pageNum = Number(item);
              const isActive = safeCurrentPage === pageNum;
              return (
                <button
                  key={pageNum}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onPageChange(pageNum)}
                  style={{
                    minWidth: '28px',
                    height: '28px',
                    padding: '0 6px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    border: isActive ? '1px solid var(--brand-cyan)' : '1px solid var(--border)',
                    color: isActive ? 'var(--brand-cyan)' : 'var(--foreground)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.7 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Page */}
          <button
            type="button"
            disabled={safeCurrentPage === totalPages || isLoading}
            onClick={() => onPageChange(Math.min(totalPages, safeCurrentPage + 1))}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              color: safeCurrentPage === totalPages ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)',
              cursor: safeCurrentPage === totalPages || isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            title="Next Page"
          >
            <ChevronRight size={14} />
          </button>

          {/* Last Page */}
          <button
            type="button"
            disabled={safeCurrentPage === totalPages || isLoading}
            onClick={() => onPageChange(totalPages)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              color: safeCurrentPage === totalPages ? 'rgba(255, 255, 255, 0.2)' : 'var(--foreground)',
              cursor: safeCurrentPage === totalPages || isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            title="Last Page"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
