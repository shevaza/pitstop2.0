import type { ReactNode } from "react";
import styles from "./ModuleHeader.module.css";

export default function ModuleHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <header className={`${styles.header} ${className}`}>{children}</header>;
}
