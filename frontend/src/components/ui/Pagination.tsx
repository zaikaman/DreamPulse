import React, { useMemo } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline';
import { Button } from './button.js';
import { cn } from '../../lib/utils.js';

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
      style={style}
      className={cn(
        "flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 border-t border-border/40 bg-secondary/10 text-xs font-mono",
        className
      )}
    >
      {/* Item Range Counter */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>Showing</span>
        <strong className="text-foreground font-semibold">
          {startItem}–{endItem}
        </strong>
        <span>of</span>
        <strong className="text-foreground font-semibold">{totalItems}</strong>
        <span>{itemLabel}</span>
      </div>

      {/* Controls Group */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Page Size Selector */}
        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <span>Rows:</span>
            <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-md border border-border/50">
              {pageSizeOptions.map((size) => {
                const isActive = pageSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onPageSizeChange(size)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer",
                      isActive
                        ? "bg-primary text-primary-foreground font-bold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Page Navigation Buttons */}
        <div className="flex items-center gap-1">
          {/* First Page */}
          <Button
            variant="outline"
            size="icon-xs"
            disabled={safeCurrentPage === 1 || isLoading}
            onClick={() => onPageChange(1)}
            title="First Page"
            className="size-7 p-0 border-border/50 bg-secondary/20 hover:bg-secondary/60 disabled:opacity-30"
          >
            <ChevronDoubleLeftIcon className="size-3" />
          </Button>

          {/* Previous Page */}
          <Button
            variant="outline"
            size="icon-xs"
            disabled={safeCurrentPage === 1 || isLoading}
            onClick={() => onPageChange(safeCurrentPage - 1)}
            title="Previous Page"
            className="size-7 p-0 border-border/50 bg-secondary/20 hover:bg-secondary/60 disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-3" />
          </Button>

          {/* Page Numbers */}
          <div className="flex items-center gap-1">
            {paginationItems.map((item, idx) => {
              if (item === '...') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-1 text-muted-foreground/60 text-xs"
                  >
                    …
                  </span>
                );
              }

              const pageNum = item as number;
              const isActive = pageNum === safeCurrentPage;

              return (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    "size-7 flex items-center justify-center rounded-md font-mono text-xs transition-colors cursor-pointer border",
                    isActive
                      ? "bg-primary text-primary-foreground font-bold border-primary shadow-xs"
                      : "bg-secondary/20 border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Page */}
          <Button
            variant="outline"
            size="icon-xs"
            disabled={safeCurrentPage === totalPages || isLoading}
            onClick={() => onPageChange(safeCurrentPage + 1)}
            title="Next Page"
            className="size-7 p-0 border-border/50 bg-secondary/20 hover:bg-secondary/60 disabled:opacity-30"
          >
            <ChevronRightIcon className="size-3" />
          </Button>

          {/* Last Page */}
          <Button
            variant="outline"
            size="icon-xs"
            disabled={safeCurrentPage === totalPages || isLoading}
            onClick={() => onPageChange(totalPages)}
            title="Last Page"
            className="size-7 p-0 border-border/50 bg-secondary/20 hover:bg-secondary/60 disabled:opacity-30"
          >
            <ChevronDoubleRightIcon className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};
