import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "relative overflow-hidden bg-[linear-gradient(135deg,#183a63_0%,#1264c8_52%,#00a6c8_100%)] text-white shadow-[0_10px_22px_rgba(18,100,200,0.24)] hover:translate-y-[-1px] hover:shadow-[0_14px_28px_rgba(18,100,200,0.3)] active:translate-y-0",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background/90 shadow-sm shadow-slate-900/5 hover:border-accent/40 hover:bg-muted hover:text-ink hover:shadow-md",
        // Nút phụ trên thanh công cụ / đầu trang (Hướng dẫn, Xuất, Nhập, Đồng bộ…).
        // Gradient tuỳ biến không được cầu nối dark-mode trong globals.css bắt được
        // nên phải khai báo biến thể tối ngay tại đây, nếu không nền trắng sẽ chói
        // trên trang nền tối.
        soft:
          "border border-sky-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#eef7ff_100%)] font-semibold text-navy shadow-[0_8px_18px_rgba(30,64,175,0.12)] hover:border-sky-300 hover:text-accent dark:border-sky-400/25 dark:bg-[linear-gradient(135deg,hsl(222_22%_16%)_0%,hsl(217_30%_21%)_100%)] dark:shadow-[0_8px_18px_rgba(0,0,0,0.38)] dark:hover:border-sky-400/45",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        ghost: "hover:bg-muted hover:text-ink",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        // Cỡ chuẩn cho hàng nút đầu trang và thanh công cụ ngay dưới nó — mọi
        // trang dùng chung để các nút không so le chiều cao và độ bo góc.
        toolbar: "h-9 rounded-xl px-3",
        "toolbar-icon": "h-9 w-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
