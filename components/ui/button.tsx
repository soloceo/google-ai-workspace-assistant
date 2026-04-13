import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer rounded-[4px] outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--blue)] text-white hover:bg-[var(--blue-hover)] transition-[background-color,color,border-color] duration-[330ms]",
        secondary:
          "bg-white text-[var(--text-body)] border border-[var(--border-medium)] hover:bg-[var(--bg-alt)] transition-[background-color,color,border-color] duration-[330ms] dark:bg-[var(--bg-alt)] dark:hover:bg-[var(--bg-hover)]",
        outline:
          "border border-[var(--border-medium)] bg-transparent text-[var(--text-body)] hover:bg-[var(--bg-alt)] transition-[background-color,color,border-color] duration-[330ms]",
        ghost:
          "text-[var(--text-body)] hover:bg-[var(--bg-alt)] transition-[background-color,color] duration-[330ms]",
        destructive:
          "bg-[var(--danger)] text-white hover:bg-red-700 transition-[background-color,color] duration-[330ms]",
        link:
          "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-sm",
        lg: "h-11 px-6 text-sm",
        icon: "size-9",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
