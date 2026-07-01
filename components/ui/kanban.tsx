"use client";

import {
  DragOverlay,
  DndContext,
  rectIntersection,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KanbanDragState = {
  activeId: string | null;
  hasOverlay: boolean;
};

const KanbanDragContext = createContext<KanbanDragState>({
  activeId: null,
  hasOverlay: false,
});

function useKanbanDragState() {
  return useContext(KanbanDragContext);
}

export type KanbanBoardProps = {
  id: string;
  children: ReactNode;
  className?: string;
};

export function KanbanBoard({ id, children, className }: KanbanBoardProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <section
      className={cn(
        "flex h-full min-h-96 w-full min-w-0 flex-col gap-3 rounded-lg border bg-muted/60 p-3 transition-colors duration-150",
        isOver ? "border-primary/40 bg-primary-muted" : "border-border",
        className,
      )}
      ref={setNodeRef}
    >
      {children}
    </section>
  );
}

export type KanbanCardProps = {
  id: string;
  name: string;
  index: number;
  parent: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
};

export function KanbanCard({
  id,
  name,
  index,
  parent,
  children,
  className,
  disabled,
}: KanbanCardProps) {
  const { activeId, hasOverlay } = useKanbanDragState();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { index, parent },
    disabled,
  });
  const isOverlaySource = hasOverlay && activeId === id && isDragging;

  return (
    <Card
      className={cn(
        "touch-manipulation rounded-md p-3 shadow-sm transition-[box-shadow,border-color] duration-150",
        disabled ? "cursor-default" : "cursor-grab hover:border-primary/30 hover:shadow-md",
        isDragging && "cursor-grabbing border-primary/50 shadow-lg",
        isOverlaySource && "opacity-40",
        className,
      )}
      style={{
        transform:
          transform && !isOverlaySource
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : "none",
      }}
      {...listeners}
      {...attributes}
      ref={setNodeRef}
    >
      {children ?? <p className="m-0 text-sm font-medium">{name}</p>}
    </Card>
  );
}

export type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
};

export function KanbanCards({ children, className }: KanbanCardsProps) {
  return <div className={cn("flex flex-1 flex-col gap-2 overflow-y-auto", className)}>{children}</div>;
}

export type KanbanHeaderProps = {
  name: string;
  count: number;
  subtitle?: string;
  indicatorClassName?: string;
  className?: string;
};

export function KanbanHeader({ name, count, subtitle, indicatorClassName, className }: KanbanHeaderProps) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-1 px-0.5 pb-2", className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("size-2 shrink-0 rounded-full bg-border", indicatorClassName)} />
          <p className="m-0 truncate text-sm font-semibold tracking-tight">{name}</p>
        </div>
        <span className="shrink-0 rounded-full border bg-background px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
          {count}
        </span>
      </div>
      {subtitle ? <p className="m-0 truncate pl-4 text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

export type KanbanProviderProps = {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
  renderOverlay?: (activeId: string) => ReactNode;
};

export function KanbanProvider({
  children,
  onDragEnd,
  className,
  renderOverlay,
}: KanbanProviderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const contextValue = useMemo(
    () => ({ activeId, hasOverlay: Boolean(renderOverlay) }),
    [activeId, renderOverlay],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    onDragEnd(event);
    setActiveId(null);
  }

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
    >
      <KanbanDragContext.Provider value={contextValue}>
        <div
          className={cn(
            "grid w-full min-w-0 auto-cols-[minmax(272px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2",
            className,
          )}
        >
          {children}
        </div>
      </KanbanDragContext.Provider>
      <DragOverlay
        adjustScale={false}
        dropAnimation={{
          duration: 180,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeId && renderOverlay ? (
          <div className="rotate-2 opacity-95">{renderOverlay(activeId)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
