/**
 * Lean, theme-aware UI primitives built on radix-ui.
 * Every component reads CSS variables from app.css — no hardcoded colors.
 */
import * as React from 'react';
import { Tabs as RTabs, Select as RSelect, Tooltip as RTooltip } from 'radix-ui';
import CheckIcon from 'lucide-react/dist/esm/icons/check';
import ChevronDownIcon from 'lucide-react/dist/esm/icons/chevron-down';
import { cn } from '../lib/cn.js';

// ---- Button ----
type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'icon';
const buttonVariants: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border bg-transparent hover:bg-accent text-foreground',
  ghost: 'bg-transparent hover:bg-accent text-foreground',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  icon: 'h-8 w-8',
};
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(({ className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-md font-medium cursor-pointer',
      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:pointer-events-none disabled:opacity-50',
      buttonVariants[variant], buttonSizes[size], className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

// ---- Input ----
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-border bg-input/60 px-3 text-sm text-foreground',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

// ---- Label ----
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-xs font-medium text-muted-foreground', className)} {...props} />;
}

// ---- Badge ----
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}

// ---- Card ----
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-card', className)} {...props} />;
}

// ---- Tabs ----
export const Tabs = RTabs.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof RTabs.List>) {
  return (
    <RTabs.List
      className={cn('inline-flex items-center gap-1 border-b border-border', className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        'px-3.5 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px cursor-pointer',
        'transition-colors hover:text-foreground focus-visible:outline-none',
        'data-[state=active]:text-primary data-[state=active]:border-primary',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = RTabs.Content;

// ---- Select ----
export const Select = RSelect.Root;
export const SelectGroup = RSelect.Group;

/** Reflects the selected value; a shrinkable flex box so its label can truncate. */
export function SelectValue({ className, ...props }: React.ComponentProps<typeof RSelect.Value>) {
  return <RSelect.Value className={cn('flex min-w-0 items-center', className)} {...props} />;
}

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof RSelect.Trigger>) {
  return (
    <RSelect.Trigger
      className={cn(
        'inline-flex h-9 min-w-[10rem] items-center justify-between gap-2 rounded-md border border-border bg-input/60 px-3 text-sm text-foreground cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-ring data-[placeholder]:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {/* Shrinkable value box so a long label truncates instead of pushing the chevron. */}
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
      <RSelect.Icon><ChevronDownIcon className="size-4 opacity-60" /></RSelect.Icon>
    </RSelect.Trigger>
  );
}
export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof RSelect.Content>) {
  return (
    <RSelect.Portal>
      <RSelect.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-80 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl',
          className,
        )}
        {...props}
      >
        <RSelect.Viewport className="p-1">{children}</RSelect.Viewport>
      </RSelect.Content>
    </RSelect.Portal>
  );
}
export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof RSelect.Item>) {
  return (
    <RSelect.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 pr-7 text-sm outline-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        className,
      )}
      {...props}
    >
      <RSelect.ItemText>{children}</RSelect.ItemText>
      <RSelect.ItemIndicator className="absolute right-2"><CheckIcon className="size-4" /></RSelect.ItemIndicator>
    </RSelect.Item>
  );
}
export function SelectLabel({ className, ...props }: React.ComponentProps<typeof RSelect.Label>) {
  return <RSelect.Label className={cn('px-2 py-1 text-xs text-muted-foreground', className)} {...props} />;
}

// ---- Tooltip ----
export const TooltipProvider = RTooltip.Provider;
export const Tooltip = RTooltip.Root;
export const TooltipTrigger = RTooltip.Trigger;
export function TooltipContent({ className, ...props }: React.ComponentProps<typeof RTooltip.Content>) {
  return (
    <RTooltip.Portal>
      <RTooltip.Content
        sideOffset={5}
        className={cn(
          'z-50 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg',
          className,
        )}
        {...props}
      />
    </RTooltip.Portal>
  );
}
